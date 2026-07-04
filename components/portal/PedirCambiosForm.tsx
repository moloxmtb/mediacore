"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(portal)/portal/contenido/actions";

const initial: FormState = { error: null };

export default function PedirCambiosForm({
  action,
  pieceId,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  pieceId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none", marginTop: "8px" }}>
      <input type="hidden" name="id" value={pieceId} />
      <div className="field">
        <textarea name="comment" placeholder="¿Qué te gustaría cambiar?" required />
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Enviado a Color Media</span>}
      <div className="form-actions">
        <button className="btn btn-sm btn-primary" disabled={pending}>
          {pending ? "Enviando…" : "Enviar pedido de cambios"}
        </button>
      </div>
    </form>
  );
}
