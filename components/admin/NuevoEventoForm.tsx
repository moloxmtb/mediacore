"use client";

import { useActionState } from "react";
import { crearEventoCalendario, type FormState } from "@/app/(admin)/calendario/evento-actions";

const initial: FormState = { error: null };

export default function NuevoEventoForm({
  clients,
  defaultDate,
}: {
  clients: { id: string; name: string }[];
  defaultDate?: string;
}) {
  const [state, formAction, pending] = useActionState(crearEventoCalendario, initial);
  const startDefault = defaultDate ? `${defaultDate}T10:00` : "";

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <div className="form-row">
        <div className="field">
          <label>Cliente</label>
          <select name="client_id" required defaultValue="">
            <option value="" disabled>Elige…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tipo</label>
          <select name="kind" defaultValue="reunion">
            <option value="reunion">Reunión</option>
            <option value="rodaje">Rodaje</option>
            <option value="otro">Otro evento</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Título</label>
        <input name="title" required placeholder="Reunión de kickoff" />
      </div>
      <div className="field">
        <label>Descripción (opcional)</label>
        <textarea name="description" />
      </div>
      <div className="form-row">
        <div className="field">
          <label>Inicio</label>
          <input type="datetime-local" name="starts_at" required defaultValue={startDefault} />
        </div>
        <div className="field">
          <label>Fin (opcional)</label>
          <input type="datetime-local" name="ends_at" />
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
        <input type="checkbox" name="visible_to_client" defaultChecked /> Visible para el cliente
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Evento creado y sincronizado</span>}
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Creando…" : "Crear evento"}
        </button>
      </div>
      <span className="hint">Los hitos y entregas se crean en la ficha del proyecto (quedan bien enganchados a la Gantt).</span>
    </form>
  );
}
