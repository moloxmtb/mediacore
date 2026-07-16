"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "./SlideOver";
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
  useSlideOverAutoClose(state.ok);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      <div className="form-row">
        <div className="field">
          <label>Correo</label>
          <input name="email" type="email" placeholder="persona@empresa.cl" required />
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
      </div>
      <span className="hint">
        Se le enviará un correo con un enlace para que fije su contraseña.
      </span>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && !state.error && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Invitación enviada</span>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary" disabled={pending}>
          {pending ? "Invitando…" : "Invitar usuario"}
        </button>
      </div>
    </form>
  );
}
