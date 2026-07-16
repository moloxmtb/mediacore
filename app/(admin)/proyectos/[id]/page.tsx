import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ProjectForm from "@/components/admin/ProjectForm";
import PhaseForm from "@/components/admin/PhaseForm";
import DeliverableForm from "@/components/admin/DeliverableForm";
import ActionForm from "@/components/admin/ActionForm";
import EventForm from "@/components/admin/EventForm";
import DeleteButton from "@/components/admin/DeleteButton";
import NotificarButton from "@/components/admin/NotificarButton";
import SlideOver from "@/components/admin/SlideOver";
import { CollapsibleBox, CollapseControl } from "@/components/admin/CollapsibleBox";
import StateChip from "@/components/admin/StateChip";
import { stStyle as st, phaseTone, deliverableTone, hitoTone } from "@/lib/estado";
import { createClient } from "@/lib/supabase/server";
import {
  DELIVERABLE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  deliverableApprovalLabel,
  formatDate,
  formatDateTime,
} from "@/lib/format";
import type {
  Action,
  CalendarEvent,
  Deliverable,
  DeliverableApproval,
  Phase,
  Project,
} from "@/lib/types";

/** select("*") trae los campos del flujo de aprobación, que el tipo base no declara. */
type DeliverableRow = Deliverable & {
  approval_status: DeliverableApproval | null;
  en_flujo_aprobacion: boolean | null;
  responded_at: string | null;
};
import { actualizarProyecto, eliminarProyecto } from "../actions";
import { actualizarFase, crearFase, eliminarFase } from "../actions";
import { actualizarHito, crearHito, eliminarHito } from "../hitos-actions";
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

// Tono fijo por sección/objeto (brief v2).
const SEC = {
  ficha: "#8a9499", // neutro (identidad de la página)
  proyectos: "#9b87e6", // violeta
  entregables: "#d879b4", // rosado (objeto global)
  bitacora: "#8c96b5", // gris azulado (objeto global)
  hitos: "#7d89f2", // índigo (objeto global)
} as const;


// ---- iconos ----
const IcoDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
);
const IcoBars = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h11M4 12h16M4 17h7" /></svg>
);
const IcoPackage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>
);
const IcoList = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
);
const IcoFlag = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 21V4M4 4h13l-2 4 2 4H4" /></svg>
);
const IcoPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);


// Envuelto en helper de módulo (el server component renderiza una vez por request).
function nowMs(): number {
  return Date.now();
}


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
    supabase.from("phases").select("*").eq("project_id", id).order("sort_order").order("start_date"),
    supabase.from("deliverables").select("*").eq("project_id", id).order("created_at"),
    supabase.from("actions").select("*").eq("project_id", id).order("action_date", { ascending: false }),
    supabase.from("calendar_events").select("*").eq("project_id", id).order("starts_at"),
  ]);

  if (!project) notFound();
  const p = project as Project;
  const phases = (phasesData ?? []) as Phase[];
  const deliverables = (delivData ?? []) as DeliverableRow[];
  const actions = (actionsData ?? []) as Action[];
  const events = (eventsData ?? []) as CalendarEvent[];
  const phaseOptions = phases.map((ph) => ({ id: ph.id, name: ph.name }));
  const phaseName = (pid: string | null) => (pid ? phases.find((x) => x.id === pid)?.name ?? "—" : "—");
  const now = nowMs();

  return (
    <>
      <PageHeader title={p.name} subtitle={`Proyecto · ${PROJECT_STATUS_LABELS[p.status]}`} />
      <div className="dsx">
        <Link href="/proyectos" className="dback">← Volver a proyectos</Link>

        <CollapseControl />

        <div className="dstack">
          {/* ---------- Ficha (NEUTRO) ---------- */}
          <CollapsibleBox
            id="ficha"
            defaultOpen
            sec={SEC.ficha}
            icon={<IcoDoc />}
            title="Ficha del proyecto"
            actions={<Link href={`/gantt?p=${p.id}`} className="dbtn dbtn-sm">Ver en la Gantt</Link>}
          >
            <div className="dbox-body">
              <ProjectForm action={actualizarProyecto} clients={clients ?? []} project={p} submitLabel="Guardar cambios" />
              <div style={{ marginTop: "18px", borderTop: "0.5px solid rgba(255,255,255,.06)", paddingTop: "16px" }}>
                <DeleteButton
                  action={eliminarProyecto}
                  hidden={{ id: p.id }}
                  label="Eliminar proyecto"
                  confirm={`¿Eliminar el proyecto ${p.name}? Se borrarán sus fases, entregables y acciones asociadas.`}
                />
              </div>
            </div>
          </CollapsibleBox>

          {/* ---------- Fases (VIOLETA) ---------- */}
          <CollapsibleBox
            id="fases"
            defaultOpen={false}
            sec={SEC.proyectos}
            icon={<IcoBars />}
            title="Fases"
            count={phases.length}
            actions={
              <SlideOver title="Nueva fase" sec={SEC.proyectos} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar</>}>
                <PhaseForm action={crearFase} projectId={p.id} submitLabel="Crear fase" />
              </SlideOver>
            }
          >
            {phases.length ? (
              <table className="dtable">
                <thead><tr><th>Fase</th><th>Rango</th><th className="num">Avance</th><th className="num">Orden</th><th></th></tr></thead>
                <tbody>
                  {phases.map((ph) => (
                    <tr key={ph.id} className="drow" style={st(phaseTone(ph.progress))}>
                      <td>{ph.name}</td>
                      <td className="mono mut">{formatDate(ph.start_date)} → {formatDate(ph.end_date)}</td>
                      <td className="num">{ph.progress}%</td>
                      <td className="num mut">{ph.sort_order}</td>
                      <td className="num">
                        <div className="dacts">
                          <SlideOver title={`Editar · ${ph.name}`} sec={SEC.proyectos} triggerClass="dact" triggerTip="Editar" trigger={<IcoPencil />}>
                            <PhaseForm action={actualizarFase} projectId={p.id} phase={ph} submitLabel="Guardar fase" />
                          </SlideOver>
                          <DeleteButton icon action={eliminarFase} hidden={{ id: ph.id, project_id: p.id }} label="Eliminar" confirm="¿Eliminar esta fase?" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">Aún no hay fases. Agrégalas con “+ Agregar”.</div>
            )}
          </CollapsibleBox>

          {/* ---------- Entregables (ROSADO, objeto global) ---------- */}
          <CollapsibleBox
            id="entregables"
            defaultOpen={false}
            sec={SEC.entregables}
            icon={<IcoPackage />}
            title="Entregables"
            count={deliverables.length}
            actions={
              <SlideOver title="Nuevo entregable" sec={SEC.entregables} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar</>}>
                <DeliverableForm action={crearEntregable} projectId={p.id} phases={phaseOptions} submitLabel="Crear entregable" />
              </SlideOver>
            }
          >
            {deliverables.length ? (
              <table className="dtable">
                <thead><tr><th>Entregable</th><th>Fase</th><th>Estado</th><th>Visible</th><th></th></tr></thead>
                <tbody>
                  {deliverables.map((d) => (
                    <tr key={d.id} className="drow" style={st(deliverableTone(d))}>
                      <td>{d.title}</td>
                      <td className="mut">{phaseName(d.phase_id)}</td>
                      <td><StateChip tone={deliverableTone(d)} label={d.en_flujo_aprobacion && d.approval_status ? deliverableApprovalLabel(d.approval_status, d.responded_at) : DELIVERABLE_STATUS_LABELS[d.status]} /></td>
                      <td>{d.visible_to_client ? <span className="dtype">Visible</span> : <span className="dtype">Interno</span>}</td>
                      <td className="num">
                        <div className="dacts">
                          <SlideOver title={`Editar · ${d.title}`} sec={SEC.entregables} triggerClass="dact" triggerTip="Editar" trigger={<IcoPencil />}>
                            <DeliverableForm action={actualizarEntregable} projectId={p.id} phases={phaseOptions} deliverable={d} submitLabel="Guardar entregable" />
                          </SlideOver>
                          <DeleteButton icon action={eliminarEntregable} hidden={{ id: d.id, project_id: p.id }} label="Eliminar" confirm="¿Eliminar este entregable?" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">Sin entregables todavía.</div>
            )}
          </CollapsibleBox>

          {/* ---------- Bitácora de acciones (GRIS AZULADO, objeto global) ---------- */}
          <CollapsibleBox
            id="bitacora"
            defaultOpen={false}
            sec={SEC.bitacora}
            icon={<IcoList />}
            title="Bitácora de acciones"
            count={actions.length}
            actions={
              <SlideOver title="Registrar acción" sec={SEC.bitacora} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar</>}>
                <ActionForm action={crearAccion} clientId={p.client_id} projectId={p.id} phases={phaseOptions} submitLabel="Registrar acción" />
              </SlideOver>
            }
          >
            {actions.length ? (
              <table className="dtable">
                <thead><tr><th>Fecha</th><th>Acción</th><th>Fase</th><th>Tipo</th><th></th></tr></thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td className="mono mut">{formatDate(a.action_date)}</td>
                      <td>{a.title}</td>
                      <td className="mut">{phaseName(a.phase_id)}</td>
                      <td>{a.kind ? <span className="dtype">{a.kind}</span> : "—"}</td>
                      <td className="num">
                        <div className="dacts">
                          <SlideOver title={`Editar · ${a.title}`} sec={SEC.bitacora} triggerClass="dact" triggerTip="Editar" trigger={<IcoPencil />}>
                            <ActionForm action={actualizarAccion} clientId={p.client_id} projectId={p.id} phases={phaseOptions} actionRecord={a} submitLabel="Guardar acción" />
                          </SlideOver>
                          <DeleteButton icon action={eliminarAccion} hidden={{ id: a.id, project_id: p.id }} label="Eliminar" confirm="¿Eliminar esta acción?" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">Sin acciones registradas todavía.</div>
            )}
          </CollapsibleBox>

          {/* ---------- Hitos (ÍNDIGO, objeto global) ---------- */}
          <CollapsibleBox
            id="hitos"
            defaultOpen={false}
            sec={SEC.hitos}
            icon={<IcoFlag />}
            title="Hitos"
            count={events.length}
            actions={
              <SlideOver title="Nuevo hito" sec={SEC.hitos} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar</>}>
                <EventForm action={crearHito} clientId={p.client_id} projectId={p.id} submitLabel="Crear hito" />
              </SlideOver>
            }
          >
            {events.length ? (
              <table className="dtable">
                <thead><tr><th>Hito</th><th>Cuándo</th><th>Estado</th><th>Origen</th><th></th></tr></thead>
                <tbody>
                  {events.map((ev) => {
                    const past = new Date(ev.starts_at).getTime() < now;
                    const tone = hitoTone(ev.starts_at, now);
                    return (
                      <tr key={ev.id} className="drow" style={st(tone)}>
                        <td>{ev.title}</td>
                        <td className="mono mut">{formatDateTime(ev.starts_at)}</td>
                        <td><StateChip tone={tone} label={past ? "Cumplido" : "Próximo"} /></td>
                        <td><span className="dtype">{ev.source === "google" ? "Google" : "panel"}</span></td>
                        <td className="num">
                          <div className="dacts">
                            <SlideOver title={`Editar · ${ev.title}`} sec={SEC.hitos} triggerClass="dact" triggerTip="Editar" trigger={<IcoPencil />}>
                              <EventForm action={actualizarHito} clientId={p.client_id} projectId={p.id} event={ev} submitLabel="Guardar hito" />
                              <div style={{ marginTop: "14px", borderTop: "0.5px solid rgba(255,255,255,.06)", paddingTop: "12px" }}>
                                <NotificarButton kind="hito" id={ev.id} />
                              </div>
                            </SlideOver>
                            <DeleteButton icon action={eliminarHito} hidden={{ id: ev.id, project_id: p.id }} label="Eliminar" confirm="¿Eliminar este hito? Si está en Google, también se borra allí." />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="dempty">
                Sin hitos todavía. Los que crees aquí se escriben también en el calendario del cliente (si está mapeado y conectado).
              </div>
            )}
          </CollapsibleBox>
        </div>
      </div>
    </>
  );
}
