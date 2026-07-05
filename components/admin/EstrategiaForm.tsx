"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/clientes/contexto-actions";
import type { ClientStrategy } from "@/lib/types";

const initial: FormState = { error: null };

export default function EstrategiaForm({
  action,
  clientId,
  strategy,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  strategy: ClientStrategy | null;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />

      <div className="field">
        <label>Objetivo</label>
        <input name="objetivo" defaultValue={strategy?.objetivo ?? ""} placeholder="Qué buscamos lograr con este cliente" />
      </div>
      <div className="field">
        <label>Público</label>
        <input name="publico" defaultValue={strategy?.publico ?? ""} placeholder="A quién le hablamos" />
      </div>
      <div className="field">
        <label>Mensajes clave</label>
        <input name="mensajes_clave" defaultValue={strategy?.mensajes_clave ?? ""} placeholder="Las ideas que se repiten en todo" />
      </div>
      <div className="field">
        <label>Narrativa (texto libre, admite Markdown)</label>
        <textarea name="cuerpo" defaultValue={strategy?.cuerpo ?? ""} style={{ minHeight: "180px" }} placeholder={"De qué se trata el trabajo y hacia dónde apunta.\n\nAdmite **negritas**, listas con - y títulos con ##."} />
        <span className="hint">Formato Markdown: **negritas**, *cursivas*, listas con “- ”, títulos con “## ”, enlaces [texto](url).</span>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Estrategia guardada</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar estrategia"}
        </button>
      </div>
    </form>
  );
}
