-- ============================================================
--  ESTADO DE INVITACIONES (confirmación de envío + webhook Resend)
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Una fila por cada envío/reenvío (NO se pisa por un envío nuevo → historial
--  completo). El webhook de Resend actualiza la fila por su message_id
--  (data.email_id del evento = data.id del envío). Info interna del panel:
--  lectura solo admin; escritura por service_role (acción de invitar + webhook).
-- ============================================================

create table if not exists client_invitations (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  kind        text not null,                    -- 'invite' (original) | 'recovery' (reenvío)
  message_id  text,                             -- id de Resend; null si el envío falló
  status      text not null default 'enviado',  -- enviado|entregado|abierto|rebotado|fallido
  error       text,                             -- motivo si status='fallido'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Listado por cliente/email (historial) y casado por message_id (webhook).
create index if not exists client_invitations_client_idx on client_invitations (client_id, email, created_at desc);
create index if not exists client_invitations_msgid_idx  on client_invitations (message_id);

-- ---------- RLS ----------
alter table client_invitations enable row level security;

-- Lectura: solo admin (es traza interna del panel, el cliente no la ve).
drop policy if exists "client_invitations sel" on client_invitations;
create policy "client_invitations sel" on client_invitations for select
  using (is_admin());

-- Escritura: solo admin por RLS. El webhook usa service_role (bypassa RLS).
drop policy if exists "client_invitations write" on client_invitations;
create policy "client_invitations write" on client_invitations for all
  using (is_admin()) with check (is_admin());

grant all on client_invitations to service_role;
