-- ============================================================
--  PIEZA 2 — SISTEMA DE TAREAS · FASE A (modelo + RLS)
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Una tabla `tasks` con `client_id` que se apoya en DOS reglas ya existentes
--  según su `tipo`, sin inventar RLS nueva:
--    - tipo='interna'  → visible/gestionable por el equipo interno de ese
--                        cliente (staff_sees_client).
--    - tipo='cliente'  → además visible para el propio cliente (owner/content),
--                        que puede marcarla 'hecha' pero NUNCA confirmarla.
--
--  responsable_id: un solo FK a auth.users, nullable. El discriminador es
--  `tipo`; la coherencia responsable↔tipo se valida en la ACCIÓN (no en el FK).
--
--  updated_at: NO hay trigger en este proyecto (convención app-level). Las
--  acciones de Fase B/C deben setear updated_at en cada update.
-- ============================================================

do $$ begin create type task_type   as enum ('interna','cliente'); exception when duplicate_object then null; end $$;
do $$ begin create type task_status as enum ('pendiente','hecha','confirmada'); exception when duplicate_object then null; end $$;

create table if not exists tasks (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  tipo           task_type not null,
  titulo         text not null,
  descripcion    text,
  responsable_id uuid references auth.users(id) on delete set null,  -- interno o portal según tipo (nullable)
  plazo          date,
  estado         task_status not null default 'pendiente',
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tasks_client_idx      on tasks (client_id, estado);
create index if not exists tasks_responsable_idx on tasks (responsable_id);

-- ============================================================
--  RLS — cruza el `tipo` con la regla correspondiente
-- ============================================================
alter table tasks enable row level security;

-- SELECT: staff ve TODAS las tareas de sus clientes (interna+cliente); el portal
-- ve solo las 'cliente' de su empresa.
drop policy if exists "tasks sel" on tasks;
create policy "tasks sel" on tasks for select using (
  staff_sees_client(client_id)
  or (tipo = 'cliente' and client_id = auth_client_id() and auth_client_role() in ('owner','content'))
);

-- INSERT: solo el equipo interno crea tareas (ambos tipos) para sus clientes.
-- El portal recibe, no crea.
drop policy if exists "tasks ins" on tasks;
create policy "tasks ins" on tasks for insert with check (
  staff_sees_client(client_id)
);

-- UPDATE: el staff tiene control total sobre las tareas de sus clientes. El
-- portal (owner/content de su empresa) puede tocar SOLO tareas 'cliente' NO
-- confirmadas. `estado <> 'confirmada'` va en `using` Y en `with check`: apenas
-- el staff confirma, la fila sale del set editable del cliente (no la reabre ni
-- muta) → 'confirmada' es TERMINAL desde el lado cliente. El `with check` con
-- `estado <> 'confirmada'` además impide que el cliente PONGA 'confirmada'.
drop policy if exists "tasks upd" on tasks;
create policy "tasks upd" on tasks for update
  using (
    staff_sees_client(client_id)
    or (tipo = 'cliente' and client_id = auth_client_id() and auth_client_role() in ('owner','content') and estado <> 'confirmada')
  )
  with check (
    staff_sees_client(client_id)
    or (tipo = 'cliente' and client_id = auth_client_id() and auth_client_role() in ('owner','content') and estado <> 'confirmada')
  );

-- DELETE: solo el equipo interno (borrar tareas es gestión, no del cliente).
drop policy if exists "tasks del" on tasks;
create policy "tasks del" on tasks for delete using (
  staff_sees_client(client_id)
);

grant all on tasks to service_role;
