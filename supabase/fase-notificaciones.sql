-- ============================================================
--  NOTIFICACIONES POR CORREO (Resend)
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Config de a quién avisar por cada tipo de evento (accion/hito/reunion) y
--  los correos internos de Color Media. Solo admin la edita; el envío la lee
--  con service_role.
-- ============================================================

create table if not exists notification_settings (
  event_type  text primary key check (event_type in ('accion','hito','reunion')),
  to_internal boolean not null default true,
  to_client   boolean not null default false
);

insert into notification_settings (event_type, to_internal, to_client) values
  ('accion',  true,  false),   -- acciones: solo interno (el cliente las ve en el portal)
  ('hito',    true,  true),
  ('reunion', true,  true)
on conflict (event_type) do nothing;

create table if not exists notification_config (
  id             int primary key default 1 check (id = 1),
  internal_emails text                       -- separados por coma / espacio / línea
);
insert into notification_config (id, internal_emails)
values (1, 'marketing@colormedia.cl')
on conflict (id) do nothing;

alter table notification_settings enable row level security;
alter table notification_config   enable row level security;

drop policy if exists "notif settings admin" on notification_settings;
create policy "notif settings admin" on notification_settings for all using (is_admin()) with check (is_admin());
drop policy if exists "notif config admin" on notification_config;
create policy "notif config admin" on notification_config for all using (is_admin()) with check (is_admin());

grant all on notification_settings to service_role;
grant all on notification_config   to service_role;
