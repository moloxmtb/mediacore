"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/contenido/actions";
import { PERIOD_KIND_LABELS } from "@/lib/content";

const initial: FormState = { error: null };

export default function PeriodForm({
  action,
  clients,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  clients: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="form">
      <div className="form-row">
        <div className="field">
          <label>Cliente</label>
          <select name="client_id" defaultValue="" required>
            <option value="" disabled>
              Elige un cliente…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Cadencia</label>
          <select name="kind" defaultValue="mensual">
            {Object.entries(PERIOD_KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Etiqueta del período</label>
        <input name="label" placeholder="Julio 2026 · Semana 28" required />
      </div>
      <div className="form-row">
        <div className="field">
          <label>Inicio (opcional)</label>
          <input name="start_date" type="date" />
        </div>
        <div className="field">
          <label>Término (opcional)</label>
          <input name="end_date" type="date" />
        </div>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Creando…" : "Crear período"}
        </button>
      </div>
    </form>
  );
}
