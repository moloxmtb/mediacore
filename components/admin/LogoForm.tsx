"use client";

import { useActionState } from "react";
import { subirLogo, quitarLogo, type FormState } from "@/app/(admin)/clientes/ficha-actions";

const initial: FormState = { error: null };

/** Sube / reemplaza / quita el logo de la empresa. Sin editor de recorte: el
 *  archivo se sube tal cual. Validación (imagen + ≤2MB) en la server action. */
export default function LogoForm({
  clientId,
  logoUrl,
}: {
  clientId: string;
  logoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(subirLogo, initial);

  return (
    <div className="logo-form">
      <div className="logo-current">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo actual" className="logo-preview" />
        ) : (
          <div className="empty" style={{ padding: "18px 12px", minWidth: "120px", textAlign: "center" }}>
            Sin logo
          </div>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <form action={formAction} className="form" style={{ maxWidth: "none" }}>
          <input type="hidden" name="client_id" value={clientId} />
          <div className="field">
            <label>{logoUrl ? "Reemplazar logo" : "Subir logo"}</label>
            <input type="file" name="logo" accept="image/*" required />
            <span className="hint">
              PNG con fondo transparente y buena resolución. Máximo 2 MB. Se muestra tal cual, sin recorte.
            </span>
          </div>
          {state.error && <div className="form-error">{state.error}</div>}
          {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Logo guardado</span>}
          <div className="form-actions">
            <button className="dbtn dbtn-primary dbtn-sm" disabled={pending}>
              {pending ? "Subiendo…" : logoUrl ? "Reemplazar logo" : "Subir logo"}
            </button>
          </div>
        </form>

        {logoUrl && (
          <form action={quitarLogo} style={{ marginTop: "10px" }}>
            <input type="hidden" name="client_id" value={clientId} />
            <button className="btn btn-sm btn-danger" type="submit">Quitar logo</button>
          </form>
        )}
      </div>
    </div>
  );
}
