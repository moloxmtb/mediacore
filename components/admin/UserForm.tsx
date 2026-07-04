"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/clientes/usuarios-actions";
import { CLIENT_ROLE_LABELS } from "@/lib/format";

const initial: FormState = { error: null };

export default function UserForm({
  action,
  clientId,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      <div className="form-row">
        <div className="field">
          <label>Correo</label>
          <input name="email" type="email" placeholder="persona@empresa.cl" required />
        </div>
        <div className="field">
          <label>Contraseña inicial</label>
          <input name="password" type="text" placeholder="mín. 8 caracteres" required />
        </div>
      </div>
      <div className="field">
        <label>Rol en el portal</label>
        <select name="client_role" defaultValue="content">
          {Object.entries(CLIENT_ROLE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Usuario creado</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}
