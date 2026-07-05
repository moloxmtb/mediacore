-- ============================================================
--  SOLICITUDES DE REUNIÓN (sección Calendario del portal)
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  El cliente solicita una reunión a Color Media (motivo + fecha/hora preferida
--  + urgencia). Le llega al admin por correo (Resend) y queda registrada; el
--  admin la agenda. La VISTA del calendario no necesita tablas (lee de
--  calendar_events, phases y deliverables que ya existen); esto es solo para las
--  solicitudes.
-- ============================================================

create table if not exists meeting_requests (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id)    on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  reason       text not null,
  preferred_at timestamptz,                          -- fecha/hora preferida (opcional)
  urgency      text not null default 'media' check (urgency in ('baja','media','alta')),
  status       text not null default 'pendiente' check (status in ('pendiente','agendada','descartada')),
  admin_note   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists meeting_requests_client_idx on meeting_requests (client_id, created_at desc);
create index if not exists meeting_requests_status_idx on meeting_requests (status, created_at desc);

alter table meeting_requests enable row level security;

-- Lectura: admin, o cualquier rol del propio cliente (ve sus solicitudes).
drop policy if exists "meeting_req sel" on meeting_requests;
create policy "meeting_req sel" on meeting_requests for select using (
  is_admin() or client_id = auth_client_id());

-- Alta: cualquier rol del cliente crea SU propia solicitud (su usuario, su cliente).
drop policy if exists "meeting_req ins" on meeting_requests;
create policy "meeting_req ins" on meeting_requests for insert with check (
  is_admin() or (requested_by = auth.uid() and client_id = auth_client_id()));

-- Gestión (agendar / descartar): solo admin.
drop policy if exists "meeting_req upd" on meeting_requests;
create policy "meeting_req upd" on meeting_requests for update
  using (is_admin()) with check (is_admin());

grant all on meeting_requests to service_role;
