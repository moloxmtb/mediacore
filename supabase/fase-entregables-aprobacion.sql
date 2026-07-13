-- ============================================================
--  ENTREGABLES · Aprobación del cliente (Opción B — flujo propio, separado
--  de contenido). FASE 1: modelo + RLS de fila + Storage de dos niveles.
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Bloqueo de archivo en DOS NIVELES DE DATOS (como minutas):
--   1) fila: deliverable_files (RLS la oculta al cliente en borrador)
--   2) objeto: bucket 'entregables' (política lo bloquea en borrador)
--  El cliente ve la fila de deliverables (título/tipo/estado) pero NI la
--  referencia del archivo NI el objeto hasta que pase a 'enviado'.
-- ============================================================

-- ---------- Enum del ciclo de aprobación (NUEVO, separado del status viejo) ----------
do $$ begin
  create type deliverable_approval as enum
    ('borrador','enviado','aprobado','cambios_solicitados','rechazado');
exception when duplicate_object then null; end $$;

-- ---------- Campos nuevos en deliverables ----------
alter table deliverables
  add column if not exists approval_status deliverable_approval not null default 'borrador',
  add column if not exists sent_at        timestamptz,                                    -- auditoría: cuándo se envió
  add column if not exists client_comment text,                                           -- respuesta del cliente (opcional)
  add column if not exists responded_by   uuid references profiles(id) on delete set null,-- quién respondió
  add column if not exists responded_at   timestamptz;                                    -- cuándo respondió

-- Backfill: TODOS los entregables viejos quedan en 'borrador', sin excepción —
-- el `not null default 'borrador'` de arriba ya lo hace al agregar la columna, así
-- que no hace falta ningún UPDATE. Nada viejo se activa ni se le muestra al
-- cliente automáticamente; el staff decide cuáles enviar a revisión, uno por uno.
-- (No hay UPDATE aquí a propósito: evita cualquier riesgo de re-run pisando
--  respuestas ya hechas.)

-- ---------- Tabla 1:1 del archivo (referencia gateada por RLS de fila) ----------
create table if not exists deliverable_files (
  deliverable_id uuid primary key references deliverables(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete cascade,  -- denorm para RLS
  path           text not null,                                           -- objeto en bucket 'entregables'
  file_name      text,
  file_mime      text,
  updated_at     timestamptz not null default now()
);
create index if not exists deliverable_files_client_idx on deliverable_files (client_id);
alter table deliverable_files enable row level security;

-- Fuente única: ¿el entregable está enviado (no borrador) y visible? (security definer)
create or replace function deliverable_sent_visible(did uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from deliverables d
  where d.id = did and d.visible_to_client and d.approval_status <> 'borrador') $$;

-- RLS de deliverable_files: staff (por asignación) siempre; cliente owner/content
-- SOLO si el entregable ya está enviado+visible. → NIVEL FILA del bloqueo.
drop policy if exists "deliv_files sel" on deliverable_files;
create policy "deliv_files sel" on deliverable_files for select using (
  staff_sees_client(client_id)
  or (client_id = auth_client_id()
      and auth_client_role() in ('owner','content')
      and deliverable_sent_visible(deliverable_id)));

drop policy if exists "deliv_files write" on deliverable_files;
create policy "deliv_files write" on deliverable_files for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

grant all on deliverable_files to service_role;

-- ---------- Respuesta del cliente: SECURITY DEFINER, columna-segura ----------
-- El cliente NO hace UPDATE directo (así no toca título/archivo aprovechando el
-- mismo UPDATE). Llama esta función, que valida: SU proyecto + rol owner/content
-- + estado 'enviado', y setea SOLO los campos de respuesta.
create or replace function deliverable_client_respond(p_id uuid, p_decision deliverable_approval, p_comment text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_decision not in ('aprobado','cambios_solicitados','rechazado') then
    raise exception 'decisión inválida: %', p_decision;
  end if;
  update deliverables d
     set approval_status = p_decision,
         client_comment  = nullif(btrim(coalesce(p_comment,'')), ''),
         responded_by    = auth.uid(),
         responded_at    = now()
   where d.id = p_id
     and d.approval_status = 'enviado'                 -- solo se responde lo enviado
     and d.visible_to_client
     and auth_client_role() in ('owner','content')
     and d.project_id in (select id from projects where client_id = auth_client_id());
  get diagnostics n = row_count;
  return n > 0;   -- false si no calzó (ajeno / borrador / rol / no visible)
end $$;
revoke all on function deliverable_client_respond(uuid, deliverable_approval, text) from public;
grant execute on function deliverable_client_respond(uuid, deliverable_approval, text) to authenticated;

-- ---------- STORAGE: bucket privado 'entregables' + gate de OBJETO ----------
insert into storage.buckets (id, name, public) values ('entregables','entregables', false)
on conflict (id) do nothing;

-- Carpeta raíz = client_id (alcance de staff). Cast protegido.
create or replace function entregables_folder_client(objname text)
returns uuid language plpgsql immutable set search_path = public as $$
declare cid uuid;
begin
  begin cid := (storage.foldername(objname))[1]::uuid; exception when others then return null; end;
  return cid;
end $$;

-- ¿El entregable dueño de este objeto está enviado+visible? El nombre es
-- '<client_id>/<deliverable_id>'; parseamos el deliverable_id.
create or replace function deliverable_is_sent(objname text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare did uuid;
begin
  begin did := split_part(storage.filename(objname), '.', 1)::uuid; exception when others then return false; end;
  return deliverable_sent_visible(did);
end $$;

-- Lectura: staff (owner o asignado, vía staff_sees_client security definer —NO el
-- subquery inline a admin_assignments, lección del bug de minutas); o cliente
-- owner/content de su empresa SOLO si el entregable está enviado. → NIVEL OBJETO.
drop policy if exists "entregables read" on storage.objects;
create policy "entregables read" on storage.objects for select using (
  bucket_id = 'entregables' and (
    staff_sees_client(entregables_folder_client(name))
    or ((storage.foldername(name))[1] = auth_client_id()::text
        and auth_client_role() in ('owner','content')
        and deliverable_is_sent(name))));

-- Escritura (subir/reemplazar/borrar): solo staff del cliente.
drop policy if exists "entregables write" on storage.objects;
create policy "entregables write" on storage.objects for all
  using (bucket_id = 'entregables' and staff_sees_client(entregables_folder_client(name)))
  with check (bucket_id = 'entregables' and staff_sees_client(entregables_folder_client(name)));
