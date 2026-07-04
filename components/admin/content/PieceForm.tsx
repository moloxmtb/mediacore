"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/contenido/actions";

const initial: FormState = { error: null };

/** Crea una pieza (nombre interno + copy + imagen) o sube una versión nueva. */
export default function PieceForm({
  action,
  mode,
  periodId,
  pieceId,
  submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  mode: "create" | "version";
  periodId?: string;
  pieceId?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      {mode === "create" && <input type="hidden" name="period_id" value={periodId} />}
      {mode === "version" && <input type="hidden" name="piece_id" value={pieceId} />}

      {mode === "create" && (
        <div className="field">
          <label>Nombre interno de la pieza</label>
          <input name="title" placeholder="Reel receta · Carrusel producto…" required />
        </div>
      )}

      <div className="field">
        <label>Copy del post</label>
        <textarea name="body" placeholder="El texto que acompaña la pieza…" />
      </div>

      {mode === "version" && (
        <div className="field">
          <label>Qué cambió</label>
          <input name="note" placeholder="Ej. Ajuste de copy y nueva foto" />
        </div>
      )}

      <div className="field">
        <label>Imagen{mode === "version" ? " (opcional: se mantiene la anterior si no subes)" : ""}</label>
        <input name="image" type="file" accept="image/*" />
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Guardado</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
