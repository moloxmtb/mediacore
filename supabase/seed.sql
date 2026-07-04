-- ============================================================
--  SETUP FASE 1 — Panel Color Media
--  Correr UNA vez en  Supabase → SQL Editor  (después de schema.sql).
--  Es idempotente: puedes repetirlo sin romper nada. Hace 3 cosas:
--
--    1. GRANTS  — da privilegios de tabla a los roles de la API. Faltaban
--                 (gotcha de las llaves nuevas): sin esto, ni la app ni el
--                 login pueden leer profiles y el ruteo por rol se rompe.
--    2. TRIGGER — cada usuario nuevo de auth obtiene su fila en profiles.
--    3. SEED    — marca a molox.mtb@gmail.com como admin y crea el cliente
--                 demo. El usuario cliente de prueba y su enlace los crea el
--                 asistente por API (no se pueden crear bien en SQL puro).
--
--  RLS sigue protegiendo cada fila: anon/authenticated solo ven lo que las
--  políticas permiten; service_role las salta. Otorgar DML a authenticated
--  es seguro justamente porque RLS decide qué filas toca.
-- ============================================================

-- 1) GRANTS ---------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines  in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage   on all sequences in schema public to authenticated;
grant execute on all routines  in schema public to anon, authenticated;
grant select  on all tables    in schema public to anon;

-- Privilegios por defecto para objetos futuros que cree este rol.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines  to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;

-- 2) TRIGGER --------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'client')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 3) SEED -----------------------------------------------------
-- Perfil para usuarios ya existentes (el trigger solo cubre los nuevos).
insert into profiles (id, role, full_name)
select id, 'client', coalesce(raw_user_meta_data->>'full_name', email)
from auth.users
on conflict (id) do nothing;

-- Marca al ADMIN (tu usuario ya existente).
update profiles
set role = 'admin', full_name = 'Ismael Poblete'
where id = (select id from auth.users where email = 'molox.mtb@gmail.com');

-- Cliente de prueba (empresa). El usuario de portal de este cliente lo crea
-- el asistente por API y lo enlaza a esta empresa.
insert into clients (name, segment, status, contact_email, accent_color)
select 'Cliente Demo', 'pyme', 'activo', 'cliente.demo@colormedia.cl', '#3DBDCB'
where not exists (select 1 from clients where name = 'Cliente Demo');

-- Verificación (opcional): descomenta para ver el resultado.
-- select p.role, p.full_name, u.email from profiles p
--   join auth.users u on u.id = p.id order by p.role;
