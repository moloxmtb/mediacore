"use client";

import { useActionState } from "react";
import { editarCopia, type FormState } from "@/app/(admin)/contenido/actions";

const initial: FormState = { error: null };

/** Edita el copy de la versión en borrador. */
export default function CopyForm({ versionId, body }: { versionId: string; body: string | null }) {
  const [state, formAction, pending] = useActionState(editarCopia, initial);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="version_id" value={versionId} />
      <div className="field">
        <label>Copy del post</label>
        <textarea name="body" defaultValue={body ?? ""} placeholder="El texto que acompaña la pieza…" />
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Copy guardado</span>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary dbtn-sm" disabled={pending}>{pending ? "Guardando…" : "Guardar copy"}</button>
      </div>
    </form>
  );
}
