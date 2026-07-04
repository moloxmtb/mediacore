import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DELIVERABLE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  deliverableStatusBadge,
  formatDate,
  formatDateTime,
} from "@/lib/format";
import type {
  Action,
  CalendarEvent,
  Deliverable,
  Phase,
  Project,
} from "@/lib/types";

export default async function PortalProyectoDetalle({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePortalWorld("content");
  const supabase = await createClient();

  // RLS: si el proyecto no es del cliente, project viene null -> notFound.
  // Fases, entregables, acciones y eventos ya vienen filtrados por RLS
  // (propios + visible_to_client).
  const [
    { data: project },
    { data: phasesData },
    { data: delivData },
    { data: actionsData },
    { data: eventsData },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("phases")
      .select("*")
      .eq("project_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("deliverables")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("actions")
      .select("*")
      .eq("project_id", id)
      .order("action_date", { ascending: false }),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("project_id", id)
      .order("starts_at", { ascending: true }),
  ]);

  if (!project) notFound();
  const p = project as Project;
  const phases = (phasesData ?? []) as Phase[];
  const deliverables = (delivData ?? []) as Deliverable[];
  const actions = (actionsData ?? []) as Action[];
  const events = (eventsData ?? []) as CalendarEvent[];

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`Proyecto · ${PROJECT_STATUS_LABELS[p.status]}`}
      />
      <div className="app-content">
        <Link href="/portal/proyectos" className="back-link">
          ← Volver a proyectos
        </Link>

        <div className="stack">
          {p.description && (
            <div className="card">
              <div className="card-body">
                <p style={{ margin: 0, color: "var(--muted)" }}>{p.description}</p>
              </div>
            </div>
          )}

          {/* Fases / avance */}
          <div className="card">
            <div className="card-head">
              <h3>Fases y avance</h3>
              <Link href={`/portal/avance?p=${p.id}`} className="btn btn-sm">
                Ver en la carta Gantt
              </Link>
            </div>
            {phases.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Fase</th>
                    <th>Rango</th>
                    <th className="num">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map((ph) => (
                    <tr key={ph.id}>
                      <td>{ph.name}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {formatDate(ph.start_date)} → {formatDate(ph.end_date)}
                      </td>
                      <td className="num mono">{ph.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Aún no hay fases publicadas.</div>
            )}
          </div>

          {/* Entregables visibles */}
          <div className="card">
            <div className="card-head">
              <h3>Entregables</h3>
              <span className="tag">{deliverables.length}</span>
            </div>
            {deliverables.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Entregable</th>
                    <th>Estado</th>
                    <th>Entregado</th>
                  </tr>
                </thead>
                <tbody>
                  {deliverables.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noreferrer" className="row-link">
                            {d.title} ↗
                          </a>
                        ) : (
                          d.title
                        )}
                        {d.result && <div className="meta" style={{ marginTop: "3px" }}>{d.result}</div>}
                      </td>
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
              <div className="empty">Aún no hay entregables publicados.</div>
            )}
          </div>

          {/* Hitos */}
          {events.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Hitos</h3>
                <span className="tag">{events.length}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Hito</th>
                    <th>Cuándo</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.title}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {formatDateTime(ev.starts_at)}
                      </td>
                      <td>{ev.kind ? <span className="tag">{ev.kind}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Actividad reciente (acciones visibles) */}
          {actions.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Actividad reciente</h3>
                <span className="tag">{actions.length}</span>
              </div>
              <ul className="feed" style={{ margin: 0, padding: "6px 0", listStyle: "none" }}>
                {actions.map((a) => (
                  <li
                    key={a.id}
                    style={{ display: "flex", gap: "14px", padding: "12px 18px", borderBottom: "1px solid var(--border-soft)" }}
                  >
                    <span className="mono" style={{ color: "var(--faint)", width: "72px", flexShrink: 0, fontSize: "11.5px" }}>
                      {formatDate(a.action_date)}
                    </span>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500 }}>{a.title}</div>
                      {a.description && (
                        <div className="meta" style={{ marginTop: "2px" }}>{a.description}</div>
                      )}
                      {a.result && (
                        <div style={{ fontSize: "12.5px", color: "var(--text)", marginTop: "6px", padding: "8px 10px", background: "var(--panel-2)", borderLeft: "2px solid var(--accent)", borderRadius: "4px" }}>
                          {a.result}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
