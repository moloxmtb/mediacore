-- ============================================================
--  ENTREGABLES · marcador de flujo nuevo de aprobación
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Distingue los entregables creados A PROPÓSITO en el flujo nuevo de aprobación
--  (crearBorrador / enviados / reemplazados) de los LEGACY (que quedaron todos en
--  'borrador' por el default de Fase 1). El cliente SOLO ve los del flujo nuevo;
--  los legacy no le aparecen (evita el flood).
--
--  Default false → TODAS las filas existentes (legacy) quedan fuera sin backfill.
--  SOLO crearBorrador lo pone en true (enviar/reemplazar NO despiertan un legacy).
--  Los filtros cliente (sección + "Te toca a ti") exigen en_flujo_aprobacion=true,
--  así un legacy nunca le aparece al cliente pase lo que pase.
-- ============================================================

alter table deliverables
  add column if not exists en_flujo_aprobacion boolean not null default false;
