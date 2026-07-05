"use client";

import { useActionState } from "react";
import { fijarClave, type FormState } from "./actions";

const initial: FormState = { error: null };

export default function FijarClavePage() {
  const [state, formAction, pending] = useActionState(fijarClave, initial);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "380px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div className="brand-bars" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span />
          </div>
          <div style={{ padding: "22px 22px 18px" }}>
            <div style={{ fontFamily: "var(--font-grotesk)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.02em" }}>Color Media</div>
            <div style={{ color: "var(--faint)", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: "3px" }}>Fija tu contraseña</div>
          </div>
        </div>

        <form action={formAction} style={{ padding: "8px 26px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "12px", color: "var(--muted)" }}>
            Nueva contraseña
            <input name="password" type="password" autoComplete="new-password" required minLength={8}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "11px 13px", color: "var(--text)", fontSize: "14px", outline: "none" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "12px", color: "var(--muted)" }}>
            Repite la contraseña
            <input name="confirm" type="password" autoComplete="new-password" required minLength={8}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "11px 13px", color: "var(--text)", fontSize: "14px", outline: "none" }} />
          </label>
          {state.error && <div className="form-error">{state.error}</div>}
          <button type="submit" disabled={pending}
            style={{ marginTop: "4px", background: "var(--accent)", color: "#0c1013", border: "none", borderRadius: "8px", padding: "12px 14px", fontSize: "14px", fontWeight: 600, fontFamily: "var(--font-grotesk)", cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}>
            {pending ? "Guardando…" : "Entrar al portal"}
          </button>
        </form>
      </div>
    </main>
  );
}
