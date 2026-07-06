-- ============================================================
--  TRAZABILIDAD DE ENTORNO DE FLOW POR PAGO
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Guarda, en cada intento de pago, el host/URL de Flow efectivamente usado al
--  crear la orden (ej. https://www.flow.cl/api o https://sandbox.flow.cl/api).
--  Es una columna forense: el hecho, no una interpretación. Nullable y sin CHECK
--  (las filas viejas quedan null).
-- ============================================================

alter table installment_payments add column if not exists flow_env text;
