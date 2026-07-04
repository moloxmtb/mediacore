-- ============================================================
--  PANEL COLOR MEDIA — Esquema de base de datos (Supabase / Postgres)
-- ============================================================
--  Ejecutar en el editor SQL de Supabase (o vía migración).
--
--  Eje del diseño: separación entre lo que ve el ADMIN (Ismael) y el
--  CLIENTE. Las tablas financieras (contracts, billings) NO tienen
--  política de lectura para clientes: son invisibles a nivel de base de
--  datos. Los eventos de calendario y entregables se filtran además por
--  visible_to_client, para que el cliente solo vea lo que corresponde.
--
--  Interconexión: una fase de un proyecto reúne, en su ventana de
--  detalle, sus acciones, sus entregables y los eventos de calendario de
--  su rango. El calendario de Google alimenta y es alimentado por la Gantt.
-- ============================================================

-- ---------- Tipos ----------
create type user_role         as enum ('admin', 'client');
create type client_segment    as enum ('corporativo','asuntos_publicos','pyme','personal_brand');
create type client_status     as enum ('activo','propuesta','inactivo');
create type currency_kind     as enum ('UF','CLP');
create type project_status    as enum ('activo','pausado','cerrado');
create type billing_status    as enum ('pendiente','pagado','vencido','anulado');
create type deliverable_status as enum ('en_proceso','entregado','aprobado');
create type event_source       as enum ('google','panel');

-- ============================================================
--  TABLAS
-- ============================================================

-- Perfil de cada usuario autenticado. Extiende auth.users.
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       user_role not null default 'client',
  client_id  uuid,
  full_name  text,
  created_at timestamptz not null default now()
);

-- Clientes de Color Media. google_calendar_id mapea el calendario
-- secundario de Google dedicado a ese cliente (dentro de una sola cuenta).
create table clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  segment            client_segment not null,
  status             client_status  not null default 'activo',
  rut                text,
  contact_email      text,
  accent_color       text default '#3DBDCB',
  google_calendar_id text,                       -- calendarId de Google para este cliente
  created_at         timestamptz not null default now()
);

alter table profiles
  add constraint profiles_client_fk
  foreign key (client_id) references clients(id) on delete set null;

-- Contrato por cliente.  [SENSIBLE]
create table contracts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  currency    currency_kind not null,
  base_amount numeric(12,2) not null,
  indexed_uf  boolean not null default false,
  billing_day smallint not null default 1,
  start_date  date not null,
  end_date    date,
  status      text not null default 'activo',
  notes       text,
  created_at  timestamptz not null default now()
);

-- Proyectos del cliente.
create table projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  description text,
  status      project_status not null default 'activo',
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now()
);

-- Fases / tareas de un proyecto. Barras de la carta Gantt.
create table phases (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  start_date date not null,
  end_date   date not null,
  progress   smallint not null default 0 check (progress between 0 and 100),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

-- Bitácora de acciones ejecutadas por Color Media.
-- phase_id permite colgar la acción de una fase específica, para que
-- aparezca en la ventana de detalle de esa barra de la Gantt.
create table actions (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  project_id        uuid references projects(id) on delete set null,
  phase_id          uuid references phases(id)   on delete set null,
  action_date       date not null default current_date,
  title             text not null,
  description       text,
  result            text,                    -- qué resultado tuvo la acción
  kind              text,                    -- 'reunion','contenido','rodaje','reporte'...
  visible_to_client boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Entregables. Lo tangible que produce una fase o proyecto: piezas,
-- manuales, cápsulas, reportes. url apunta a Drive u otro repositorio.
create table deliverables (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  phase_id          uuid references phases(id) on delete set null,
  title             text not null,
  description       text,
  url               text,                    -- enlace a la pieza (Drive, etc.)
  status            deliverable_status not null default 'en_proceso',
  result            text,                    -- resultado / feedback del entregable
  delivered_at      date,
  visible_to_client boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Eventos de calendario. Segunda capa de la Gantt (hitos puntuales).
-- Alimentados desde Google Calendar y también creados desde el panel.
-- google_event_id evita duplicados en la sincronización bidireccional.
create table calendar_events (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  project_id         uuid references projects(id) on delete set null,
  google_calendar_id text,
  google_event_id    text,                   -- id del evento en Google (null si aún no sincroniza)
  title              text not null,
  description        text,
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  kind               text,                   -- 'reunion','rodaje','entrega','hito'...
  source             event_source not null default 'google',
  visible_to_client  boolean not null default true,
  synced_at          timestamptz,
  created_at         timestamptz not null default now(),
  unique (google_calendar_id, google_event_id)
);

-- Cobros mensuales.  [SENSIBLE]  No reemplaza el DTE del SII.
create table billings (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  period      date not null,
  currency    currency_kind not null,
  base_amount numeric(12,2) not null,
  uf_value    numeric(12,2),
  amount_clp  numeric(14,0) not null,
  dte_type    smallint,
  dte_number  text,
  due_date    date,
  status      billing_status not null default 'pendiente',
  paid_at     date,
  created_at  timestamptz not null default now(),
  unique (contract_id, period)
);

-- Caché diario de la UF (fuente: mindicador.cl / CMF).
create table uf_values (
  date  date primary key,
  value numeric(12,2) not null
);

-- ---------- Índices ----------
create index on projects        (client_id);
create index on phases          (project_id);
create index on actions         (client_id, action_date desc);
create index on actions         (phase_id);
create index on deliverables    (project_id);
create index on deliverables    (phase_id);
create index on calendar_events (client_id, starts_at);
create index on calendar_events (project_id);
create index on billings        (client_id, period desc);
create index on contracts       (client_id);

-- ============================================================
--  FUNCIONES AUXILIARES (SECURITY DEFINER para evitar recursión de RLS)
-- ============================================================
create or replace function auth_role()
returns user_role
language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create or replace function auth_client_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select client_id from profiles where id = auth.uid() $$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(auth_role() = 'admin', false) $$;

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================
alter table profiles        enable row level security;
alter table clients         enable row level security;
alter table contracts       enable row level security;
alter table projects        enable row level security;
alter table phases          enable row level security;
alter table actions         enable row level security;
alter table deliverables    enable row level security;
alter table calendar_events enable row level security;
alter table billings        enable row level security;
alter table uf_values       enable row level security;

-- ---------- profiles ----------
create policy "profiles: cada uno ve el suyo"
  on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles: admin gestiona"
  on profiles for all using (is_admin()) with check (is_admin());

-- ---------- clients ----------
create policy "clients: admin ve todo"
  on clients for select using (is_admin() or id = auth_client_id());
create policy "clients: solo admin escribe"
  on clients for all using (is_admin()) with check (is_admin());

-- ---------- contracts  [SENSIBLE: solo admin] ----------
create policy "contracts: solo admin"
  on contracts for all using (is_admin()) with check (is_admin());

-- ---------- projects ----------
create policy "projects: admin todo, cliente lo suyo"
  on projects for select using (is_admin() or client_id = auth_client_id());
create policy "projects: solo admin escribe"
  on projects for all using (is_admin()) with check (is_admin());

-- ---------- phases (Gantt) ----------
create policy "phases: admin todo, cliente por proyecto"
  on phases for select using (
    is_admin() or project_id in (
      select id from projects where client_id = auth_client_id()
    )
  );
create policy "phases: solo admin escribe"
  on phases for all using (is_admin()) with check (is_admin());

-- ---------- actions ----------
create policy "actions: admin todo, cliente solo visibles"
  on actions for select using (
    is_admin() or (client_id = auth_client_id() and visible_to_client = true)
  );
create policy "actions: solo admin escribe"
  on actions for all using (is_admin()) with check (is_admin());

-- ---------- deliverables ----------
create policy "deliverables: admin todo, cliente por proyecto y visible"
  on deliverables for select using (
    is_admin() or (
      visible_to_client = true and project_id in (
        select id from projects where client_id = auth_client_id()
      )
    )
  );
create policy "deliverables: solo admin escribe"
  on deliverables for all using (is_admin()) with check (is_admin());

-- ---------- calendar_events ----------
create policy "calendar: admin todo, cliente lo suyo y visible"
  on calendar_events for select using (
    is_admin() or (client_id = auth_client_id() and visible_to_client = true)
  );
create policy "calendar: solo admin escribe"
  on calendar_events for all using (is_admin()) with check (is_admin());

-- ---------- billings  [SENSIBLE: solo admin] ----------
create policy "billings: solo admin"
  on billings for all using (is_admin()) with check (is_admin());

-- ---------- uf_values ----------
create policy "uf: lectura autenticada"
  on uf_values for select using (auth.role() = 'authenticated');
create policy "uf: escritura admin"
  on uf_values for all using (is_admin()) with check (is_admin());

-- ============================================================
--  NOTAS
--  · El portal del cliente usa la anon key. Con estas políticas, un
--    cliente que intente leer contracts o billings recibe cero filas.
--  · La service_role key salta RLS y vive SOLO en el servidor: la usan
--    el refresco de UF y la sincronización con Google Calendar.
--  · La app solo lee/escribe en los calendarios de Google mapeados en
--    clients.google_calendar_id; el calendario personal queda fuera.
-- ============================================================
