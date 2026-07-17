import Link from "next/link";
import Brand from "@/components/Brand";

/**
 * 404 global: URLs que no calzan con ninguna ruta. No puede usar el shell del
 * panel (no hay sesión garantizada aquí), así que repite el encuadre suelto del
 * login. El 404 CON shell es app/(admin)/not-found.tsx, que cubre el panel.
 */
export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--surface-panel)",
          border: "0.5px solid var(--v2-line)",
          borderRadius: "14px",
          padding: "30px 28px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          alignItems: "flex-start",
        }}
      >
        <Brand size="sm" caption="Panel interno" />
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: "19px", letterSpacing: "-.01em" }}>Aquí no hay nada</h1>
          <p className="mut" style={{ margin: 0, fontSize: "13.5px" }}>
            La dirección no corresponde a ninguna página. Si llegaste por un enlace, puede estar viejo.
          </p>
        </div>
        <Link href="/" className="dbtn dbtn-sm" style={{ ["--sec" as string]: "var(--tx-2)" }}>
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
