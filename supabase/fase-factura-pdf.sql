-- ============================================================
--  PDF DE FACTURA POR CUOTA
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  El admin archiva en cada cuota el PDF del DTE ya emitido en SII/Nubox.
--  El panel NO emite nada: solo guarda el archivo. Del lado cliente lo ven y
--  descargan solo dueño/finanzas (mismo criterio que el resto financiero);
--  contenido no. Storage privado, descarga por signed URL tras pasar RLS.
-- ============================================================

-- ---------- Campo en la cuota ----------
alter table installments add column if not exists invoice_pdf_path        text;
alter table installments add column if not exists invoice_pdf_uploaded_at timestamptz;

-- La RLS de installments ya es correcta:
--   SELECT: is_admin() o (propio cliente y rol owner/finance)  [fase-roles.sql]
--   WRITE : solo admin                                          [fase5.sql]
-- El nuevo campo hereda ese control: contenido y otros clientes ni leen la fila.

-- ============================================================
--  STORAGE: bucket privado 'facturas' + políticas
-- ============================================================
insert into storage.buckets (id, name, public)
values ('facturas','facturas', false)
on conflict (id) do nothing;

-- Lectura: admin, o dueño/finanzas del cliente dueño de la carpeta
-- (primera carpeta de la ruta = su client_id). Contenido queda fuera.
drop policy if exists "facturas read" on storage.objects;
create policy "facturas read" on storage.objects for select
  using (
    bucket_id = 'facturas' and (
      is_admin() or (
        (storage.foldername(name))[1] = auth_client_id()::text
        and auth_client_role() in ('owner','finance')
      )
    )
  );

-- Escritura (subir/reemplazar/borrar): solo admin.
drop policy if exists "facturas write" on storage.objects;
create policy "facturas write" on storage.objects for all
  using (bucket_id = 'facturas' and is_admin())
  with check (bucket_id = 'facturas' and is_admin());
