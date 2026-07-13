import PageHeader from "@/components/PageHeader";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signEntregable } from "@/lib/storage";
import { deliverableClientLabel, deliverableClientBadge, formatDateTime } from "@/lib/format";
import type { DeliverableApproval } from "@/lib/types";
import { responderEntregable } from "./actions";

type Row = {
  id: string;
  title: string;
  description: string | null;
  approval_status: DeliverableApproval;
  sent_at: string | null;
  client_comment: string | null;
  responded_at: string | null;
  project_id: string;
  projects: { name: string } | null;
};

export default async function PortalEntregablesPage() {
  await requirePortalWorld("content");
  const supabase = await createClient();

  // Solo los entregables del FLUJO NUEVO (en_flujo_aprobacion=true): borradores
  // creados a propósito + enviados + respondidos. Los legacy (flag false por
  // default) NO aparecen. La RLS ya limita a los de su empresa y visibles. Un
  // 'borrador' acá = en preparación (fresco o en corrección): sin archivo (gate).
  const { data } = await supabase
    .from("deliverables")
    .select("id, title, description, approval_status, sent_at, client_comment, responded_at, project_id, projects(name)")
    .eq("en_flujo_aprobacion", true)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  // Archivos: la RLS de deliverable_files solo devuelve los de entregables
  // enviados (no borrador) → los "en preparación" no traen archivo, correcto.
  const { data: files } = rows.length
    ? await supabase.from("deliverable_files").select("deliverable_id, path, file_name").in("deliverable_id", rows.map((r) => r.id))
    : { data: [] };
  const fileByDeliv = new Map(((files ?? []) as { deliverable_id: string; path: string; file_name: string | null }[]).map((f) => [f.deliverable_id, f]));
  const urlByDeliv = new Map<string, string>();
  for (const [id, f] of fileByDeliv) {
    const u = await signEntregable(f.path, f.file_name);
    if (u) urlByDeliv.set(id, u);
  }

  return (
    <>
      <PageHeader title="Entregables" subtitle="Tus piezas, manuales y reportes con Color Media" />
      <div className="app-content">
        <div className="card">
          <div className="card-head">
            <h3>Tus entregables</h3>
            <span className="tag">{rows.length}</span>
          </div>
          {rows.length ? (
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {rows.map((d) => {
                const url = urlByDeliv.get(d.id);
                const enviado = d.approval_status === "enviado";
                return (
                  <div key={d.id} style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 500 }}>{d.title}</div>
                        <div className="meta">{d.projects?.name ?? ""}</div>
                        {d.description && <div className="meta" style={{ marginTop: "2px" }}>{d.description}</div>}
                      </div>
                      <span className={`badge ${deliverableClientBadge(d.approval_status)}`}>{deliverableClientLabel(d.approval_status)}</span>
                    </div>

                    {/* Archivo (solo cuando ya te lo enviaron) */}
                    {url ? (
                      <div style={{ marginTop: "10px" }}>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Ver / descargar archivo</a>
                      </div>
                    ) : d.approval_status === "borrador" ? (
                      <p className="hint" style={{ marginTop: "8px" }}>Color Media está preparando esta versión. Te avisamos cuando esté lista para revisar.</p>
                    ) : null}

                    {/* Responder (solo si está por revisar) */}
                    {enviado ? (
                      <form action={responderEntregable} style={{ marginTop: "12px" }}>
                        <input type="hidden" name="id" value={d.id} />
                        <textarea name="comment" rows={2} placeholder="Comentario (opcional)…" style={{ width: "100%" }} />
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                          <button className="btn btn-sm btn-primary" type="submit" name="decision" value="aprobado">Aprobar</button>
                          <button className="btn btn-sm" type="submit" name="decision" value="cambios_solicitados">Pedir cambios</button>
                          <button className="btn btn-sm" type="submit" name="decision" value="rechazado">Rechazar</button>
                        </div>
                      </form>
                    ) : d.responded_at ? (
                      <div style={{ marginTop: "10px" }} className="meta">
                        Respondiste el {formatDateTime(d.responded_at)}
                        {d.client_comment ? ` · "${d.client_comment}"` : ""}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">Aún no hay entregables para revisar.</div>
          )}
        </div>
      </div>
    </>
  );
}
