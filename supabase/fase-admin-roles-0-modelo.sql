-- ============================================================
--  ROLES INTERNOS DEL EQUIPO — FASE 0: MODELO (aditivo)
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Introduce el sub-rol interno (owner/ejecutivo/productor) y el mapeo
--  miembro↔cliente, MÁS las funciones centrales de alcance. NO cambia ningún
--  comportamiento todavía: is_admin() se deja INTACTO (sigue = role admin), así
--  que hoy todos los admin siguen viendo todo. El "flip" (is_admin()=is_owner()
--  + branches de alcance) es la Fase 1, en otra migración.
--
--  Roles internos (se aplican en Fase 1):
--    owner     : acceso total, todos los clientes, gestiona equipo/asignaciones.
--    ejecutivo : solo clientes asignados; sin finanzas/cartera/integraciones.
--    productor : solo clientes asignados; además sin Resumen/Bitácora.
-- ============================================================

-- ---------- Sub-rol interno en profiles ----------
do $$ begin
  create type admin_role as enum ('owner','ejecutivo','productor');
exception when duplicate_object then null; end $$;

alter table profiles add column if not exists admin_role admin_role;

-- Backfill CRÍTICO: todo admin actual pasa a 'owner'. Debe estar corrido y
-- verificado ANTES del flip de la Fase 1; si no, is_owner() daría false para el
-- admin actual y perdería el acceso.
update profiles set admin_role = 'owner'
where role = 'admin' and admin_role is null;

-- ---------- Asignaciones miembro↔cliente (1 fila por par) ----------
-- El owner NO necesita filas (ve todo por definición). Solo ejecutivo/productor.
create table if not exists admin_assignments (
  member_id  uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references clients(id)    on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (member_id, client_id)
);
create index if not exists admin_assignments_member_idx on admin_assignments (member_id);
create index if not exists admin_assignments_client_idx on admin_assignments (client_id);

-- ---------- Funciones centrales (security definer, stable) ----------
-- Sub-rol interno del usuario actual.
create or replace function auth_admin_role()
returns admin_role language sql stable security definer set search_path = public
as $$ select admin_role from profiles where id = auth.uid() $$;

-- owner = admin con sub-rol owner. Será el nuevo significado de is_admin() en Fase 1.
create or replace function is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(auth_role() = 'admin' and auth_admin_role() = 'owner', false) $$;

-- Cualquier miembro interno (admin), sin importar sub-rol.
create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(auth_role() = 'admin', false) $$;

-- Núcleo del alcance: ¿el miembro interno actual puede ver este cliente?
-- owner → siempre; ejecutivo/productor → solo si tienen la asignación.
-- Security definer: lee admin_assignments aunque el llamador no tenga acceso
-- directo a la tabla (la RLS de la tabla es owner-only).
create or replace function staff_sees_client(cid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select is_owner() or exists (
    select 1 from admin_assignments
    where member_id = auth.uid() and client_id = cid
  )
$$;

-- ---------- RLS de admin_assignments: gestión SOLO owner ----------
-- Se gatea con is_owner() (no is_admin()) para que sea owner-only desde ya,
-- sin depender del flip de la Fase 1.
alter table admin_assignments enable row level security;
drop policy if exists "admin_assignments owner" on admin_assignments;
create policy "admin_assignments owner" on admin_assignments for all
  using (is_owner()) with check (is_owner());
grant all on admin_assignments to service_role;

-- ============================================================
--  NOTA: is_admin() NO se toca en esta fase. Comportamiento intacto.
--  El flip (is_admin()=is_owner() + staff_sees_client en las tablas de
--  negocio) va en fase-admin-roles-1-flip.sql, tras verificar el backfill.
-- ============================================================
