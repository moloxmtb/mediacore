-- ============================================================
--  APROBACIÓN DE CONTENIDO
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Piezas (imagen + texto) por cliente y período. Color Media las crea como
--  propuesta; el cliente aprueba o pide cambios (escritura MUY acotada). Cada
--  corrección es una versión nueva (historial intacto). RLS estricto: un
--  cliente solo toca contenido de su empresa. Incluye el bucket de Storage y
--  sus políticas.
-- ============================================================

-- ---------- Tipos ----------
do $$ begin create type content_period_kind as enum ('mensual','quincenal','semanal'); exception when duplicate_object then null; end $$;
do $$ begin create type content_status as enum ('borrador','propuesta','aprobada_cliente','cambios_solicitados','aprobada','rechazada'); exception when duplicate_object then null; end $$;
do $$ begin create type review_kind as enum ('aprobacion','cambios','comentario','confirmacion','devolucion'); exception when duplicate_object then null; end $$;
do $$ begin create type review_actor as enum ('client','admin'); exception when duplicate_object then null; end $$;

-- ---------- Tablas ----------
create table if not exists content_periods (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  kind       content_period_kind not null,
  label      text not null,               -- "Julio 2026" / "Semana 28"
  start_date date,
  end_date   date,
  published  boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists content_pieces (
  id                 uuid primary key default gen_random_uuid(),
  period_id          uuid not null references content_periods(id) on delete cascade,
  client_id          uuid not null references clients(id) on delete cascade,  -- denormalizado (RLS)
  title              text not null,        -- nombre interno de la pieza
  sort_order         smallint not null default 0,
  current_version_id uuid,                 -- FK se agrega abajo (dependencia circular)
  status             content_status not null default 'borrador',
  created_at         timestamptz not null default now()
);

create table if not exists content_versions (
  id             uuid primary key default gen_random_uuid(),
  piece_id       uuid not null references content_pieces(id) on delete cascade,
  version_number smallint not null,
  image_path     text,                     -- ruta en el bucket 'contenido'
  body           text,                     -- copy del post
  note           text,                     -- qué cambió
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (piece_id, version_number)
);

do $$ begin
  alter table content_pieces
    add constraint content_pieces_current_version_fk
    foreign key (current_version_id) references content_versions(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists content_reviews (
  id         uuid primary key default gen_random_uuid(),
  piece_id   uuid not null references content_pieces(id) on delete cascade,
  version_id uuid references content_versions(id) on delete set null,
  actor      review_actor not null,
  kind       review_kind not null,
  comment    text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists content_periods_client_idx on content_periods (client_id, created_at desc);
create index if not exists content_pieces_period_idx   on content_pieces (period_id, sort_order);
create index if not exists content_pieces_client_idx   on content_pieces (client_id);
create index if not exists content_versions_piece_idx  on content_versions (piece_id, version_number desc);
create index if not exists content_reviews_piece_idx   on content_reviews (piece_id, created_at);

-- ---------- Trigger: acción del cliente -> estado de la pieza ----------
-- El cliente solo INSERTA una revisión; este trigger (SECURITY DEFINER) traduce
-- su aprobación / pedido de cambios al estado, y solo desde 'propuesta'. Así el
-- cliente no necesita ningún UPDATE sobre content_pieces.
create or replace function apply_client_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actor = 'client' and new.kind in ('aprobacion','cambios') then
    update content_pieces
    set status = case when new.kind = 'aprobacion' then 'aprobada_cliente'::content_status
                      else 'cambios_solicitados'::content_status end
    where id = new.piece_id and status = 'propuesta';
  end if;
  return new;
end $$;

drop trigger if exists on_content_review on content_reviews;
create trigger on_content_review after insert on content_reviews
  for each row execute function apply_client_review();

-- ============================================================
--  RLS
-- ============================================================
alter table content_periods  enable row level security;
alter table content_pieces   enable row level security;
alter table content_versions enable row level security;
alter table content_reviews  enable row level security;

-- periods: cliente ve los publicados de su empresa; admin todo.
drop policy if exists "content_periods sel" on content_periods;
create policy "content_periods sel" on content_periods for select
  using (is_admin() or (client_id = auth_client_id() and published));
drop policy if exists "content_periods adm" on content_periods;
create policy "content_periods adm" on content_periods for all
  using (is_admin()) with check (is_admin());

-- pieces: cliente ve las suyas ya publicadas (no borrador); admin todo.
drop policy if exists "content_pieces sel" on content_pieces;
create policy "content_pieces sel" on content_pieces for select
  using (is_admin() or (client_id = auth_client_id() and status <> 'borrador'));
drop policy if exists "content_pieces adm" on content_pieces;
create policy "content_pieces adm" on content_pieces for all
  using (is_admin()) with check (is_admin());

-- versions: cliente ve las de sus piezas publicadas; escribe solo admin.
drop policy if exists "content_versions sel" on content_versions;
create policy "content_versions sel" on content_versions for select
  using (is_admin() or piece_id in (
    select id from content_pieces where client_id = auth_client_id() and status <> 'borrador'));
drop policy if exists "content_versions adm" on content_versions;
create policy "content_versions adm" on content_versions for all
  using (is_admin()) with check (is_admin());

-- reviews: cliente ve las de sus piezas; INSERTA solo como 'client', sobre sus
-- piezas, con created_by = su uid. No puede editar ni borrar. Admin todo.
drop policy if exists "content_reviews sel" on content_reviews;
create policy "content_reviews sel" on content_reviews for select
  using (is_admin() or piece_id in (
    select id from content_pieces where client_id = auth_client_id()));
drop policy if exists "content_reviews ins" on content_reviews;
create policy "content_reviews ins" on content_reviews for insert
  with check (
    is_admin() or (
      actor = 'client'
      and created_by = auth.uid()
      and piece_id in (select id from content_pieces where client_id = auth_client_id())
    )
  );
drop policy if exists "content_reviews adm" on content_reviews;
create policy "content_reviews adm" on content_reviews for all
  using (is_admin()) with check (is_admin());

grant all on content_periods, content_pieces, content_versions, content_reviews to service_role;

-- ============================================================
--  STORAGE: bucket privado 'contenido' + políticas
-- ============================================================
insert into storage.buckets (id, name, public)
values ('contenido','contenido', false)
on conflict (id) do nothing;

-- Lectura: admin, o el dueño (primera carpeta de la ruta = su client_id).
drop policy if exists "contenido read" on storage.objects;
create policy "contenido read" on storage.objects for select
  using (
    bucket_id = 'contenido' and (
      is_admin() or (storage.foldername(name))[1] = auth_client_id()::text
    )
  );

-- Escritura (subir/reemplazar/borrar): solo admin.
drop policy if exists "contenido write" on storage.objects;
create policy "contenido write" on storage.objects for all
  using (bucket_id = 'contenido' and is_admin())
  with check (bucket_id = 'contenido' and is_admin());
