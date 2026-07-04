import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { getSessionProfile } from "@/lib/auth";

/**
 * Layout del portal del cliente (solo rol client, solo lectura). El
 * middleware ya impide que un admin caiga aquí; esta comprobación es
 * defensa en profundidad. El cliente NUNCA ve tarifas ni estado de pago:
 * esas tablas no tienen política de lectura para él (ver schema.sql).
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role !== "client") redirect("/dashboard");

  return (
    <div className="app-main">
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "stretch", gap: "14px" }}>
          <div
            className="brand-bars"
            aria-hidden="true"
            style={{ height: "34px" }}
          >
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1 style={{ fontSize: "17px" }}>Color Media</h1>
            <p>Portal del cliente</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "13px", color: "var(--muted)" }}>
            {session.fullName ?? session.email}
          </span>
          <form action={logout}>
            <button type="submit" className="logout-btn">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <div className="app-content">{children}</div>
    </div>
  );
}
