import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import {
  DELIVERABLE_STATUS_LABELS,
  deliverableStatusBadge,
  formatDate,
} from "@/lib/format";
import type { DeliverableStatus } from "@/lib/types";

type Row = {
  id: string;
  title: string;
  status: DeliverableStatus;
  result: string | null;
  delivered_at: string | null;
  project_id: string;
  projects: { name: string; clients: { name: string } | null } | null;
  phases: { name: string } | null;
};

export default async function EntregablesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deliverables")
    .select(
      "id, title, status, result, delivered_at, project_id, projects(name, clients(name)), phases(name)",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Entregables"
        subtitle="Piezas, manuales, cápsulas y reportes por proyecto"
      />
      <div className="app-content">
        <div className="card">
          <div className="card-head">
            <h3>Todos los entregables</h3>
            <span className="tag">{rows.length} registros</span>
          </div>
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Entregable</th>
                  <th>Proyecto</th>
                  <th>Fase</th>
                  <th>Estado</th>
                  <th>Entregado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/proyectos/${d.project_id}`} className="row-link">
                        {d.title}
                      </Link>
                      {d.result && (
                        <div className="meta" style={{ marginTop: "3px" }}>
                          {d.result}
                        </div>
                      )}
                    </td>
                    <td style={{ color: "var(--muted)" }}>
                      {d.projects?.name ?? "—"}
                      {d.projects?.clients?.name ? (
                        <div className="meta">{d.projects.clients.name}</div>
                      ) : null}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{d.phases?.name ?? "—"}</td>
                    <td>
                      <span className={`badge ${deliverableStatusBadge(d.status)}`}>
                        {DELIVERABLE_STATUS_LABELS[d.status]}
                      </span>
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {formatDate(d.delivered_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              Aún no hay entregables. Se crean desde la ficha de cada proyecto.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
