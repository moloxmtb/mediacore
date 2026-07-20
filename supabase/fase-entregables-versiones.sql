-- ============================================================
--  ENTREGABLES · Versiones + conversación (historial unificado)
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  PROBLEMA QUE RESUELVE: el flujo viejo era de una sola ronda y DESTRUÍA
--  información — cada "enviar" ponía client_comment/responded_* en null, cada
--  reemplazo sobrescribía el archivo (ruta estable + upsert), el cliente solo
--  podía hablar una vez y el admin no podía responder.
--
--  FORMA: tablas GEMELAS de las de contenido (content_versions/content_reviews),
--  no compartidas. Las de contenido están vivas, con trigger y RLS propios; una
--  RLS polimórfica se volvería turbia justo donde la queremos calcable.
--
--  RLS: calcada del predicado de lectura de ENTREGABLES (staff_sees_client +
--  deliverable_sent_visible), NO del de contenido (que usa is_admin() y sería
--  más laxo post-flip de roles).
--
--  NADA SE SOBRESCRIBE: archivos con ruta propia por versión; textos y
--  comentarios son filas nuevas.
-- ============================================================

-- ---------- Tipo del historial ----------
--  version     → el staff subió una versión nueva del archivo
--  texto       → el staff editó título/descripción (queda el texto de ese momento)
--  comentario  → mensaje SIN decisión, de cualquiera de los dos lados
--  aprobacion / cambios / rechazo → decisión del cliente
do $$ begin
  create type deliverable_review_kind as enum
    ('version','texto','comentario','aprobacion','cambios','rechazo');
exception when duplicate_object then null; end $$;

-- `review_actor` ('client'|'admin') ya existe desde contenido: es un enum
-- genérico de dos valores, reusarlo NO acopla las tablas.

-- ---------- Versiones del archivo ----------
create table if not exists deliverable_versions (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete cascade, -- denorm (RLS)
  version_number smallint not null,
  file_path      text not null,        -- ruta PROPIA de esta versión (nunca se pisa)
  file_name      text,
  file_mime      text,
  note           text,                 -- "qué cambió"
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (deliverable_id, version_number)
);
create index if not exists deliverable_versions_deliv_idx
  on deliverable_versions (deliverable_id, version_number desc);
create index if not exists deliverable_versions_client_idx
  on deliverable_versions (client_id);

-- Puntero a la versión vigente (dependencia circular → FK aparte).
alter table deliverables
  add column if not exists current_version_id uuid;
do $$ begin
  alter table deliverables
    add constraint deliverables_current_version_fk
    foreign key (current_version_id) references deliverable_versions(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- Historial unificado (append-only) ----------
create table if not exists deliverable_reviews (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete cascade, -- denorm (RLS)
  version_id     uuid references deliverable_versions(id) on delete set null,
  actor          review_actor not null,
  kind           deliverable_review_kind not null,
  body           text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists deliverable_reviews_deliv_idx
  on deliverable_reviews (deliverable_id, created_at);
create index if not exists deliverable_reviews_client_idx
  on deliverable_reviews (client_id);

-- ---------- Gate auxiliar: ¿está esperando respuesta del cliente? ----------
-- Las DECISIONES solo se aceptan sobre un entregable 'enviado'. Los COMENTARIOS
-- se aceptan mientras esté enviado+visible (así el cliente no queda mudo tras
-- responder). `deliverable_sent_visible` ya existe (fase-entregables-aprobacion).
create or replace function deliverable_awaiting_response(did uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from deliverables d
  where d.id = did and d.visible_to_client and d.approval_status = 'enviado') $$;

-- ============================================================
--  RLS — calcada del predicado de entregables
-- ============================================================
alter table deliverable_versions enable row level security;
alter table deliverable_reviews  enable row level security;

-- Versiones: staff de ese cliente siempre; cliente owner/content solo si el
-- entregable ya está enviado+visible (mismo gate que deliverable_files). El
-- cliente ve TODAS las versiones de un entregable ya enviado (las anteriores
-- son descargables, por diseño).
drop policy if exists "deliv_versions sel" on deliverable_versions;
create policy "deliv_versions sel" on deliverable_versions for select using (
  staff_sees_client(client_id)
  or (client_id = auth_client_id()
      and auth_client_role() in ('owner','content')
      and deliverable_sent_visible(deliverable_id)));

drop policy if exists "deliv_versions write" on deliverable_versions;
create policy "deliv_versions write" on deliverable_versions for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

-- Historial: mismo predicado de lectura.
drop policy if exists "deliv_reviews sel" on deliverable_reviews;
create policy "deliv_reviews sel" on deliverable_reviews for select using (
  staff_sees_client(client_id)
  or (client_id = auth_client_id()
      and auth_client_role() in ('owner','content')
      and deliverable_sent_visible(deliverable_id)));

-- Escritura del CLIENTE: solo filas suyas (actor='client', created_by = él), de
-- su empresa, y acotadas por tipo:
--   · comentario                    → mientras esté enviado+visible
--   · aprobacion/cambios/rechazo    → solo si está 'enviado' (esperando respuesta)
-- NUNCA puede escribir 'version' ni 'texto' (son eventos del staff).
drop policy if exists "deliv_reviews ins cliente" on deliverable_reviews;
create policy "deliv_reviews ins cliente" on deliverable_reviews for insert
  with check (
    actor = 'client'
    and created_by = auth.uid()
    and client_id = auth_client_id()
    and auth_client_role() in ('owner','content')
    and (
      (kind = 'comentario' and deliverable_sent_visible(deliverable_id))
      or (kind in ('aprobacion','cambios','rechazo') and deliverable_awaiting_response(deliverable_id))
    ));

-- Escritura del STAFF: cualquier tipo, sobre sus clientes.
drop policy if exists "deliv_reviews staff" on deliverable_reviews;
create policy "deliv_reviews staff" on deliverable_reviews for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

grant all on deliverable_versions, deliverable_reviews to service_role;

-- ============================================================
--  Trigger: la decisión del cliente se TRADUCE a estado
--  (mismo patrón que apply_client_review en contenido: el cliente nunca hace
--   UPDATE de estado; inserta su fila y el trigger la aplica).
-- ============================================================
create or replace function apply_client_deliverable_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actor = 'client' and new.kind in ('aprobacion','cambios','rechazo') then
    update deliverables
       set approval_status = case new.kind
             when 'aprobacion' then 'aprobado'::deliverable_approval
             when 'cambios'    then 'cambios_solicitados'::deliverable_approval
             else                   'rechazado'::deliverable_approval end,
           -- client_comment/responded_* quedan como CACHÉ de la última respuesta
           -- (los lee el motor de correo). La fuente de verdad es el historial.
           client_comment = nullif(btrim(coalesce(new.body,'')), ''),
           responded_by   = new.created_by,
           responded_at   = new.created_at
     where id = new.deliverable_id
       and approval_status = 'enviado';   -- solo se decide sobre lo enviado
  end if;
  return new;
end $$;

drop trigger if exists on_deliverable_review on deliverable_reviews;
create trigger on_deliverable_review after insert on deliverable_reviews
  for each row execute function apply_client_deliverable_review();

-- ============================================================
--  STORAGE — la ruta ahora es POR VERSIÓN
--  Nueva:  <client_id>/<deliverable_id>/<version_id>
--  Legacy: <client_id>/<deliverable_id>          (los archivos ya subidos)
--  La política debe resolver el deliverable_id en AMBAS formas, o la migración
--  dejaría inaccesibles los archivos actuales.
-- ============================================================
create or replace function entregables_deliverable_of(objname text)
returns uuid language plpgsql stable set search_path = public as $$
declare parts text[]; did uuid;
begin
  parts := storage.foldername(objname);
  -- Forma nueva: el deliverable_id es la 2ª carpeta.
  if coalesce(array_length(parts, 1), 0) >= 2 then
    begin did := parts[2]::uuid; return did; exception when others then return null; end;
  end if;
  -- Forma legacy: el deliverable_id es el nombre del archivo.
  begin did := split_part(storage.filename(objname), '.', 1)::uuid; return did;
  exception when others then return null; end;
end $$;

-- Lectura: staff del cliente (carpeta raíz), o cliente owner/content de su
-- empresa si el entregable está enviado+visible. Reemplaza a la política de
-- Fase 1, que solo entendía la forma legacy.
drop policy if exists "entregables read" on storage.objects;
create policy "entregables read" on storage.objects for select using (
  bucket_id = 'entregables' and (
    staff_sees_client(entregables_folder_client(name))
    or ((storage.foldername(name))[1] = auth_client_id()::text
        and auth_client_role() in ('owner','content')
        and deliverable_sent_visible(entregables_deliverable_of(name)))));

-- Escritura: sin cambios (solo staff del cliente dueño de la carpeta raíz).
drop policy if exists "entregables write" on storage.objects;
create policy "entregables write" on storage.objects for all
  using (bucket_id = 'entregables' and staff_sees_client(entregables_folder_client(name)))
  with check (bucket_id = 'entregables' and staff_sees_client(entregables_folder_client(name)));

-- ============================================================
--  MIGRACIÓN DE LO EXISTENTE — no se pierde nada
--  Idempotente: cada bloque se salta si ya existe la fila equivalente.
--  `deliverable_files` NO se borra: queda como estaba (el código deja de
--  escribirla, pero el dato sigue ahí por si hay que auditar).
-- ============================================================

-- 1) Cada entregable CON archivo → su versión 1, apuntando al archivo actual
--    (ruta legacy, que la política de arriba sigue resolviendo).
insert into deliverable_versions (deliverable_id, client_id, version_number, file_path, file_name, file_mime, note, created_at)
select f.deliverable_id, f.client_id, 1, f.path, f.file_name, f.file_mime,
       'Versión inicial', coalesce(f.updated_at, now())
from deliverable_files f
where not exists (
  select 1 from deliverable_versions v where v.deliverable_id = f.deliverable_id);

-- 2) Puntero a la versión vigente.
update deliverables d
   set current_version_id = v.id
  from deliverable_versions v
 where v.deliverable_id = d.id
   and d.current_version_id is null;

-- 3) Esa versión, como primera entrada del historial (para que la conversación
--    empiece donde empezó de verdad). created_by queda null: el dato de quién
--    subió el archivo legacy no existe.
insert into deliverable_reviews (deliverable_id, client_id, version_id, actor, kind, body, created_at)
select v.deliverable_id, v.client_id, v.id, 'admin', 'version', v.note, v.created_at
from deliverable_versions v
where not exists (
  select 1 from deliverable_reviews r
  where r.deliverable_id = v.deliverable_id and r.kind = 'version' and r.version_id = v.id);

-- 4) Cada comentario del cliente que sobrevivió → entrada del historial,
--    conservando responded_at / responded_by. El tipo se deriva del estado en
--    que quedó; si no fue una decisión, entra como 'comentario'.
insert into deliverable_reviews (deliverable_id, client_id, version_id, actor, kind, body, created_by, created_at)
select d.id, p.client_id, d.current_version_id, 'client',
       case d.approval_status
         when 'aprobado'            then 'aprobacion'::deliverable_review_kind
         when 'cambios_solicitados' then 'cambios'::deliverable_review_kind
         when 'rechazado'           then 'rechazo'::deliverable_review_kind
         else 'comentario'::deliverable_review_kind end,
       d.client_comment, d.responded_by, coalesce(d.responded_at, now())
from deliverables d
join projects p on p.id = d.project_id
where nullif(btrim(coalesce(d.client_comment, '')), '') is not null
  and not exists (
    select 1 from deliverable_reviews r
    where r.deliverable_id = d.id and r.actor = 'client');

-- 5) Respuestas SIN comentario (el cliente decidió pero no escribió nada):
--    igual dejan su huella en el historial, con body null.
insert into deliverable_reviews (deliverable_id, client_id, version_id, actor, kind, body, created_by, created_at)
select d.id, p.client_id, d.current_version_id, 'client',
       case d.approval_status
         when 'aprobado'            then 'aprobacion'::deliverable_review_kind
         when 'cambios_solicitados' then 'cambios'::deliverable_review_kind
         else 'rechazo'::deliverable_review_kind end,
       null, d.responded_by, d.responded_at
from deliverables d
join projects p on p.id = d.project_id
where d.responded_at is not null
  and nullif(btrim(coalesce(d.client_comment, '')), '') is null
  and d.approval_status in ('aprobado','cambios_solicitados','rechazado')
  and not exists (
    select 1 from deliverable_reviews r
    where r.deliverable_id = d.id and r.actor = 'client');
