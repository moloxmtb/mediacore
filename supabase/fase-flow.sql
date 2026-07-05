-- ============================================================
--  PAGO DE CUOTAS CON FLOW (pasarela chilena) — SOLO SANDBOX
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Un registro por INTENTO de pago (una cuota puede tener varios: rechazado →
--  reintento). La cuota (installments) sigue siendo la fuente de verdad del
--  estado 'pagada'; aquí queda la traza y el vínculo con Flow.
--
--  La cuota se marca 'pagada' SOLO cuando Flow confirma por getStatus (status=2),
--  con triple validación (commerce_order + monto + estado). Eso ocurre en el
--  código (callbacks /api/flow/*), no en la base.
-- ============================================================

create table if not exists installment_payments (
  id             uuid primary key default gen_random_uuid(),
  installment_id uuid not null references installments(id) on delete cascade,
  client_id      uuid not null references clients(id)      on delete cascade,
  commerce_order text not null unique,        -- nuestro id de orden, único por intento
  flow_token     text,                        -- token de payment/create
  flow_order     text,                        -- flowOrder de Flow
  amount         integer not null,            -- CLP cobrado = total_clp congelado de la cuota
  status         text not null default 'created'
                 check (status in ('created','pending','paid','rejected','canceled','error')),
  payer_email    text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  paid_at        timestamptz
);

create index if not exists installment_payments_inst_idx   on installment_payments (installment_id, created_at desc);
create index if not exists installment_payments_client_idx on installment_payments (client_id);
create index if not exists installment_payments_token_idx  on installment_payments (flow_token);

-- ============================================================
--  RLS: mismo criterio financiero que installments/contracts.
--  Leen/inician admin o dueño/finanzas del propio cliente. Contenido y otros
--  clientes, fuera. Los callbacks de Flow escriben con service_role (sin sesión).
-- ============================================================
alter table installment_payments enable row level security;

drop policy if exists "inst_pay sel" on installment_payments;
create policy "inst_pay sel" on installment_payments for select using (
  is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')));

-- El cliente puede INICIAR un pago (insertar) de su propia cuota si es dueño/finanzas.
drop policy if exists "inst_pay ins" on installment_payments;
create policy "inst_pay ins" on installment_payments for insert with check (
  is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance')));

-- La transición de estado del pago (created→pending→paid/…) la hace el servidor
-- con service_role. El admin también puede corregir a mano.
drop policy if exists "inst_pay adm" on installment_payments;
create policy "inst_pay adm" on installment_payments for all
  using (is_admin()) with check (is_admin());

grant all on installment_payments to service_role;
