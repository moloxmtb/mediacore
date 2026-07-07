-- ============================================================
--  ROLES INTERNOS — FASE 1: EL FLIP (máximo riesgo)
--  Correr en Supabase → SQL Editor, DESPUÉS de la Fase 0 verificada.
--  Idempotente. Envuelto en transacción: o entra todo, o nada.
--
--  Dos movimientos:
--   (A) is_admin() pasa a significar is_owner() → todas las tablas que hoy dicen
--       is_admin() y NO se editan aquí (finanzas, cartera-write, ficha,
--       estrategia/plan, integraciones, profiles) quedan OWNER-ONLY solas.
--   (B) A las tablas de NEGOCIO se les cambia el branch is_admin() por
--       staff_sees_client(...) — que embebe is_owner() (owner ve/hace todo) y,
--       si no, exige asignación. Toda la lógica de alcance vive ahí.
--
--  Se editan las policies "for all" de negocio (cubren lectura Y escritura en un
--  solo punto) + unos pocos SELECT/UPDATE sueltos. NO se tocan las "sel"
--  de cliente (portal intacto) ni finanzas/cartera/integraciones.
-- ============================================================

begin;

-- ---------- Guarda de seguridad: no dejar ningún admin sin admin_role ----------
-- Si algún role='admin' quedara con admin_role NULL, al redefinir is_admin()
-- perdería acceso. Aborta antes de tocar nada.
do $$ begin
  if exists (select 1 from profiles where role = 'admin' and admin_role is null) then
    raise exception 'Hay admin(s) sin admin_role. Corre el backfill de Fase 0 antes del flip.';
  end if;
end $$;

-- ---------- Resolvers de alcance para tablas sin client_id directo ----------
-- Centralizan el join en un solo lugar (auditable). Ambos delegan en
-- staff_sees_client(), que embebe is_owner() (owner → true).
create or replace function staff_sees_project(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select staff_sees_client((select client_id from projects where id = pid)) $$;

create or replace function staff_sees_piece(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select staff_sees_client((select client_id from content_pieces where id = pid)) $$;

-- ---------- (A) Redefinir is_admin() = is_owner() ----------
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select is_owner() $$;

-- ============================================================
--  (B) Tablas de NEGOCIO: is_admin() → staff_sees_client(...)
-- ============================================================

-- clients: el staff LEE sus clientes asignados (la escritura de cartera sigue
-- owner-only vía "clients: solo admin escribe", que NO se toca).
drop policy if exists "clients: admin ve todo" on clients;
create policy "clients: admin ve todo" on clients for select using (
  staff_sees_client(id) or id = auth_client_id());

-- projects / actions / calendar_events: client_id directo. La policy "for all"
-- cubre SELECT+INSERT+UPDATE+DELETE del staff sobre sus clientes.
drop policy if exists "projects: solo admin escribe" on projects;
create policy "projects: solo admin escribe" on projects for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

drop policy if exists "actions: solo admin escribe" on actions;
create policy "actions: solo admin escribe" on actions for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

drop policy if exists "calendar: solo admin escribe" on calendar_events;
create policy "calendar: solo admin escribe" on calendar_events for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

-- phases / deliverables: sin client_id directo → alcance vía staff_sees_project.
drop policy if exists "phases: solo admin escribe" on phases;
create policy "phases: solo admin escribe" on phases for all
  using (staff_sees_project(project_id)) with check (staff_sees_project(project_id));

drop policy if exists "deliverables: solo admin escribe" on deliverables;
create policy "deliverables: solo admin escribe" on deliverables for all
  using (staff_sees_project(project_id)) with check (staff_sees_project(project_id));

-- contenido: content_periods / content_pieces (client_id directo).
drop policy if exists "content_periods adm" on content_periods;
create policy "content_periods adm" on content_periods for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

drop policy if exists "content_pieces adm" on content_pieces;
create policy "content_pieces adm" on content_pieces for all
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

-- content_versions / content_reviews (vía piece) · content_media (vía version→piece).
drop policy if exists "content_versions adm" on content_versions;
create policy "content_versions adm" on content_versions for all
  using (staff_sees_piece(piece_id)) with check (staff_sees_piece(piece_id));

drop policy if exists "content_reviews adm" on content_reviews;
create policy "content_reviews adm" on content_reviews for all
  using (staff_sees_piece(piece_id)) with check (staff_sees_piece(piece_id));

drop policy if exists "content_media adm" on content_media;
create policy "content_media adm" on content_media for all
  using (version_id in (select id from content_versions where staff_sees_piece(piece_id)))
  with check (version_id in (select id from content_versions where staff_sees_piece(piece_id)));

-- event_attendance: el staff solo LEE (no confirma asistencia). La escritura
-- (ins/upd) es acción de cliente y NO se toca.
drop policy if exists "attendance sel" on event_attendance;
create policy "attendance sel" on event_attendance for select using (
  staff_sees_client(client_id)
  or (client_id = auth_client_id() and auth_client_role() in ('owner','content')));

-- meeting_requests: staff LEE (sel) y GESTIONA (upd = agendar/descartar) sus
-- clientes. El alta (ins) es acción de cliente y NO se toca.
drop policy if exists "meeting_req sel" on meeting_requests;
create policy "meeting_req sel" on meeting_requests for select using (
  staff_sees_client(client_id) or client_id = auth_client_id());

drop policy if exists "meeting_req upd" on meeting_requests;
create policy "meeting_req upd" on meeting_requests for update
  using (staff_sees_client(client_id)) with check (staff_sees_client(client_id));

-- storage 'contenido': el staff LEE y SUBE imágenes de sus clientes asignados.
-- La carpeta raíz de la ruta es el client_id (texto); se casa por asignación
-- sin castear a uuid (evita error en rutas no-uuid).
drop policy if exists "contenido read" on storage.objects;
create policy "contenido read" on storage.objects for select using (
  bucket_id = 'contenido' and (
    is_owner()
    or (storage.foldername(name))[1] in (
      select client_id::text from admin_assignments where member_id = auth.uid())
    or ((storage.foldername(name))[1] = auth_client_id()::text
        and auth_client_role() in ('owner','content'))
  ));

drop policy if exists "contenido write" on storage.objects;
create policy "contenido write" on storage.objects for all
  using (bucket_id = 'contenido' and (
    is_owner()
    or (storage.foldername(name))[1] in (
      select client_id::text from admin_assignments where member_id = auth.uid())
  ))
  with check (bucket_id = 'contenido' and (
    is_owner()
    or (storage.foldername(name))[1] in (
      select client_id::text from admin_assignments where member_id = auth.uid())
  ));

commit;

-- ============================================================
--  NO SE TOCAN (quedan owner-only vía is_admin()=is_owner()):
--    contracts, installments, installment_payments, bucket 'facturas'  (finanzas)
--    "clients: solo admin escribe"                                     (cartera write)
--    client_details, client_contacts, client_strategy, client_plan_items,
--    company_bank_info                                                 (ficha/contexto)
--    integraciones / notificaciones, profiles, uf_values              (sistema)
--    event_attendance ins/upd, meeting_req ins, content_reviews sel/ins (cliente)
-- ============================================================
