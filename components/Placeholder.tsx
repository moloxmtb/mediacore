import PageHeader from "@/components/PageHeader";

/**
 * Sección aún no construida. La Fase 1 solo entrega fundaciones (auth +
 * ruteo por rol); estas vistas se llenan en fases posteriores del PLAN.
 */
export default function Placeholder({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle?: string;
  phase: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="app-content">
        <div className="note">
          <span className="badge-soft">{phase}</span>
          <p style={{ margin: "10px 0 0" }}>
            Esta sección se construye en una fase posterior del plan. La
            navegación y el acceso por rol ya funcionan: esto confirma que el
            área de administración enruta correctamente.
          </p>
        </div>
      </div>
    </>
  );
}
