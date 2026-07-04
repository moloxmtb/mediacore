-- ============================================================
--  MÚLTIPLES USUARIOS Y ROLES POR CLIENTE
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Tres sub-roles de cliente con mundos separados:
--    owner   (dueño)    : contenido + proyectos + financiero
--    finance (finanzas) : SOLO financiero (contrato, cuotas)
--    content (contenido): proyectos + contenido, NADA financiero (= client de hoy)
--
--  Reabre RLS: las tablas financieras se abren a owner/finance; las de portal
--  (proyectos/contenido) se restringen a owner/content. clients y uf_values
--  quedan visibles a los tres.
-- ============================================================

-- ---------- Sub-rol en profiles ----------
do $$ begin create type client_role as enum ('owner','finance','content'); exception when duplicate_object then null; end $$;
alter table profiles add column if not exists client_role client_role;
update profiles set client_role = 'content' where role = 'client' and client_role is null;

create or replace function auth_client_role()
returns client_role language sql stable security definer set search_path = public
as $$ select client_role from profiles where id = auth.uid() $$;

-- ============================================================
--  FINANCIERO: abrir lectura a owner + finance (sigue solo-admin la escritura)
-- ============================================================
drop policy if exists "contracts: dueño y finanzas leen" on contracts;
create policy "contracts: dueño y finanzas leen" on contracts for select using (
  is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')));

drop policy if exists "installments: dueño y finanzas leen" on installments;
create policy "installments: dueño y finanzas leen" on installments for select using (
  is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')));

-- ============================================================
--  PORTAL (proyectos): restringir a owner + content (finanzas queda fuera)
-- ============================================================
drop policy if exists "projects: admin todo, cliente lo suyo" on projects;
create policy "projects: admin todo, cliente owner/content" on projects for select using (
  is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','content')));

drop policy if exists "phases: admin todo, cliente por proyecto" on phases;
create policy "phases: admin todo, cliente owner/content" on phases for select using (
  is_admin() or (auth_client_role() in ('owner','content') and project_id in (
    select id from projects where client_id = auth_client_id())));

drop policy if exists "actions: admin todo, cliente solo visibles" on actions;
create policy "actions: admin todo, cliente owner/content visibles" on actions for select using (
  is_admin() or (client_id = auth_client_id() and visible_to_client and auth_client_role() in ('owner','content')));

drop policy if exists "deliverables: admin todo, cliente por proyecto y visible" on deliverables;
create policy "deliverables: admin todo, cliente owner/content visibles" on deliverables for select using (
  is_admin() or (visible_to_client and auth_client_role() in ('owner','content') and project_id in (
    select id from projects where client_id = auth_client_id())));

drop policy if exists "calendar: admin todo, cliente lo suyo y visible" on calendar_events;
create policy "calendar: admin todo, cliente owner/content visibles" on calendar_events for select using (
  is_admin() or (client_id = auth_client_id() and visible_to_client and auth_client_role() in ('owner','content')));

-- ============================================================
--  CONTENIDO: restringir a owner + content
-- ============================================================
drop policy if exists "content_periods sel" on content_periods;
create policy "content_periods sel" on content_periods for select using (
  is_admin() or (client_id = auth_client_id() and published and auth_client_role() in ('owner','content')));

drop policy if exists "content_pieces sel" on content_pieces;
create policy "content_pieces sel" on content_pieces for select using (
  is_admin() or (client_id = auth_client_id() and status <> 'borrador' and auth_client_role() in ('owner','content')));

drop policy if exists "content_versions sel" on content_versions;
create policy "content_versions sel" on content_versions for select using (
  is_admin() or (auth_client_role() in ('owner','content') and piece_id in (
    select id from content_pieces where client_id = auth_client_id() and status <> 'borrador')));

drop policy if exists "content_reviews sel" on content_reviews;
create policy "content_reviews sel" on content_reviews for select using (
  is_admin() or (auth_client_role() in ('owner','content') and piece_id in (
    select id from content_pieces where client_id = auth_client_id())));

-- aprobar/comentar: solo owner/content de la propia empresa
drop policy if exists "content_reviews ins" on content_reviews;
create policy "content_reviews ins" on content_reviews for insert with check (
  is_admin() or (
    actor = 'client' and created_by = auth.uid() and auth_client_role() in ('owner','content')
    and piece_id in (select id from content_pieces where client_id = auth_client_id())
  ));

-- ============================================================
--  STORAGE: imágenes de contenido solo owner/content del dueño de la carpeta
-- ============================================================
drop policy if exists "contenido read" on storage.objects;
create policy "contenido read" on storage.objects for select using (
  bucket_id = 'contenido' and (
    is_admin() or (
      (storage.foldername(name))[1] = auth_client_id()::text
      and auth_client_role() in ('owner','content')
    )
  ));
