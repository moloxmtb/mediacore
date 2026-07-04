import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import {
  DELIVERABLE_STATUS_LABELS,
  deliverableStatusBadge,
  formatDateTime,
} from "@/lib/format";
import type { DeliverableStatus } from "@/lib/types";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  kind: string | null;
  project_id: string | null;
  projects: { name: string } | null;
};
type DeliverableRow = {
  id: string;
  title: string;
  result: string | null;
  status: DeliverableStatus;
  project_id: string;
  projects: { name: string } | null;
};

export default async function QueVienePage() {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // RLS filtra a lo del propio cliente y con visible_to_client = true.
  const [{ data: events }, { data: deliverables }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, title, description, starts_at, kind, project_id, projects(name)")
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(20),
    supabase
      .from("deliverables")
      .select("id, title, result, status, project_id, projects(name)")
      .neq("status", "aprobado")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const hitos = (events ?? []) as unknown as EventRow[];
  const entregables = (deliverables ?? []) as unknown as DeliverableRow[];

  return (
    <>
      <PageHeader
        title="Qué viene"
        subtitle="Lo próximo en tus proyectos, ordenado en el tiempo"
      />
      <div className="app-content">
        <div className="grid-2">
          {/* Próximos hitos */}
          <div className="card">
            <div className="card-head">
              <h3>Próximos hitos</h3>
              <span className="tag">{hitos.length}</span>
            </div>
            {hitos.length ? (
              <ul className="feed" style={{ margin: 0, padding: "6px 0", listStyle: "none" }}>
                {hitos.map((h) => (
                  <li
                    key={h.id}
                    style={{ display: "flex", gap: "14px", padding: "12px 18px", borderBottom: "1px solid var(--border-soft)" }}
                  >
                    <span
                      className="mono"
                      style={{ color: "var(--accent)", width: "92px", flexShrink: 0, fontSize: "12px" }}
                    >
                      {formatDateTime(h.starts_at)}
                    </span>
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 500 }}>{h.title}</div>
                      <div className="meta">
                        {h.projects?.name ?? ""}
                        {h.kind ? ` · ${h.kind}` : ""}
                      </div>
                      {h.description && (
                        <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "3px" }}>
                          {h.description}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">No hay hitos próximos por ahora.</div>
            )}
          </div>

          {/* Entregables en curso */}
          <div className="card">
            <div className="card-head">
              <h3>Entregables en curso</h3>
              <span className="tag">{entregables.length}</span>
            </div>
            {entregables.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Entregable</th>
                    <th>Proyecto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {entregables.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/portal/proyectos/${d.project_id}`} className="row-link">
                          {d.title}
                        </Link>
                        {d.result && <div className="meta" style={{ marginTop: "3px" }}>{d.result}</div>}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{d.projects?.name ?? "—"}</td>
                      <td>
                        <span className={`badge ${deliverableStatusBadge(d.status)}`}>
                          {DELIVERABLE_STATUS_LABELS[d.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">No hay entregables en curso.</div>
            )}
          </div>
        </div>

        <div className="note">
          <p style={{ margin: 0 }}>
            Aquí ves solo lo que Color Media marcó como visible para ti. Cualquier
            duda sobre tus proyectos, escríbenos.
          </p>
        </div>
      </div>
    </>
  );
}
