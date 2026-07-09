-- ============================================================
--  PIEZA 3 · FASE A — Minutas de reunión + pendientes + bucket
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Una reunión durable = calendar_event (kind='reunion'); NO se remodela.
--  Le cuelga una minuta 1:1 (meeting_minutes) y pendientes estructurados
--  (meeting_minute_items). El estado 'realizada/por documentar' se DERIVA en
--  lectura. client_id va DENORMALIZADO (inmutable) para RLS directa con
--  staff_sees_client.
--
--  VISIBILIDAD AL CLIENTE: NO se copia el visible_to_client del evento (eso se
--  podría desincronizar). Fuente única = calendar_events.visible_to_client,
--  leída al vuelo por funciones security definer. El cliente ve la minuta solo
--  si la reunión es visible_to_client=true Y es de su empresa (owner/content).
-- ============================================================

-- ---------- Minuta 1:1 de la reunión ----------
create table if not exists meeting_minutes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null unique references calendar_events(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,   -- denorm (inmutable) para RLS
  realizada   boolean not null default false,
  minuta_path text,                       -- ruta en bucket 'minutas' (<client_id>/<event_id>.pdf)
  notas       text,
  created_by  uuid references profiles(id) on delete set null,          -- quién documentó (trazabilidad)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists meeting_minutes_client_idx on meeting_minutes (client_id);

-- ---------- Pendientes estructurados (filas) ----------
-- promoted_task_id deja LISTO el puente a Pieza 2 (tareas) sin cablearlo ahora:
-- on delete set null → borrar la tarea promovida no borra el pendiente.
create table if not exists meeting_minute_items (
  id               uuid primary key default gen_random_uuid(),
  minute_id        uuid not null references meeting_minutes(id) on delete cascade,
  client_id        uuid not null references clients(id) on delete cascade,  -- denorm (inmutable) para RLS
  texto            text not null,
  hecho            boolean not null default false,
  sort_order       smallint not null default 0,
  promoted_task_id uuid references tasks(id) on delete set null,           -- puente Pieza 2 (sin cablear)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists meeting_minute_items_minute_idx on meeting_minute_items (minute_id, sort_order);
create index if not exists meeting_minute_items_client_idx on meeting_minute_items (client_id);

-- ============================================================
--  Visibilidad al cliente: leída EN VIVO del evento (fuente única).
--  security definer → esquiva la RLS del inner read y evita recursión; solo
--  expone un booleano. No hay copia que se pueda desincronizar.
-- ============================================================
create or replace function event_visible_to_client(ev uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select visible_to_client from calendar_events where id = ev), false) $$;

-- Para los ítems: sube por minute_id → event_id → flag del evento.
create or replace function minute_event_visible(m uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select e.visible_to_client
    from meeting_minutes mm
    join calendar_events e on e.id = mm.event_id
    where mm.id = m
  ), false)
$$;

-- Para el OBJETO de Storage: el path es '<client_id>/<event_id>.pdf'; se parsea
-- el event_id del nombre del archivo y se deriva la visibilidad del evento. Cast
-- protegido: un path malformado devuelve false (no rompe la política).
create or replace function path_event_visible(objname text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare ev uuid;
begin
  begin
    ev := split_part(storage.filename(objname), '.', 1)::uuid;
  exception when others then
    return false;
  end;
  return coalesce((select visible_to_client from calendar_events where id = ev), false);
end $$;

-- ============================================================
--  RLS — staff por asignación ve/escribe lo de sus clientes; el cliente
--  owner/content LEE lo suyo SOLO si la reunión es visible (finanzas NO).
-- ============================================================
alter table meeting_minutes enable row level security;
alter table meeting_minute_items enable row level security;

-- meeting_minutes: lectura staff, o cliente owner/content de su empresa con reunión visible.
drop policy if exists "minutes sel" on meeting_minutes;
create policy "minutes sel" on meeting_minutes for select using (
  staff_sees_client(client_id)
  or (client_id = auth_client_id()
      and auth_client_role() in ('owner','content')
      and event_visible_to_client(event_id)));

-- meeting_minutes: escritura (marcar realizada / minuta_path / notas) solo staff.
drop policy if exists "minutes write" on meeting_minutes;
create policy "minutes write" on meeting_minutes for all
  using (staff_sees_client(client_id))
  with check (staff_sees_client(client_id));

-- meeting_minute_items: mismo criterio; la visibilidad se resuelve por la minuta.
drop policy if exists "minute_items sel" on meeting_minute_items;
create policy "minute_items sel" on meeting_minute_items for select using (
  staff_sees_client(client_id)
  or (client_id = auth_client_id()
      and auth_client_role() in ('owner','content')
      and minute_event_visible(minute_id)));

drop policy if exists "minute_items write" on meeting_minute_items;
create policy "minute_items write" on meeting_minute_items for all
  using (staff_sees_client(client_id))
  with check (staff_sees_client(client_id));

grant all on meeting_minutes to service_role;
grant all on meeting_minute_items to service_role;

-- ============================================================
--  STORAGE: bucket privado 'minutas' (PDF)
--  Espejo de 'contenido' post-flip (inlinea is_owner()/asignado, compara la
--  carpeta raíz POR TEXTO sin castear a uuid). Lectura del cliente = owner/
--  CONTENT (la minuta es mundo contenido, NO financiero) Y solo si la reunión
--  es visible (mismo blindaje que la fila, derivado del evento). Staff escribe.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('minutas','minutas', false)
on conflict (id) do nothing;

-- Lectura: staff (owner o asignado) del cliente dueño de la carpeta, o el
-- cliente owner/content de su propia empresa SI la reunión es visible. Finanzas
-- queda fuera; una reunión interna no filtra su PDF.
drop policy if exists "minutas read" on storage.objects;
create policy "minutas read" on storage.objects for select using (
  bucket_id = 'minutas' and (
    is_owner()
    or (storage.foldername(name))[1] in (
      select client_id::text from admin_assignments where member_id = auth.uid())
    or ((storage.foldername(name))[1] = auth_client_id()::text
        and auth_client_role() in ('owner','content')
        and path_event_visible(name))
  ));

-- Escritura (subir/reemplazar/borrar): solo staff (owner o asignado) del cliente.
drop policy if exists "minutas write" on storage.objects;
create policy "minutas write" on storage.objects for all
  using (bucket_id = 'minutas' and (
    is_owner()
    or (storage.foldername(name))[1] in (
      select client_id::text from admin_assignments where member_id = auth.uid())
  ))
  with check (bucket_id = 'minutas' and (
    is_owner()
    or (storage.foldername(name))[1] in (
      select client_id::text from admin_assignments where member_id = auth.uid())
  ));
