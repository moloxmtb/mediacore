"use client";

import { useActionState, useState } from "react";
import { agregarVideo, type FormState } from "@/app/(admin)/contenido/actions";
import { parseVideoUrl } from "@/lib/video";

const initial: FormState = { error: null };

/** Pega un link de YouTube/Vimeo: detecta el proveedor (fiable) y pre-selecciona
 *  el formato (adivinanza corregible). El selector es la fuente de verdad final. */
export default function AddVideoForm({ versionId }: { versionId: string }) {
  const [state, formAction, pending] = useActionState(agregarVideo, initial);
  const [url, setUrl] = useState("");
  const [orientation, setOrientation] = useState(""); // "" = seguir la adivinanza

  const parsed = parseVideoUrl(url);
  const effectiveOrientation = orientation || parsed?.orientationGuess || "horizontal";

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="version_id" value={versionId} />
      <div className="field">
        <label>Link de video (YouTube o Vimeo)</label>
        <input
          name="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setOrientation(""); }}
          placeholder="https://youtu.be/… · https://vimeo.com/…"
        />
        {url && (parsed
          ? <span className="hint">Detectado: <b>{parsed.provider}</b> · formato sugerido {parsed.orientationGuess}</span>
          : <span className="hint" style={{ color: "var(--bad)" }}>El link no es de YouTube ni Vimeo.</span>)}
      </div>
      <div className="field">
        <label>Formato</label>
        <select name="orientation" value={effectiveOrientation} onChange={(e) => setOrientation(e.target.value)}>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary dbtn-sm" disabled={pending || !parsed}>
          {pending ? "Agregando…" : "Agregar video"}
        </button>
      </div>
    </form>
  );
}
