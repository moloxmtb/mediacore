"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "./SlideOver";
import type { FormState } from "@/app/(admin)/clientes/ficha-actions";
import type { ClientContact } from "@/lib/types";

const initial: FormState = { error: null };

export default function ContactoForm({
  action,
  clientId,
  contact,
  submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  contact?: ClientContact;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useSlideOverAutoClose(state.ok);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <div className="form-row">
        <div className="field">
          <label>Nombre</label>
          <input name="name" defaultValue={contact?.name ?? ""} required />
        </div>
        <div className="field">
          <label>Cargo / rol</label>
          <input name="role" defaultValue={contact?.role ?? ""} placeholder="Gerenta de Finanzas" />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>Teléfono</label>
          <input name="phone" defaultValue={contact?.phone ?? ""} placeholder="+56 9 1234 5678" />
        </div>
        <div className="field">
          <label>Correo</label>
          <input name="email" type="email" defaultValue={contact?.email ?? ""} />
        </div>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Contacto guardado</span>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary dbtn-sm" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
