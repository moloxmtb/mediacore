"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/clientes/actions";
import type { Contract } from "@/lib/types";
import { MODALITY_LABELS } from "@/lib/billing";

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

  const netDefault =
    contract == null
      ? ""
      : contract.currency === "UF"
        ? (contract.net_uf ?? "")
        : (contract.net_clp_fixed ?? "");

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      {contract && <input type="hidden" name="id" value={contract.id} />}

      <div className="form-row">
        <div className="field">
          <label>Modalidad</label>
          <select name="modality" defaultValue={contract?.modality ?? "retainer"}>
            {Object.entries(MODALITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Moneda del neto</label>
          <select name="currency" defaultValue={contract?.currency ?? "UF"}>
            <option value="UF">UF (indexado)</option>
            <option value="CLP">CLP (fijo)</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Neto por cuota</label>
          <input
            name="net_amount"
            inputMode="decimal"
            defaultValue={String(netDefault)}
            placeholder="45 (UF) · 650000 (CLP)"
            required
          />
          <span className="hint">
            El neto (sin IVA). En UF usa decimales (45,0); en CLP el monto entero.
          </span>
        </div>
        <div className="field">
          <label>N° de cuotas</label>
          <input
            name="installments_count"
            type="number"
            min={1}
            defaultValue={contract?.installments_count ?? ""}
            placeholder="Retainer: dejar vacío"
          />
          <span className="hint">Proyecto / plazo fijo. En retainer se deja vacío.</span>
        </div>
      </div>

      <label
        style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--muted)" }}
      >
        <input
          type="checkbox"
          name="has_iva"
          defaultChecked={contract ? contract.has_iva : true}
          style={{ width: "auto" }}
        />
        Afecto a IVA (19%). Desmarcar si es exento.
      </label>

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
