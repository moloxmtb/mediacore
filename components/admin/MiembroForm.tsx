"use client";

import { useActionState } from "react";
import { invitarMiembroInterno, type FormState } from "@/app/(admin)/equipo/actions";

const initial: FormState = { error: null };

/** Crea un miembro interno del equipo (ejecutivo/productor). Le llega un correo
 *  para fijar contraseña; hasta que acepta, la cuenta no tiene acceso. */
export default function MiembroForm() {
  const [state, formAction, pending] = useActionState(invitarMiembroInterno, initial);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <div className="form-row">
        <div className="field">
          <label>Nombre</label>
          <input name="nombre" placeholder="Ana Pérez" required />
        </div>
        <div className="field">
          <label>Correo</label>
          <input name="email" type="email" placeholder="ana@colormedia.cl" required />
        </div>
        <div className="field">
          <label>Rol interno</label>
          <select name="admin_role" defaultValue="ejecutivo">
            <option value="ejecutivo">Ejecutivo</option>
            <option value="productor">Productor</option>
          </select>
        </div>
      </div>
      <span className="hint">
        Se le enviará un correo con un enlace para fijar su contraseña. La cuenta no
        tiene acceso al panel hasta que la acepte. Luego le asignas sus clientes.
      </span>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && !state.error && <span className="badge-soft">Miembro invitado</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Invitando…" : "Invitar miembro"}
        </button>
      </div>
    </form>
  );
}
