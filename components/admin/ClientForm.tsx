"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/clientes/actions";
import type { Client } from "@/lib/types";
import { CLIENT_STATUS_LABELS, SEGMENT_LABELS } from "@/lib/format";

const initial: FormState = { error: null };

export default function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  client?: Client;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="form">
      {client && <input type="hidden" name="id" value={client.id} />}

      <div className="field">
        <label>Nombre</label>
        <input name="name" defaultValue={client?.name ?? ""} required autoFocus />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Segmento</label>
          <select name="segment" defaultValue={client?.segment ?? "pyme"}>
            {Object.entries(SEGMENT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Estado</label>
          <select name="status" defaultValue={client?.status ?? "activo"}>
            {Object.entries(CLIENT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>RUT</label>
          <input
            name="rut"
            defaultValue={client?.rut ?? ""}
            placeholder="76.543.210-K"
          />
        </div>
        <div className="field">
          <label>Correo de contacto</label>
          <input
            name="contact_email"
            type="email"
            defaultValue={client?.contact_email ?? ""}
            placeholder="contacto@empresa.cl"
          />
        </div>
      </div>

      <div className="field" style={{ maxWidth: "220px" }}>
        <label>Color de acento</label>
        <input
          name="accent_color"
          type="color"
          defaultValue={client?.accent_color ?? "#3DBDCB"}
          style={{ height: "42px", padding: "4px" }}
        />
        <span className="hint">Identifica al cliente en tablas y gráficos.</span>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Cambios guardados</span>}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
