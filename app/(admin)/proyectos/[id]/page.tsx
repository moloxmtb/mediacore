import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ProjectForm from "@/components/admin/ProjectForm";
import PhaseForm from "@/components/admin/PhaseForm";
import DeliverableForm from "@/components/admin/DeliverableForm";
import ActionForm from "@/components/admin/ActionForm";
import EventForm from "@/components/admin/EventForm";
import DeleteButton from "@/components/admin/DeleteButton";
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
import { actualizarProyecto, eliminarProyecto } from "../actions";
import { actualizarFase, crearFase, eliminarFase } from "../actions";
import {
  actualizarHito,
  crearHito,
  eliminarHito,
} from "../hitos-actions";
import {
  actualizarEntregable,
  crearEntregable,
  eliminarEntregable,
} from "@/app/(admin)/entregables/actions";
import {
  actualizarAccion,
  crearAccion,
  eliminarAccion,
} from "@/app/(admin)/acciones/actions";

export default async function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: project },
    { data: clients },
    { data: phasesData },
    { data: delivData },
    { data: actionsData },
    { data: eventsData },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase
      .from("phases")
      .select("*")
      .eq("project_id", id)
      .order("sort_order", { ascending: true })
      .order("start_date", { ascending: true }),
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
  const phaseOptions = phases.map((ph) => ({ id: ph.id, name: ph.name }));
  const phaseName = (pid: string | null) =>
    pid ? (phases.find((x) => x.id === pid)?.name ?? "—") : "—";

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`Proyecto · ${PROJECT_STATUS_LABELS[p.status]}`}
      />
      <div className="app-content">
        <Link href="/proyectos" className="back-link">
          ← Volver a proyectos
        </Link>

        <div className="stack">
          {/* Ficha */}
          <div className="card">
            <div className="card-head">
              <h3>Ficha del proyecto</h3>
              <Link href={`/gantt?p=${p.id}`} className="btn btn-sm">
                Ver en la Gantt
              </Link>
            </div>
            <div className="card-body">
              <ProjectForm
                action={actualizarProyecto}
                clients={clients ?? []}
                project={p}
                submitLabel="Guardar cambios"
              />
              <div style={{ marginTop: "18px", borderTop: "1px solid var(--border-soft)", paddingTop: "16px" }}>
                <DeleteButton
                  action={eliminarProyecto}
                  hidden={{ id: p.id }}
                  label="Eliminar proyecto"
                  confirm={`¿Eliminar el proyecto ${p.name}? Se borrarán sus fases, entregables y acciones asociadas.`}
                />
              </div>
            </div>
          </div>

          {/* Fases */}
          <div className="card">
            <div className="card-head">
              <h3>Fases (barras de la Gantt)</h3>
              <span className="tag">{phases.length}</span>
            </div>
            {phases.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Fase</th>
                    <th>Rango</th>
                    <th className="num">Avance</th>
                    <th className="num">Orden</th>
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
                      <td className="num mono" style={{ color: "var(--muted)" }}>
                        {ph.sort_order}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Aún no hay fases. Agrega la primera.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
              {phases.map((ph) => (
                <details key={ph.id}>
                  <summary className="btn btn-sm">Editar · {ph.name}</summary>
                  <div style={{ padding: "16px 2px 6px" }}>
                    <PhaseForm
                      action={actualizarFase}
                      projectId={p.id}
                      phase={ph}
                      submitLabel="Guardar fase"
                    />
                    <div style={{ marginTop: "12px" }}>
                      <DeleteButton
                        action={eliminarFase}
                        hidden={{ id: ph.id, project_id: p.id }}
                        label="Eliminar fase"
                        confirm="¿Eliminar esta fase?"
                      />
                    </div>
                  </div>
                </details>
              ))}
              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>
                  + Agregar fase
                </summary>
                <div style={{ padding: "16px 2px 6px" }}>
                  <PhaseForm action={crearFase} projectId={p.id} submitLabel="Crear fase" />
                </div>
              </details>
            </div>
          </div>

          {/* Entregables */}
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
                    <th>Fase</th>
                    <th>Estado</th>
                    <th>Visible</th>
                  </tr>
                </thead>
                <tbody>
                  {deliverables.map((d) => (
                    <tr key={d.id}>
                      <td>{d.title}</td>
                      <td style={{ color: "var(--muted)" }}>{phaseName(d.phase_id)}</td>
                      <td>
                        <span className={`badge ${deliverableStatusBadge(d.status)}`}>
                          {DELIVERABLE_STATUS_LABELS[d.status]}
                        </span>
                      </td>
                      <td className="mono" style={{ color: "var(--faint)" }}>
                        {d.visible_to_client ? "sí" : "no"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Sin entregables todavía.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
              {deliverables.map((d) => (
                <details key={d.id}>
                  <summary className="btn btn-sm">Editar · {d.title}</summary>
                  <div style={{ padding: "16px 2px 6px" }}>
                    <DeliverableForm
                      action={actualizarEntregable}
                      projectId={p.id}
                      phases={phaseOptions}
                      deliverable={d}
                      submitLabel="Guardar entregable"
                    />
                    <div style={{ marginTop: "12px" }}>
                      <DeleteButton
                        action={eliminarEntregable}
                        hidden={{ id: d.id, project_id: p.id }}
                        label="Eliminar entregable"
                        confirm="¿Eliminar este entregable?"
                      />
                    </div>
                  </div>
                </details>
              ))}
              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>
                  + Agregar entregable
                </summary>
                <div style={{ padding: "16px 2px 6px" }}>
                  <DeliverableForm
                    action={crearEntregable}
                    projectId={p.id}
                    phases={phaseOptions}
                    submitLabel="Crear entregable"
                  />
                </div>
              </details>
            </div>
          </div>

          {/* Acciones */}
          <div className="card">
            <div className="card-head">
              <h3>Bitácora de acciones</h3>
              <span className="tag">{actions.length}</span>
            </div>
            {actions.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acción</th>
                    <th>Fase</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {formatDate(a.action_date)}
                      </td>
                      <td>{a.title}</td>
                      <td style={{ color: "var(--muted)" }}>{phaseName(a.phase_id)}</td>
                      <td>{a.kind ? <span className="tag">{a.kind}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Sin acciones registradas todavía.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
              {actions.map((a) => (
                <details key={a.id}>
                  <summary className="btn btn-sm">Editar · {a.title}</summary>
                  <div style={{ padding: "16px 2px 6px" }}>
                    <ActionForm
                      action={actualizarAccion}
                      clientId={p.client_id}
                      projectId={p.id}
                      phases={phaseOptions}
                      actionRecord={a}
                      submitLabel="Guardar acción"
                    />
                    <div style={{ marginTop: "12px" }}>
                      <DeleteButton
                        action={eliminarAccion}
                        hidden={{ id: a.id, project_id: p.id }}
                        label="Eliminar acción"
                        confirm="¿Eliminar esta acción?"
                      />
                    </div>
                  </div>
                </details>
              ))}
              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>
                  + Registrar acción
                </summary>
                <div style={{ padding: "16px 2px 6px" }}>
                  <ActionForm
                    action={crearAccion}
                    clientId={p.client_id}
                    projectId={p.id}
                    phases={phaseOptions}
                    submitLabel="Registrar acción"
                  />
                </div>
              </details>
            </div>
          </div>

          {/* Hitos (calendario) */}
          <div className="card">
            <div className="card-head">
              <h3>Hitos (calendario)</h3>
              <span className="tag">{events.length}</span>
            </div>
            {events.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Hito</th>
                    <th>Cuándo</th>
                    <th>Tipo</th>
                    <th>Origen</th>
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
                      <td>
                        <span className={`badge ${ev.source === "google" ? "b-accent" : "b-idle"}`}>
                          {ev.source === "google" ? "Google" : "panel"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">
                Sin hitos todavía. Los que crees aquí se escriben también en el
                calendario del cliente (si está mapeado y conectado).
              </div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
              {events.map((ev) => (
                <details key={ev.id}>
                  <summary className="btn btn-sm">Editar · {ev.title}</summary>
                  <div style={{ padding: "16px 2px 6px" }}>
                    <EventForm
                      action={actualizarHito}
                      clientId={p.client_id}
                      projectId={p.id}
                      event={ev}
                      submitLabel="Guardar hito"
                    />
                    <div style={{ marginTop: "12px" }}>
                      <DeleteButton
                        action={eliminarHito}
                        hidden={{ id: ev.id, project_id: p.id }}
                        label="Eliminar hito"
                        confirm="¿Eliminar este hito? Si está en Google, también se borra allí."
                      />
                    </div>
                  </div>
                </details>
              ))}
              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>
                  + Agregar hito
                </summary>
                <div style={{ padding: "16px 2px 6px" }}>
                  <EventForm
                    action={crearHito}
                    clientId={p.client_id}
                    projectId={p.id}
                    submitLabel="Crear hito"
                  />
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
