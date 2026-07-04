-- ============================================================
--  FASE 5 — Cobros y UF
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Separa el ACUERDO (contracts, evolucionado) de las CUOTAS que genera
--  (installments, tabla nueva). Todo el neto se guarda por separado del IVA:
--  nunca se almacena el total con IVA incluido. La UF de cada cuota se congela
--  el día de facturación. Se retira la tabla billings (estaba vacía).
-- ============================================================

-- ---------- Tipos ----------
do $$ begin
  create type contract_modality as enum ('proyecto','plazo_fijo','retainer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type installment_status as enum ('proyectada','facturada','pagada','vencida','anulada');
exception when duplicate_object then null; end $$;

-- ---------- contracts: evoluciona el acuerdo ----------
alter table contracts
  add column if not exists modality           contract_modality not null default 'retainer',
  add column if not exists has_iva            boolean not null default true,   -- por defecto CON IVA
  add column if not exists net_uf             numeric(12,2),   -- neto EN UF por cuota (modo UF)
  add column if not exists net_clp_fixed      numeric(14,0),   -- neto EN CLP por cuota (modo CLP fijo)
  add column if not exists installments_count smallint;        -- N cuotas (proyecto/plazo_fijo; null = retainer)

-- Backfill desde el modelo de la Fase 2 (base_amount según moneda).
update contracts set net_uf        = base_amount where currency = 'UF'  and net_uf is null;
update contracts set net_clp_fixed = base_amount where currency = 'CLP' and net_clp_fixed is null;

-- base_amount / indexed_uf quedan obsoletos (los reemplazan net_uf/net_clp_fixed y modality).
-- Se dejan de escribir; base_amount deja de ser obligatorio.
alter table contracts alter column base_amount drop not null;

-- ---------- installments: las cuotas ----------
create table if not exists installments (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references contracts(id) on delete cascade,
  client_id     uuid not null references clients(id)   on delete cascade,
  number        smallint not null,           -- cuota 1, 2, 3…
  currency      currency_kind not null,      -- UF | CLP (copiado del acuerdo)
  net_uf        numeric(12,2),               -- neto en UF (modo UF)
  net_clp_fixed numeric(14,0),               -- neto en CLP (modo CLP fijo)
  has_iva       boolean not null default true,
  iva_rate      numeric(4,3) not null default 0.190,  -- tasa congelada por cuota
  due_date      date not null,               -- día de facturación planificado
  status        installment_status not null default 'proyectada',

  -- Se CONGELAN el día de facturación (antes = null):
  uf_value      numeric(12,2),               -- UF del día (null en CLP fijo)
  net_clp       numeric(14,0),               -- neto en CLP el día de facturación
  iva_clp       numeric(14,0),               -- has_iva ? round(net_clp * iva_rate) : 0
  total_clp     numeric(14,0),               -- net_clp + iva_clp
  issued_at     date,                        -- día en que se congeló la UF
  dte_type      smallint,
  dte_number    text,                        -- se registra; el DTE se emite en SII/Nubox
  paid_at       date,
  created_at    timestamptz not null default now(),
  unique (contract_id, number)
);

create index if not exists installments_client_due_idx  on installments (client_id, due_date desc);
create index if not exists installments_contract_idx    on installments (contract_id);
create index if not exists installments_status_due_idx  on installments (status, due_date);

alter table installments enable row level security;

-- [SENSIBLE] solo admin, igual que contracts. Sin política de lectura para el cliente.
drop policy if exists "installments: solo admin" on installments;
create policy "installments: solo admin"
  on installments for all using (is_admin()) with check (is_admin());

grant all on installments to service_role;

-- ---------- retirar billings (vacía, reemplazada por installments) ----------
drop table if exists billings cascade;
