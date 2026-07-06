-- ============================================================
--  LOGO DE LA EMPRESA DEL CLIENTE
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Ruta del logo en client_details (aditiva, nullable) + bucket PÚBLICO
--  'logos' separado del privado 'contenido'. Lectura pública (el logo es marca
--  visible); escritura (subir/reemplazar/borrar) solo admin.
-- ============================================================

-- ---------- Columna (aditiva, nullable) ----------
alter table client_details add column if not exists logo_path text;

-- ---------- Bucket público ----------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Lectura pública: cualquiera (incluso sin sesión) puede leer los logos. El
-- flag public=true del bucket sirve la URL sin firmar; esta policy acompaña
-- para list/select por API.
drop policy if exists "logos read" on storage.objects;
create policy "logos read" on storage.objects for select
  using (bucket_id = 'logos');

-- Escritura (subir/reemplazar/borrar): SOLO admin.
drop policy if exists "logos write" on storage.objects;
create policy "logos write" on storage.objects for all
  using (bucket_id = 'logos' and is_admin())
  with check (bucket_id = 'logos' and is_admin());
