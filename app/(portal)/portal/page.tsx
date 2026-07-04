import { getSessionProfile } from "@/lib/auth";

export default async function PortalHomePage() {
  const session = await getSessionProfile();

  return (
    <div className="card">
      <div className="card-body">
      <span className="badge-soft">Fase 1 · Fundaciones</span>
      <h2 style={{ fontSize: "16px", margin: "12px 0 6px" }}>
        Bienvenido a tu portal
      </h2>
      <p style={{ color: "var(--muted)", maxWidth: "560px" }}>
        Este es tu espacio de solo lectura. Aquí verás tus proyectos, tu carta
        Gantt, tus entregables y —lo más importante— qué viene: los próximos
        hitos ordenados en el tiempo. Ese contenido se construye en la Fase 6.
        Por ahora, esto confirma que ingresaste como cliente y que el ruteo por
        rol funciona.
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
  );
}
