-- ============================================================
--  FICHA COMPLETA DE DATOS DEL CLIENTE
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Antecedentes por empresa (client_details, 1:1) + directorio de contactos
--  (client_contacts, 1:N). Editable por admin y por dueño/finanzas del propio
--  cliente; contenido solo lee. Tablas SEPARADAS de clients (que sigue admin-
--  only) y del directorio SEPARADO de los accesos (auth.users/profiles).
-- ============================================================

-- ---------- Ficha (1:1) ----------
create table if not exists client_details (
  client_id    uuid primary key references clients(id) on delete cascade,
  razon_social text,
  rut          text,
  giro         text,
  direccion    text,
  comuna       text,
  ciudad       text,
  region       text,
  horarios     text,
  notas        text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id)
);

-- Backfill del RUT desde clients (el cliente lo mantiene desde ahora; el admin
-- lo sigue viendo/usando para cobros).
insert into client_details (client_id, rut)
select id, rut from clients
on conflict (client_id) do nothing;

-- ---------- Directorio de contactos (1:N) ----------
-- Informativo. SIN relación con auth.users/profiles: agregar un contacto NO da
-- acceso al portal.
create table if not exists client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null,
  role       text,
  phone      text,
  email      text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists client_contacts_client_idx on client_contacts (client_id, sort_order);

-- ============================================================
--  RLS: lectura para los tres roles del propio cliente; escritura para admin
--  y dueño/finanzas. Cada cliente solo su propia ficha.
-- ============================================================
alter table client_details  enable row level security;
alter table client_contacts enable row level security;

drop policy if exists "client_details sel" on client_details;
create policy "client_details sel" on client_details for select
  using (is_admin() or client_id = auth_client_id());
drop policy if exists "client_details write" on client_details;
create policy "client_details write" on client_details for all
  using (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')))
  with check (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')));

drop policy if exists "client_contacts sel" on client_contacts;
create policy "client_contacts sel" on client_contacts for select
  using (is_admin() or client_id = auth_client_id());
drop policy if exists "client_contacts write" on client_contacts;
create policy "client_contacts write" on client_contacts for all
  using (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')))
  with check (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')));

grant all on client_details  to service_role;
grant all on client_contacts to service_role;
