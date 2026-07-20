import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import SlideOver from "@/components/admin/SlideOver";
import NotificarButton from "@/components/admin/NotificarButton";
import {
  SubirVersionForm,
  ResponderClienteForm,
  EditarTextoForm,
} from "@/components/admin/entregables/DeliverableForms";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signEntregable } from "@/lib/storage";
import { deliverableApprovalLabel, formatDateTime } from "@/lib/format";
import { deliverableApprovalTone } from "@/lib/estado";
import type { DeliverableApproval, DeliverableReview, DeliverableVersion } from "@/lib/types";
import { enviarAlCliente } from "../aprobacion-actions";

const SEC = "var(--sec-entregables)";

const IcoPackage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>
);
const IcoChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
);
const IcoLayers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
);
const IcoPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);

/** Etiqueta de cada entrada del historial, según quién y qué. */
function entryLabel(r: DeliverableReview): string {
  if (r.kind === "version") return "Versión nueva";
  if (r.kind === "texto") return "Editó el texto";
  if (r.kind === "comentario") return r.actor === "admin" ? "Color Media" : "Cliente";
  if (r.kind === "aprobacion") return "El cliente aprobó";
  if (r.kind === "cambios") return "El cliente pidió cambios";
  return "El cliente rechazó";
}

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
    .select("id, title, description, approval_status, sent_at, responded_at, current_version_id, project_id, projects(name, client_id)")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();

  const proj = d.projects as unknown as { name: string; client_id: string } | null;
  const status = d.approval_status as DeliverableApproval;
  const label = deliverableApprovalLabel(status, d.responded_at as string | null);
  const tone = deliverableApprovalTone[status];

  const [{ data: versData }, { data: revData }] = await Promise.all([
    supabase.from("deliverable_versions").select("*").eq("deliverable_id", id).order("version_number", { ascending: false }),
    supabase.from("deliverable_reviews").select("*").eq("deliverable_id", id).order("created_at", { ascending: true }),
  ]);
  const versions = (versData ?? []) as DeliverableVersion[];
  const reviews = (revData ?? []) as DeliverableReview[];
  const current = versions.find((v) => v.id === d.current_version_id) ?? versions[0] ?? null;
  const previous = versions.filter((v) => v.id !== current?.id);

  // Firmar la actual + las anteriores (descargables).
  const currentUrl = current ? await signEntregable(current.file_path, current.file_name) : null;
  const prevUrls = new Map<string, string>();
  for (const v of previous) {
    const u = await signEntregable(v.file_path, v.file_name);
    if (u) prevUrls.set(v.id, u);
  }

  // Nombres de los autores del historial (portal + staff → service_role).
  const authorIds = [...new Set(reviews.map((r) => r.created_by).filter((x): x is string => !!x))];
  const nameById = new Map<string, string>();
  if (authorIds.length) {
    const { data: profs } = await createAdminClient().from("profiles").select("id, full_name").in("id", authorIds);
    for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name) nameById.set(p.id, p.full_name);
    }
  }

  const puedeEnviar = ["borrador", "cambios_solicitados", "rechazado"].includes(status) && !!current;

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
          {/* Estado + versión actual + acciones */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoPackage /></span>
              <h3>Entregable</h3>
              <div className="dhead-actions">
                <StateChip tone={tone} label={label} />
                <SlideOver
                  title="Editar texto"
                  sec={SEC}
                  triggerClass="dact"
                  triggerTip="Editar título y descripción"
                  triggerAria="Editar texto"
                  trigger={<IcoPencil />}
                >
                  <EditarTextoForm id={id} title={d.title as string} description={(d.description as string | null) ?? null} />
                </SlideOver>
              </div>
            </div>
            <div className="dbox-body">
              {d.description && <p style={{ margin: 0, color: "var(--tx-1)" }}>{d.description}</p>}
              {status === "enviado" && d.sent_at && (
                <div className="mut" style={{ fontSize: "12px", marginTop: "8px" }}>
                  Enviado al cliente · {formatDateTime(d.sent_at as string)}
                </div>
              )}

              <div style={{ marginTop: "14px" }}>
                {current && currentUrl ? (
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">
                      Ver versión {current.version_number}{current.file_name ? ` · ${current.file_name}` : ""}
                    </a>
                    {current.note && <span className="mut" style={{ fontSize: "12.5px" }}>“{current.note}”</span>}
                  </div>
                ) : (
                  <span className="mut" style={{ fontSize: "12.5px" }}>Aún sin archivo. Sube una versión para poder enviarla al cliente.</span>
                )}
              </div>

              <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <SlideOver
                  title="Subir versión nueva"
                  sec={SEC}
                  triggerClass="dbtn dbtn-primary dbtn-sm"
                  trigger={<>+ Subir versión nueva</>}
                >
                  <SubirVersionForm id={id} />
                </SlideOver>
                {puedeEnviar && (
                  <form action={enviarAlCliente}>
                    <input type="hidden" name="id" value={id} />
                    <button className="dbtn dbtn-sm" type="submit">Enviar al cliente</button>
                  </form>
                )}
                <SlideOver
                  title="Responder al cliente"
                  sec={SEC}
                  triggerClass="dbtn dbtn-sm"
                  trigger={<>Responder</>}
                >
                  <ResponderClienteForm id={id} />
                </SlideOver>
                <NotificarButton kind="entregable" id={id} icon sec={SEC} />
              </div>
              <p className="mut" style={{ marginTop: "10px", fontSize: "12.5px" }}>
                Subir una versión nueva la envía al cliente y le avisa, todo junto. El archivo anterior
                se conserva y queda descargable más abajo.
              </p>
            </div>
          </div>

          {/* Conversación */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoChat /></span>
              <h3>Conversación</h3>
              <span className="dcount">{reviews.length}</span>
            </div>
            {reviews.length ? (
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      borderLeft: `3px solid ${r.actor === "client" ? "var(--st-wait)" : "var(--sec)"}`,
                      paddingLeft: "12px",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <span className="dtype">{entryLabel(r)}</span>
                      <span className="mut" style={{ fontSize: "11.5px" }}>
                        {r.created_by && nameById.get(r.created_by) ? `${nameById.get(r.created_by)} · ` : ""}
                        {formatDateTime(r.created_at)}
                      </span>
                    </div>
                    {r.body && (
                      <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", color: "var(--tx-1)", fontSize: "13.5px" }}>
                        {r.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="dempty">Todavía no hay movimientos.</div>
            )}
          </div>

          {/* Versiones anteriores */}
          {previous.length > 0 && (
            <div className="dbox">
              <div className="dbox-head">
                <span className="dh-ico"><IcoLayers /></span>
                <h3>Versiones anteriores</h3>
                <span className="dcount">{previous.length}</span>
              </div>
              <table className="dtable">
                <thead>
                  <tr><th>Versión</th><th>Qué cambió</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {previous.map((v) => (
                    <tr key={v.id}>
                      <td className="mono">v{v.version_number}</td>
                      <td className="mut">{v.note ?? "—"}</td>
                      <td className="mono mut">{formatDateTime(v.created_at)}</td>
                      <td className="num">
                        {prevUrls.get(v.id) ? (
                          <a href={prevUrls.get(v.id)} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">Descargar</a>
                        ) : (
                          <span className="mut">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
