"use client";

import { useActionState } from "react";
import { solicitarReunion, type FormState } from "@/app/(portal)/portal/calendario/reunion-actions";

const initial: FormState = { error: null };

export default function SolicitarReunionForm() {
  const [state, formAction, pending] = useActionState(solicitarReunion, initial);

  if (state.ok) {
    return (
      <div className="card-body">
        <span className="badge b-ok">Solicitud enviada. Color Media te contactará para agendar.</span>
      </div>
    );
  }

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <div className="field">
        <label>Motivo de la reunión</label>
        <textarea name="reason" required placeholder="¿Qué quieres conversar?" />
      </div>
      <div className="form-row">
        <div className="field">
          <label>Fecha y hora preferida (opcional)</label>
          <input type="datetime-local" name="preferred_at" />
        </div>
        <div className="field">
          <label>Urgencia</label>
          <select name="urgency" defaultValue="media">
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </div>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </form>
  );
}
