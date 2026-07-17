import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import NotificarButton from "@/components/admin/NotificarButton";
import { signEntregable } from "@/lib/storage";
import { deliverableApprovalLabel, formatDateTime } from "@/lib/format";
import { deliverableApprovalTone } from "@/lib/estado";
import type { DeliverableApproval } from "@/lib/types";
import { enviarAlCliente, reemplazarArchivo } from "../aprobacion-actions";

const SEC = "var(--sec-entregables)";

const IcoPackage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
  </svg>
);
const IcoChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

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
  const tone = deliverableApprovalTone[status]; // MAPA §6a

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
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginBottom: "18px" }}>
          <Link href="/entregables" className="dback" style={{ marginBottom: 0 }}>← Volver a entregables</Link>
          {proj?.client_id && (
            <Link href={`/clientes/${proj.client_id}`} className="dback" style={{ marginBottom: 0 }}>Ver ficha del cliente →</Link>
          )}
        </div>

        <div className="dstack">
          {/* Estado + archivo + acciones */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoPackage /></span>
              <h3>Entregable</h3>
              <div className="dhead-actions"><StateChip tone={tone} label={label} /></div>
            </div>
            <div className="dbox-body">
              {d.description && <p style={{ margin: 0, color: "var(--tx-1)" }}>{d.description}</p>}
              {status === "enviado" && d.sent_at && (
                <div className="mut" style={{ fontSize: "12px", marginTop: "8px" }}>
                  Enviado al cliente · {formatDateTime(d.sent_at)}
                </div>
              )}

              {/* Archivo (staff lo ve en cualquier estado) */}
              <div style={{ marginTop: "14px" }}>
                {fileUrl ? (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">
                    Ver archivo actual{file?.file_name ? ` · ${file.file_name}` : ""}
                  </a>
                ) : (
                  <span className="mut" style={{ fontSize: "12.5px" }}>Aún sin archivo. Súbelo para poder enviar al cliente.</span>
                )}
              </div>

              {/* Acciones: la principal (enviar) con texto en el tono; el resto, iconos. */}
              <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                {puedeEnviar && (
                  <form action={enviarAlCliente}>
                    <input type="hidden" name="id" value={id} />
                    <button className="dbtn dbtn-primary dbtn-sm" type="submit">Enviar al cliente</button>
                  </form>
                )}
                <form action={reemplazarArchivo} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="id" value={id} />
                  <input type="file" name="file" required />
                  <button className="dbtn dbtn-sm" type="submit">{file ? "Reemplazar archivo" : "Subir archivo"}</button>
                </form>
                {/* La RLS ya limitó la ficha a staff que puede actuar sobre el cliente. */}
                <NotificarButton kind="entregable" id={id} icon sec={SEC} />
              </div>
              <p className="mut" style={{ marginTop: "10px", fontSize: "12.5px" }}>
                Reemplazar el archivo lo re-bloquea al cliente (vuelve a borrador); tenés que volver a
                <b> Enviar al cliente</b> cuando esté listo.
              </p>
            </div>
          </div>

          {/* Respuesta del cliente */}
          {(status === "aprobado" || status === "cambios_solicitados" || status === "rechazado" || d.responded_at) && (
            <div className="dbox">
              <div className="dbox-head">
                <span className="dh-ico"><IcoChat /></span>
                <h3>Respuesta del cliente</h3>
                <div className="dhead-actions"><StateChip tone={tone} label={label} /></div>
              </div>
              <div className="dbox-body">
                <div className="mut" style={{ fontSize: "12px" }}>
                  {responderName ?? "Cliente"}
                  {d.responded_at ? ` · ${formatDateTime(d.responded_at)}` : ""}
                </div>
                {d.client_comment ? (
                  <p style={{ marginTop: "8px", color: "var(--tx-1)" }}>{d.client_comment}</p>
                ) : (
                  <p className="mut" style={{ marginTop: "8px", fontSize: "12.5px" }}>Sin comentario.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
