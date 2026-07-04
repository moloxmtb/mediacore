-- ============================================================
--  FASE 4 — Google Calendar (tablas de soporte)
--  Correr en Supabase → SQL Editor cuando vayas a conectar Google.
--  Idempotente.
--
--  Ambas tablas llevan RLS activado y SIN políticas: solo service_role
--  (que salta RLS y vive únicamente en el servidor) puede leerlas o
--  escribirlas. Así, ni un cliente autenticado ni la anon key pueden
--  tocar el refresh token de Google ni los syncTokens.
-- ============================================================

-- Credenciales OAuth del admin (una sola cuenta de Google → fila única).
-- refresh_token va CIFRADO por la app (AES-256-GCM); nunca en texto plano.
create table if not exists google_credentials (
  id            int primary key default 1,
  refresh_token text,          -- cifrado
  access_token  text,          -- de vida corta; se refresca solo
  token_expiry  timestamptz,
  scope         text,
  updated_at    timestamptz default now(),
  constraint single_row check (id = 1)
);
alter table google_credentials enable row level security;

-- syncToken por calendario, para la sincronización incremental.
create table if not exists calendar_sync (
  google_calendar_id text primary key,
  sync_token         text,
  synced_at          timestamptz default now()
);
alter table calendar_sync enable row level security;

-- Privilegios explícitos para service_role (por si los default privileges
-- no cubrieran estas tablas nuevas).
grant all on google_credentials to service_role;
grant all on calendar_sync      to service_role;
