"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/cobros/actions";
import type { Installment } from "@/lib/types";
import { useSlideOverAutoClose } from "@/components/admin/SlideOver";

const initial: FormState = { error: null };

export default function CuotaEditForm({
  action,
  installment,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  installment: Installment;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useSlideOverAutoClose(state.ok); // cierra el slide-over al guardar (no-op fuera de él)
  const netDefault =
    installment.currency === "UF"
      ? (installment.net_uf ?? "")
      : (installment.net_clp_fixed ?? "");

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="id" value={installment.id} />
      <div className="form-row">
        <div className="field">
          <label>Neto ({installment.currency})</label>
          <input
            name="net_amount"
            inputMode="decimal"
            defaultValue={String(netDefault)}
            required
          />
          <span className="hint">Cambia el monto para escalonar esta cuota.</span>
        </div>
        <div className="field">
          <label>Vence</label>
          <input
            name="due_date"
            type="date"
            defaultValue={installment.due_date}
            required
          />
        </div>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Cuota actualizada</span>}
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cuota"}
        </button>
      </div>
    </form>
  );
}
