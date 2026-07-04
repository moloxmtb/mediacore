import PageHeader from "@/components/PageHeader";
import { getSessionProfile } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getSessionProfile();

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle="Cartera de clientes y estado del mes en curso"
      />
      <div className="app-content">
        <div className="card">
          <span className="badge-soft">Fase 1 · Fundaciones</span>
          <h2 style={{ fontSize: "16px", margin: "12px 0 6px" }}>
            Acceso verificado
          </h2>
          <p style={{ color: "var(--muted)", maxWidth: "560px" }}>
            Estás dentro del panel interno como administrador. La autenticación
            por correo, la sesión y la separación de roles en el middleware
            funcionan. El contenido de esta vista —KPIs, cartera y bitácora— se
            construye en la Fase 2.
          </p>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "8px 18px",
              marginTop: "18px",
              fontSize: "13px",
            }}
          >
            <dt style={{ color: "var(--faint)" }}>Usuario</dt>
            <dd className="mono" style={{ margin: 0 }}>
              {session?.email}
            </dd>
            <dt style={{ color: "var(--faint)" }}>Rol</dt>
            <dd style={{ margin: 0 }}>
              <span className="badge-soft">{session?.role}</span>
            </dd>
          </dl>
        </div>
      </div>
    </>
  );
}
