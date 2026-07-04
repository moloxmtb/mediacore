"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r)",
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        {/* Cabecera de marca */}
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div className="brand-bars" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div style={{ padding: "22px 22px 18px" }}>
            <div
              style={{
                fontFamily: "var(--font-grotesk)",
                fontWeight: 700,
                fontSize: "18px",
                letterSpacing: "-0.02em",
              }}
            >
              Color Media
            </div>
            <div
              style={{
                color: "var(--faint)",
                fontSize: "11px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginTop: "3px",
              }}
            >
              Panel interno
            </div>
          </div>
        </div>

        <form
          action={formAction}
          style={{
            padding: "8px 26px 28px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <label style={fieldLabel}>
            Correo
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@correo.cl"
              style={inputStyle}
            />
          </label>

          <label style={fieldLabel}>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              style={inputStyle}
            />
          </label>

          {state.error && (
            <div
              role="alert"
              style={{
                background: "var(--bad-dim)",
                color: "var(--bad)",
                border: "1px solid rgba(225,91,91,.3)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "12.5px",
              }}
            >
              {state.error}
            </div>
          )}

          <button type="submit" disabled={pending} style={buttonStyle(pending)}>
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  fontSize: "12px",
  color: "var(--muted)",
  letterSpacing: "0.02em",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "11px 13px",
  color: "var(--text)",
  fontSize: "14px",
  fontFamily: "inherit",
  outline: "none",
};

function buttonStyle(pending: boolean): React.CSSProperties {
  return {
    marginTop: "4px",
    background: "var(--accent)",
    color: "#0c1013",
    border: "none",
    borderRadius: "8px",
    padding: "12px 14px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "var(--font-grotesk)",
    cursor: pending ? "default" : "pointer",
    opacity: pending ? 0.7 : 1,
  };
}
