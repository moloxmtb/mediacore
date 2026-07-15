"use client";

import { useActionState } from "react";
import { notificarObjeto, type NotifyState } from "@/app/(admin)/notificar-actions";
import type { NotifyKind } from "@/lib/notify-manual";

const initial: NotifyState = { error: null };

/**
 * Botón contextual "notificar" para cualquiera de los 7 objetos. Se le pasa
 * {kind, id}; el usuario elige audiencia (Equipo/Cliente, SIN preselección) y un
 * mensaje opcional. El muro de permiso vive en la acción/servidor (gate + guard
 * de actor); esto es solo la UI.
 */
export default function NotificarButton({ kind, id }: { kind: NotifyKind; id: string }) {
  const [state, formAction, pending] = useActionState(notificarObjeto, initial);

  return (
    <details className="notificar">
      <summary className="btn btn-sm">Notificar</summary>
      <form action={formAction} style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px", maxWidth: "360px" }}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />

        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: "14px", fontSize: "13px" }}>
          <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input type="radio" name="audience" value="equipo" required /> Equipo
          </label>
          <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input type="radio" name="audience" value="cliente" required /> Cliente
          </label>
        </fieldset>

        <textarea name="message" rows={2} placeholder="Mensaje (opcional)…" style={{ width: "100%" }} />

        <div>
          <button className="btn btn-sm btn-primary" type="submit" disabled={pending}>
            {pending ? "Enviando…" : "Enviar aviso"}
          </button>
        </div>

        {state.error && <div className="form-error">{state.error}</div>}
        {state.ok && state.skipped && <div className="hint">{state.skipped}</div>}
        {state.ok && !state.skipped && <span className="badge-soft">Aviso enviado ({state.sent})</span>}
      </form>
    </details>
  );
}
