-- ============================================================
--  ROLLBACK DE LA FASE 1 (el flip)
--  Correr SOLO si algo salió mal DESPUÉS del flip. Idempotente, atómico.
--
--  Deja todo "como antes del flip" = estado POST-Fase-0:
--   - is_admin() vuelve a su definición vieja (auth_role()='admin' → todo admin
--     ve todo, como siempre).
--   - Las 16 policies de negocio vuelven a su forma original con is_admin().
--   - Se eliminan los helpers creados en Fase 1 (staff_sees_project/_piece).
--
--  NO toca el modelo aditivo de Fase 0 (admin_role, admin_assignments, is_owner,
--  is_staff, staff_sees_client): eso es inofensivo sin el flip y se puede
--  reintentar la Fase 1 después.
-- ============================================================

begin;

-- ---------- Revertir is_admin() a su definición ORIGINAL ----------
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(auth_role() = 'admin', false) $$;

-- ---------- Restaurar las 16 policies de negocio (con is_admin()) ----------

-- clients (SELECT)
drop policy if exists "clients: admin ve todo" on clients;
create policy "clients: admin ve todo" on clients for select
  using (is_admin() or id = auth_client_id());

-- projects / actions / calendar_events (ALL, admin-only)
drop policy if exists "projects: solo admin escribe" on projects;
create policy "projects: solo admin escribe" on projects for all
  using (is_admin()) with check (is_admin());

drop policy if exists "actions: solo admin escribe" on actions;
create policy "actions: solo admin escribe" on actions for all
  using (is_admin()) with check (is_admin());

drop policy if exists "calendar: solo admin escribe" on calendar_events;
create policy "calendar: solo admin escribe" on calendar_events for all
  using (is_admin()) with check (is_admin());

-- phases / deliverables (ALL, admin-only)
drop policy if exists "phases: solo admin escribe" on phases;
create policy "phases: solo admin escribe" on phases for all
  using (is_admin()) with check (is_admin());

drop policy if exists "deliverables: solo admin escribe" on deliverables;
create policy "deliverables: solo admin escribe" on deliverables for all
  using (is_admin()) with check (is_admin());

-- contenido: periods / pieces / versions / media / reviews (ALL, admin-only)
drop policy if exists "content_periods adm" on content_periods;
create policy "content_periods adm" on content_periods for all
  using (is_admin()) with check (is_admin());

drop policy if exists "content_pieces adm" on content_pieces;
create policy "content_pieces adm" on content_pieces for all
  using (is_admin()) with check (is_admin());

drop policy if exists "content_versions adm" on content_versions;
create policy "content_versions adm" on content_versions for all
  using (is_admin()) with check (is_admin());

drop policy if exists "content_media adm" on content_media;
create policy "content_media adm" on content_media for all
  using (is_admin()) with check (is_admin());

drop policy if exists "content_reviews adm" on content_reviews;
create policy "content_reviews adm" on content_reviews for all
  using (is_admin()) with check (is_admin());

-- event_attendance (SELECT)
drop policy if exists "attendance sel" on event_attendance;
create policy "attendance sel" on event_attendance for select using (
  is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','content')));

-- meeting_requests (SELECT + UPDATE)
drop policy if exists "meeting_req sel" on meeting_requests;
create policy "meeting_req sel" on meeting_requests for select using (
  is_admin() or client_id = auth_client_id());

drop policy if exists "meeting_req upd" on meeting_requests;
create policy "meeting_req upd" on meeting_requests for update
  using (is_admin()) with check (is_admin());

-- storage 'contenido' (SELECT + ALL)
drop policy if exists "contenido read" on storage.objects;
create policy "contenido read" on storage.objects for select using (
  bucket_id = 'contenido' and (
    is_admin() or (
      (storage.foldername(name))[1] = auth_client_id()::text
      and auth_client_role() in ('owner','content')
    )
  ));

drop policy if exists "contenido write" on storage.objects;
create policy "contenido write" on storage.objects for all
  using (bucket_id = 'contenido' and is_admin())
  with check (bucket_id = 'contenido' and is_admin());

-- ---------- Eliminar los helpers creados en Fase 1 ----------
drop function if exists staff_sees_project(uuid);
drop function if exists staff_sees_piece(uuid);

commit;

-- ============================================================
--  Tras este rollback: is_admin() = auth_role()='admin' (todo admin ve todo),
--  las 16 policies como antes, y el modelo de Fase 0 sigue puesto (inofensivo).
--  Se puede corregir la Fase 1 y reintentarla.
-- ============================================================
