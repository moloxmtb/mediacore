import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signEntregable } from "@/lib/storage";
import { deliverableApprovalLabel, deliverableApprovalBadge, formatDateTime } from "@/lib/format";
import type { DeliverableApproval } from "@/lib/types";
import { enviarAlCliente, reemplazarArchivo } from "../aprobacion-actions";

export default async function EntregableDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminRole("entregables");
  const { id } = await params;
  const supabase = await createClient();

  // RLS: staff solo alcanza entregables de sus clientes (por proyecto).
  const { data: d } = await supabase
    .from("deliverables")
    .select("id, title, description, approval_status, sent_at, client_comment, responded_by, responded_at, project_id, projects(name, client_id)")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();

  const proj = d.projects as unknown as { name: string; client_id: string } | null;
  const status = d.approval_status as DeliverableApproval;
  const label = deliverableApprovalLabel(status, d.responded_at);
  const badge = deliverableApprovalBadge(status, d.responded_at);

  const { data: file } = await supabase
    .from("deliverable_files")
    .select("path, file_name")
    .eq("deliverable_id", id)
    .maybeSingle();
  const fileUrl = file ? await signEntregable(file.path, file.file_name) : null;

  // Nombre del cliente que respondió (portal user → service_role, la RLS de
  // profiles no deja al ejecutivo leer perfiles ajenos).
  let responderName: string | null = null;
  if (d.responded_by) {
    const { data: rp } = await createAdminClient().from("profiles").select("full_name").eq("id", d.responded_by).maybeSingle();
    responderName = (rp?.full_name as string | null) ?? null;
  }

  const puedeEnviar = ["borrador", "cambios_solicitados", "rechazado"].includes(status) && !!file;

  return (
    <>
      <PageHeader title={d.title} subtitle={`Entregable · ${proj?.name ?? ""}`} />
      <div className="app-content">
        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
          <Link href="/entregables" className="back-link">← Volver a entregables</Link>
          {proj?.client_id && <Link href={`/clientes/${proj.client_id}`} className="back-link">Ver ficha del cliente →</Link>}
        </div>

        <div className="stack">
          {/* Estado + archivo + acciones */}
          <div className="card">
            <div className="card-head">
              <h3>Entregable</h3>
              <span className={`badge ${badge}`}>{label}</span>
            </div>
            <div className="card-body">
              {d.description && <p>{d.description}</p>}
              {status === "enviado" && d.sent_at && (
                <div className="meta">Enviado al cliente · {formatDateTime(d.sent_at)}</div>
              )}

              {/* Archivo (staff lo ve en cualquier estado) */}
              <div style={{ marginTop: "14px" }}>
                {fileUrl ? (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Ver archivo actual{file?.file_name ? ` · ${file.file_name}` : ""}</a>
                ) : (
                  <span className="hint">Aún sin archivo. Súbelo para poder enviar al cliente.</span>
                )}
              </div>

              {/* Acciones */}
              <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                {puedeEnviar && (
                  <form action={enviarAlCliente}>
                    <input type="hidden" name="id" value={id} />
                    <button className="btn btn-sm btn-primary" type="submit">Enviar al cliente</button>
                  </form>
                )}
                <form action={reemplazarArchivo} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="id" value={id} />
                  <input type="file" name="file" required />
                  <button className="btn btn-sm" type="submit">{file ? "Reemplazar archivo" : "Subir archivo"}</button>
                </form>
              </div>
              <p className="hint" style={{ marginTop: "10px" }}>
                Reemplazar el archivo lo re-bloquea al cliente (vuelve a borrador); tenés que volver a
                <b> Enviar al cliente</b> cuando esté listo.
              </p>
            </div>
          </div>

          {/* Respuesta del cliente */}
          {(status === "aprobado" || status === "cambios_solicitados" || status === "rechazado" || d.responded_at) && (
            <div className="card">
              <div className="card-head">
                <h3>Respuesta del cliente</h3>
                <span className={`badge ${badge}`}>{label}</span>
              </div>
              <div className="card-body">
                <div className="meta">
                  {responderName ?? "Cliente"}
                  {d.responded_at ? ` · ${formatDateTime(d.responded_at)}` : ""}
                </div>
                {d.client_comment ? (
                  <p style={{ marginTop: "8px" }}>{d.client_comment}</p>
                ) : (
                  <p className="hint" style={{ marginTop: "8px" }}>Sin comentario.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
