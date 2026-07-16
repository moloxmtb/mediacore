import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import TareaForm from "@/components/admin/TareaForm";
import NotificarButton from "@/components/admin/NotificarButton";
import SlideOver from "@/components/admin/SlideOver";
import StateChip from "@/components/admin/StateChip";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TASK_TYPE_LABELS,
  TASK_STATUS_LABELS,
  formatDate,
} from "@/lib/format";
import { stStyle as st, taskTone, todaySantiago } from "@/lib/estado";
import type { TaskStatus, TaskType } from "@/lib/types";
import { marcarHecha, confirmarTarea, reabrirTarea } from "./actions";

type Row = {
  id: string;
  client_id: string;
  tipo: TaskType;
  titulo: string;
  descripcion: string | null;
  responsable_id: string | null;
  plazo: string | null;
  estado: TaskStatus;
  clients: { name: string } | null;
};

const ESTADOS: TaskStatus[] = ["pendiente", "hecha", "confirmada"];
const SEC = "var(--sec-tareas)";

const IcoCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; empresa?: string }>;
}) {
  await requireAdminRole("tareas");
  const { estado, empresa } = await searchParams;
  const estadoFilter = ESTADOS.includes(estado as TaskStatus) ? (estado as TaskStatus) : "";

  const supabase = await createClient();

  // Clientes accesibles por RLS (owner: todos; ejecutivo/productor: asignados).
  // Sirven de opciones de empresa en el filtro y en el formulario, y acotan la
  // consulta de usuarios de portal (lección Fase 3: service_role siempre ACOTADO).
  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  const clients = (clientsData ?? []) as { id: string; name: string }[];
  const accessibleIds = clients.map((c) => c.id);
  const empresaFilter = accessibleIds.includes(empresa ?? "") ? (empresa as string) : "";

  // Responsables posibles (SOLO id + nombre — decisión 2: nada de emails/roles):
  //  - internos: todo el roster del equipo (role='admin');
  //  - de portal: usuarios de los clientes ACCESIBLES, agrupados por empresa.
  const admin = createAdminClient();
  const [{ data: internalData }, { data: portalData }] = await Promise.all([
    admin.from("profiles").select("id, full_name").eq("role", "admin"),
    accessibleIds.length
      ? admin
          .from("profiles")
          .select("id, full_name, client_id")
          .eq("role", "client")
          .in("client_id", accessibleIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; client_id: string }[] }),
  ]);

  const internalMembers = (internalData ?? []).map((p) => ({
    id: p.id as string,
    name: ((p.full_name as string | null) || "(sin nombre)") as string,
  }));
  const portalByClient: Record<string, { id: string; name: string }[]> = {};
  const nameById = new Map<string, string>();
  for (const m of internalMembers) nameById.set(m.id, m.name);
  for (const p of (portalData ?? []) as { id: string; full_name: string | null; client_id: string }[]) {
    const name = (p.full_name || "(sin nombre)") as string;
    (portalByClient[p.client_id] ??= []).push({ id: p.id, name });
    nameById.set(p.id, name);
  }

  // Lista PLANA (decisión 3): columna empresa + filtros por estado y empresa,
  // sin agrupar. La RLS ya limita las filas a los clientes accesibles.
  let q = supabase
    .from("tasks")
    .select("id, client_id, tipo, titulo, descripcion, responsable_id, plazo, estado, clients(name)")
    .order("created_at", { ascending: false });
  if (estadoFilter) q = q.eq("estado", estadoFilter);
  if (empresaFilter) q = q.eq("client_id", empresaFilter);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const hoy = todaySantiago();

  return (
    <>
      <PageHeader title="Tareas" subtitle="Pendientes internas y del cliente" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div className="dbox">
          <div className="dbox-head">
            <span className="dh-ico"><IcoCheck /></span>
            <h3>Todas las tareas</h3>
            <span className="dcount">{rows.length}</span>
            <div className="dhead-actions">
              <SlideOver title="Nueva tarea" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Nueva tarea</>}>
                <TareaForm clients={clients} internalMembers={internalMembers} portalByClient={portalByClient} />
              </SlideOver>
            </div>
          </div>

          {/* Filtros (GET: se reflejan en la URL) */}
          <div className="dbox-body" style={{ borderBottom: "0.5px solid var(--v2-line)" }}>
            <form method="get" style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", marginBottom: "5px" }}>Estado</label>
                <select name="estado" defaultValue={estadoFilter}>
                  <option value="">Todos</option>
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>{TASK_STATUS_LABELS[e]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "5px" }}>Empresa</label>
                <select name="empresa" defaultValue={empresaFilter}>
                  <option value="">Todas</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button className="dbtn dbtn-sm" type="submit">Filtrar</button>
              {(estadoFilter || empresaFilter) && (
                <Link href="/tareas" className="dbtn dbtn-sm">Limpiar</Link>
              )}
            </form>
          </div>

          {rows.length ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Empresa</th>
                  <th>Tipo</th>
                  <th>Responsable</th>
                  <th>Plazo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  // MAPA §3: pendiente vencida → rojo; hecha/confirmada → verde.
                  const tone = taskTone(t.estado, t.plazo, hoy);
                  const vencida = tone === "bad";
                  return (
                    <tr key={t.id} className="drow" style={st(tone)}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{t.titulo}</div>
                        {t.descripcion && <div className="mut" style={{ marginTop: "2px", fontSize: "12px" }}>{t.descripcion}</div>}
                      </td>
                      <td>
                        <Link href={`/clientes/${t.client_id}`} className="row-link">{t.clients?.name ?? "—"}</Link>
                      </td>
                      {/* Tipo (interna/cliente) = eje propio, pill de borde */}
                      <td><span className="dtype">{TASK_TYPE_LABELS[t.tipo]}</span></td>
                      <td className="mut">
                        {t.responsable_id ? nameById.get(t.responsable_id) ?? "—" : <span className="mut">Sin asignar</span>}
                      </td>
                      <td className="mono mut">{formatDate(t.plazo)}</td>
                      <td>
                        <StateChip tone={tone} label={vencida ? "Atrasada" : TASK_STATUS_LABELS[t.estado]} />
                      </td>
                      <td className="num">
                        {/* Acción principal con texto en el tono; el resto, iconos. */}
                        <div className="dacts">
                          {t.estado === "pendiente" && (
                            <form action={marcarHecha}>
                              <input type="hidden" name="id" value={t.id} />
                              <button className="dbtn dbtn-sm dbtn-primary" type="submit">Marcar hecha</button>
                            </form>
                          )}
                          {t.estado === "hecha" && (
                            <>
                              <form action={confirmarTarea}>
                                <input type="hidden" name="id" value={t.id} />
                                <button className="dbtn dbtn-sm dbtn-primary" type="submit">Confirmar</button>
                              </form>
                              <form action={reabrirTarea}>
                                <input type="hidden" name="id" value={t.id} />
                                <button className="dact" data-tip="Reabrir" aria-label="Reabrir" type="submit">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                                </button>
                              </form>
                            </>
                          )}
                          {t.estado === "confirmada" && (
                            <form action={reabrirTarea}>
                              <input type="hidden" name="id" value={t.id} />
                              <button className="dact" data-tip="Reabrir" aria-label="Reabrir" type="submit">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                              </button>
                            </form>
                          )}
                          {/* La RLS ya limitó las filas a clientes accionables (canActOnClient). */}
                          <NotificarButton kind="tarea" id={t.id} icon sec={SEC} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="dempty">
              <span>{estadoFilter || empresaFilter ? "No hay tareas con esos filtros." : "Aún no hay tareas."}</span>
              {!estadoFilter && !empresaFilter && (
                <SlideOver title="Nueva tarea" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Nueva tarea</>}>
                  <TareaForm clients={clients} internalMembers={internalMembers} portalByClient={portalByClient} />
                </SlideOver>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
