-- ============================================================
--  SECCIONES DE CONTEXTO DE LA RELACIÓN
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Tres secciones que el cliente ve (solo lectura) y el admin llena:
--   1. Estrategia  (client_strategy, 1:1 por cliente)
--   2. Plan contratado por ALCANCE — sin precios (client_plan_items, 1:N)
--   3. Datos bancarios de Color Media (company_bank_info, GLOBAL singleton)
--
--  Estrategia y plan son POR CLIENTE (RLS: cada cliente solo lo suyo, los 3
--  roles leen, solo admin escribe). Los datos bancarios son de Color Media,
--  iguales para todos: los lee cualquier usuario autenticado, solo admin edita.
-- ============================================================

-- ---------- 1. Estrategia (1:1) ----------
create table if not exists client_strategy (
  client_id      uuid primary key references clients(id) on delete cascade,
  objetivo       text,
  publico        text,
  mensajes_clave text,
  cuerpo         text,          -- texto libre en Markdown
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id)
);

-- ---------- 2. Plan contratado por alcance (1:N, SIN precios) ----------
create table if not exists client_plan_items (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  description text,
  status      text not null default 'pendiente' check (status in ('activo','pendiente')),
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists client_plan_items_client_idx on client_plan_items (client_id, sort_order);

-- ---------- 3. Datos bancarios de Color Media (GLOBAL, una sola fila) ----------
create table if not exists company_bank_info (
  id            int primary key default 1 check (id = 1),
  razon_social  text,
  rut           text,
  banco         text,
  tipo_cuenta   text,
  numero_cuenta text,
  email         text,
  notas         text,
  updated_at    timestamptz not null default now()
);
insert into company_bank_info (id) values (1) on conflict (id) do nothing;

-- ============================================================
--  RLS
-- ============================================================
alter table client_strategy    enable row level security;
alter table client_plan_items  enable row level security;
alter table company_bank_info  enable row level security;

-- Estrategia: leen admin + cualquier rol del propio cliente; escribe solo admin.
drop policy if exists "strategy sel" on client_strategy;
create policy "strategy sel" on client_strategy for select
  using (is_admin() or client_id = auth_client_id());
drop policy if exists "strategy write" on client_strategy;
create policy "strategy write" on client_strategy for all
  using (is_admin()) with check (is_admin());

-- Plan por alcance: igual criterio.
drop policy if exists "plan sel" on client_plan_items;
create policy "plan sel" on client_plan_items for select
  using (is_admin() or client_id = auth_client_id());
drop policy if exists "plan write" on client_plan_items;
create policy "plan write" on client_plan_items for all
  using (is_admin()) with check (is_admin());

-- Datos bancarios: los lee cualquier usuario autenticado (son de Color Media,
-- iguales para todos); los edita solo admin.
drop policy if exists "bank sel" on company_bank_info;
create policy "bank sel" on company_bank_info for select
  using (auth.uid() is not null);
drop policy if exists "bank write" on company_bank_info;
create policy "bank write" on company_bank_info for all
  using (is_admin()) with check (is_admin());

grant all on client_strategy   to service_role;
grant all on client_plan_items to service_role;
grant all on company_bank_info to service_role;
