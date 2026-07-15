import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import TareaForm from "@/components/admin/TareaForm";
import NotificarButton from "@/components/admin/NotificarButton";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TASK_TYPE_LABELS,
  TASK_STATUS_LABELS,
  taskStatusBadge,
  formatDate,
} from "@/lib/format";
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

  return (
    <>
      <PageHeader title="Tareas" subtitle="Pendientes internas y del cliente" />
      <div className="app-content">
        <div className="stack">
          {/* Crear tarea */}
          <div className="card">
            <div className="card-head">
              <h3>Nueva tarea</h3>
            </div>
            <div className="card-body">
              <TareaForm
                clients={clients}
                internalMembers={internalMembers}
                portalByClient={portalByClient}
              />
            </div>
          </div>

          {/* Lista + filtros */}
          <div className="card">
            <div className="card-head">
              <h3>Todas las tareas</h3>
              <span className="tag">{rows.length} registros</span>
            </div>

            {/* Filtros (GET: se reflejan en la URL) */}
            <div className="card-body" style={{ borderBottom: "1px solid var(--border-soft)" }}>
              <form method="get" style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Estado</label>
                  <select name="estado" defaultValue={estadoFilter}>
                    <option value="">Todos</option>
                    {ESTADOS.map((e) => (
                      <option key={e} value={e}>{TASK_STATUS_LABELS[e]}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Empresa</label>
                  <select name="empresa" defaultValue={empresaFilter}>
                    <option value="">Todas</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-sm" type="submit">Filtrar</button>
                {(estadoFilter || empresaFilter) && (
                  <Link href="/tareas" className="btn btn-sm">Limpiar</Link>
                )}
              </form>
            </div>

            {rows.length ? (
              <table>
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
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{t.titulo}</div>
                        {t.descripcion && (
                          <div className="meta" style={{ marginTop: "2px" }}>{t.descripcion}</div>
                        )}
                      </td>
                      <td>
                        <Link href={`/clientes/${t.client_id}`} className="row-link">
                          {t.clients?.name ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <span className="tag">{TASK_TYPE_LABELS[t.tipo]}</span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {t.responsable_id ? nameById.get(t.responsable_id) ?? "—" : <span className="meta">Sin asignar</span>}
                      </td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {formatDate(t.plazo)}
                      </td>
                      <td>
                        <span className={`badge ${taskStatusBadge(t.estado)}`}>
                          {TASK_STATUS_LABELS[t.estado]}
                        </span>
                      </td>
                      <td className="num">
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {t.estado === "pendiente" && (
                            <form action={marcarHecha}>
                              <input type="hidden" name="id" value={t.id} />
                              <button className="btn btn-sm" type="submit">Marcar hecha</button>
                            </form>
                          )}
                          {t.estado === "hecha" && (
                            <>
                              <form action={confirmarTarea}>
                                <input type="hidden" name="id" value={t.id} />
                                <button className="btn btn-sm btn-primary" type="submit">Confirmar</button>
                              </form>
                              <form action={reabrirTarea}>
                                <input type="hidden" name="id" value={t.id} />
                                <button className="btn btn-sm" type="submit">Reabrir</button>
                              </form>
                            </>
                          )}
                          {t.estado === "confirmada" && (
                            <form action={reabrirTarea}>
                              <input type="hidden" name="id" value={t.id} />
                              <button className="btn btn-sm" type="submit">Reabrir</button>
                            </form>
                          )}
                          {/* Notificar: render incondicional — la RLS ya limitó las
                              filas a clientes que el actor puede ver = puede actuar
                              (canActOnClient). No es owner-only como cobros. */}
                          <NotificarButton kind="tarea" id={t.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">
                {estadoFilter || empresaFilter
                  ? "No hay tareas con esos filtros."
                  : "Aún no hay tareas. Crea la primera arriba."}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
