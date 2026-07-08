import PageHeader from "@/components/PageHeader";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TASK_STATUS_LABELS, taskStatusBadge, formatDate } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";
import { marcarHechaPortal } from "./actions";

type Row = {
  id: string;
  titulo: string;
  descripcion: string | null;
  responsable_id: string | null;
  plazo: string | null;
  estado: TaskStatus;
};

export default async function PortalTareasPage() {
  const session = await requirePortalWorld("content");
  const supabase = await createClient();

  // RLS de Fase A: solo tareas tipo 'cliente' de SU empresa (company-wide).
  // Las 'interna' y las de otras empresas no son visibles.
  const { data } = await supabase
    .from("tasks")
    .select("id, titulo, descripcion, responsable_id, plazo, estado")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  // Nombres de responsables (colegas de la misma empresa). Fetch service_role
  // ACOTADO a TRES condiciones obligatorias, todas del lado servidor:
  //   1) client_id = session.clientId (de la SESIÓN, nunca de input del cliente)
  //   2) role = 'client'
  //   3) select solo id + full_name (nada de email/teléfono/client_role/metadata)
  const nameById = new Map<string, string>();
  if (session.clientId) {
    const admin = createAdminClient();
    const { data: colegas } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("client_id", session.clientId)
      .eq("role", "client");
    for (const c of colegas ?? []) nameById.set(c.id as string, (c.full_name as string | null) || "(sin nombre)");
  }

  const responsableLabel = (rid: string | null) =>
    !rid ? "Sin asignar" : rid === session.userId ? "Tú" : nameById.get(rid) ?? "—";

  return (
    <>
      <PageHeader title="Tareas" subtitle="Lo pendiente de tu empresa con Color Media" />
      <div className="app-content">
        <div className="card">
          <div className="card-head">
            <h3>Tareas de tu empresa</h3>
            <span className="tag">{rows.length} registros</span>
          </div>

          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Responsable</th>
                  <th>Plazo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const mia = t.responsable_id === session.userId;
                  return (
                    <tr key={t.id} style={mia ? { background: "var(--accent-soft, rgba(61,189,203,0.06))" } : undefined}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 500 }}>{t.titulo}</span>
                          {mia && <span className="badge b-accent">Tuya</span>}
                        </div>
                        {t.descripcion && (
                          <div className="meta" style={{ marginTop: "2px" }}>{t.descripcion}</div>
                        )}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{responsableLabel(t.responsable_id)}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>{formatDate(t.plazo)}</td>
                      <td>
                        <span className={`badge ${taskStatusBadge(t.estado)}`}>
                          {TASK_STATUS_LABELS[t.estado]}
                        </span>
                      </td>
                      <td className="num">
                        {t.estado === "pendiente" && (
                          <form action={marcarHechaPortal}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="btn btn-sm btn-primary" type="submit">Marcar hecha</button>
                          </form>
                        )}
                        {/* hecha y confirmada: sin acciones. Confirmada es terminal
                            (la confirma Color Media); hecha espera confirmación. */}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">No hay tareas pendientes con tu empresa por ahora.</div>
          )}
        </div>
      </div>
    </>
  );
}
