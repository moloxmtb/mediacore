"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/clientes/actions";
import type { Contract } from "@/lib/types";

const initial: FormState = { error: null };

export default function ContractForm({
  action,
  clientId,
  contract,
  submitLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  contract?: Contract;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      {contract && <input type="hidden" name="id" value={contract.id} />}

      <div className="form-row">
        <div className="field">
          <label>Moneda</label>
          <select name="currency" defaultValue={contract?.currency ?? "UF"}>
            <option value="UF">UF (indexado)</option>
            <option value="CLP">CLP (fijo)</option>
          </select>
        </div>
        <div className="field">
          <label>Monto base</label>
          <input
            name="base_amount"
            inputMode="decimal"
            defaultValue={contract ? String(contract.base_amount) : ""}
            placeholder="45 (UF) o 650000 (CLP)"
            required
          />
          <span className="hint">En UF usa decimales (45,0). En CLP el monto entero.</span>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Día de facturación</label>
          <input
            name="billing_day"
            type="number"
            min={1}
            max={28}
            defaultValue={contract?.billing_day ?? 1}
          />
        </div>
        <div className="field">
          <label>Estado</label>
          <select name="status" defaultValue={contract?.status ?? "activo"}>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Inicio</label>
          <input
            name="start_date"
            type="date"
            defaultValue={contract?.start_date ?? ""}
            required
          />
        </div>
        <div className="field">
          <label>Término (opcional)</label>
          <input
            name="end_date"
            type="date"
            defaultValue={contract?.end_date ?? ""}
          />
        </div>
      </div>

      <div className="field">
        <label>Notas</label>
        <textarea name="notes" defaultValue={contract?.notes ?? ""} />
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Contrato guardado</span>}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
