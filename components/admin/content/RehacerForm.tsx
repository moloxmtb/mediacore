"use client";

import { useActionState } from "react";
import { crearVersion, type FormState } from "@/app/(admin)/contenido/actions";

const initial: FormState = { error: null };

/** "Rehacer": crea una versión nueva copiando los medios (atómico). Muestra el
 *  error si la copia falla, en vez de dejar una versión con medios incompletos. */
export default function RehacerForm({ pieceId }: { pieceId: string }) {
  const [state, formAction, pending] = useActionState(crearVersion, initial);
  return (
    <form action={formAction} style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <input type="hidden" name="piece_id" value={pieceId} />
      <button className="btn btn-sm" type="submit" disabled={pending}>
        {pending ? "Copiando medios…" : "Rehacer (nueva versión)"}
      </button>
      {state.error && <div className="form-error">{state.error}</div>}
    </form>
  );
}
