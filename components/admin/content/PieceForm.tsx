"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/contenido/actions";

const initial: FormState = { error: null };

/** Crea una pieza (nombre interno + copy). Los medios se agregan luego con el
 *  editor de medios sobre su versión en borrador. */
export default function PieceForm({
  action,
  periodId,
  submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  periodId: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="period_id" value={periodId} />
      <div className="field">
        <label>Nombre interno de la pieza</label>
        <input name="title" placeholder="Reel receta · Carrusel producto…" required />
      </div>
      <div className="field">
        <label>Copy del post</label>
        <textarea name="body" placeholder="El texto que acompaña la pieza…" />
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Pieza creada — ahora agrégale medios</span>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary" disabled={pending}>
          {pending ? "Creando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
