-- ============================================================
--  REVERSA de fase-entregables-versiones.sql
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  ⚠️ DROPEAR LAS TABLAS NUEVAS **NO BASTA**.
--  La migración no es puramente aditiva: además de crear tablas, REEMPLAZA la
--  política de lectura del bucket 'entregables' (para que entienda la ruta por
--  versión). Si se dropean las funciones nuevas sin restaurar esa política, la
--  política queda apuntando a una función inexistente y el CLIENTE PIERDE EL
--  ACCESO A SUS ARCHIVOS. Por eso el paso 1 de abajo es el importante.
--
--  Qué tocó la migración de lo ya existente:
--   a) storage.objects → política "entregables read"  (SE REEMPLAZA → hay que restaurar)
--   b) deliverables    → columna current_version_id + FK  (aditivo; se puede dejar)
--  Todo lo demás es tablas/funciones/trigger nuevos.
-- ============================================================

-- ---------- 1) RESTAURAR la política original de Storage (LO PRIMERO) ----------
-- Vuelve a `deliverable_is_sent(name)`, que entiende solo la forma legacy
-- `<client_id>/<deliverable_id>` — la única que existía antes de la migración.
drop policy if exists "entregables read" on storage.objects;
create policy "entregables read" on storage.objects for select using (
  bucket_id = 'entregables' and (
    staff_sees_client(entregables_folder_client(name))
    or ((storage.foldername(name))[1] = auth_client_id()::text
        and auth_client_role() in ('owner','content')
        and deliverable_is_sent(name))));

-- ⚠️ NOTA IMPORTANTE SOBRE LOS ARCHIVOS:
-- Los objetos subidos DESPUÉS de la migración viven en la ruta por versión
-- `<client>/<entregable>/<version>`, que la política restaurada NO resuelve.
-- Al revertir, esos archivos quedan inaccesibles para el cliente (el staff los
-- sigue viendo: su rama de la política mira solo la carpeta raíz).
-- Si ya se subieron versiones nuevas en producción, revertir NO es gratis:
-- primero hay que decidir qué se hace con esos archivos.

-- ---------- 2) Quitar el puntero (antes que la tabla a la que apunta) ----------
alter table deliverables drop constraint if exists deliverables_current_version_fk;
-- La columna se puede dejar (queda en null y nadie la lee). Para borrarla:
-- alter table deliverables drop column if exists current_version_id;

-- ---------- 3) Tablas nuevas (el trigger cae con la tabla) ----------
drop table if exists deliverable_reviews;
drop table if exists deliverable_versions;

-- ---------- 4) Funciones y tipo nuevos ----------
drop function if exists apply_client_deliverable_review();
drop function if exists deliverable_awaiting_response(uuid);
drop function if exists entregables_deliverable_of(text);
drop type if exists deliverable_review_kind;

-- ---------- 5) Qué NO hace falta tocar ----------
-- `deliverable_files` nunca se borró ni se dejó de escribir en el modelo viejo,
-- así que el código anterior vuelve a funcionar tal cual: lee esa tabla y la
-- ruta estable. Los client_comment / responded_* originales siguen en
-- `deliverables` (la migración los COPIÓ al historial, no los movió).
