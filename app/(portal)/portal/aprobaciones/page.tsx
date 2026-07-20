import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import ContentPieceViewer, {
  type ViewerMedia,
  type ViewerPiece,
  type ViewerVersion,
} from "@/components/portal/content/ContentPieceViewer";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signImages, signEntregable } from "@/lib/storage";
import { resolveVideoThumbs } from "@/lib/video-thumbs";
import { formatDateTime } from "@/lib/format";
import {
  stStyle as st,
  contentClientLabel,
  contentClientTone,
  deliverableClientLabel,
  deliverableClientTone,
  deliverableEntryClientLabel,
  type Tone,
} from "@/lib/estado";
import type {
  ContentMedia,
  ContentPiece,
  ContentStatus,
  ContentVersion,
  DeliverableApproval,
  DeliverableReview,
  DeliverableVersion,
} from "@/lib/types";
import { responderEntregable, comentarEntregable } from "../entregables/actions";

const SEC = "var(--accent)";

const STATUS_MESSAGE: Partial<Record<ContentStatus, string>> = {
  aprobada_cliente: "Aprobaste esta pieza. Color Media la confirmará.",
  cambios_solicitados: "Pediste cambios. Estamos trabajando en ello.",
  aprobada: "Pieza aprobada en firme.",
  rechazada: "Color Media revisará y te enviará una nueva versión.",
};

type Filtro = "todo" | "contenido" | "entregables";

function AprTab({ id, label, activo }: { id: Filtro; label: string; activo: boolean }) {
  return (
    <Link
      href={id === "todo" ? "/portal/aprobaciones" : `/portal/aprobaciones?tipo=${id}`}
      className={`dbtn dbtn-sm${activo ? " dbtn-primary" : ""}`}
    >
      {label}
    </Link>
  );
}

type ApprovalItem = {
  key: string;
  tipo: "Contenido" | "Entregable";
  title: string;
  tone: Tone;
  label: string;
  pending: boolean; // "por revisar" → va primero
  body: ReactNode;
};

type DelivRow = {
  id: string;
  title: string;
  description: string | null;
  approval_status: DeliverableApproval;
  current_version_id: string | null;
};

export default async function PortalAprobacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  await requirePortalWorld("content");
  const supabase = await createClient();
  const sp = await searchParams;
  const filtro: Filtro = sp.tipo === "contenido" || sp.tipo === "entregables" ? sp.tipo : "todo";

  // ---------- Contenido (piezas visibles + versiones + medios) ----------
  const { data: piecesData } = await supabase.from("content_pieces").select("*").order("sort_order", { ascending: true });
  const pieces = (piecesData ?? []) as ContentPiece[];
  const pieceIds = pieces.length ? pieces.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"];
  const { data: versData } = await supabase.from("content_versions").select("*").in("piece_id", pieceIds).order("version_number", { ascending: false });
  const versions = (versData ?? []) as ContentVersion[];
  const versionIds = versions.length ? versions.map((v) => v.id) : ["00000000-0000-0000-0000-000000000000"];
  const { data: mediaData } = await supabase.from("content_media").select("*").in("version_id", versionIds).order("sort_order", { ascending: true });
  const media = (mediaData ?? []) as ContentMedia[];

  const signed = await signImages(media.filter((m) => m.kind === "imagen" && m.storage_path).map((m) => m.storage_path!));
  const videoThumbs = await resolveVideoThumbs(media.filter((m) => m.kind === "video").map((m) => ({ provider: m.provider, embedUrl: m.embed_url })));

  const mediaByVersion = new Map<string, ContentMedia[]>();
  for (const m of media) (mediaByVersion.get(m.version_id) ?? mediaByVersion.set(m.version_id, []).get(m.version_id)!).push(m);
  const toViewerMedia = (m: ContentMedia): ViewerMedia =>
    m.kind === "imagen"
      ? { id: m.id, kind: "imagen", thumb: m.storage_path ? (signed[m.storage_path] ?? null) : null, full: m.storage_path ? (signed[m.storage_path] ?? null) : null, provider: null, orientation: m.orientation }
      : { id: m.id, kind: "video", thumb: m.embed_url ? (videoThumbs[m.embed_url] ?? null) : null, full: m.embed_url, provider: m.provider, orientation: m.orientation };
  const toViewerVersion = (v: ContentVersion): ViewerVersion => ({ id: v.id, versionNumber: v.version_number, body: v.body, media: (mediaByVersion.get(v.id) ?? []).map(toViewerMedia) });
  const versionsByPiece = new Map<string, ContentVersion[]>();
  for (const v of versions) (versionsByPiece.get(v.piece_id) ?? versionsByPiece.set(v.piece_id, []).get(v.piece_id)!).push(v);
  const toViewerPiece = (p: ContentPiece): ViewerPiece => {
    const pv = versionsByPiece.get(p.id) ?? [];
    const cur = pv.find((v) => v.id === p.current_version_id) ?? null;
    const past = pv.filter((v) => v.id !== cur?.id);
    return { id: p.id, title: p.title, status: p.status, votable: p.status === "propuesta", statusMessage: STATUS_MESSAGE[p.status] ?? null, current: cur ? toViewerVersion(cur) : null, past: past.map(toViewerVersion) };
  };

  // ---------- Entregables del flujo (visibles) ----------
  const { data: delivData } = await supabase
    .from("deliverables")
    .select("id, title, description, approval_status, current_version_id")
    .eq("en_flujo_aprobacion", true)
    .order("created_at", { ascending: false });
  const delivs = (delivData ?? []) as unknown as DelivRow[];

  // Versiones + conversación de esos entregables (la RLS ya los acotó).
  const delivIds = delivs.length ? delivs.map((d) => d.id) : ["00000000-0000-0000-0000-000000000000"];
  const [{ data: dVersData }, { data: dRevData }] = await Promise.all([
    supabase.from("deliverable_versions").select("*").in("deliverable_id", delivIds).order("version_number", { ascending: false }),
    supabase.from("deliverable_reviews").select("*").in("deliverable_id", delivIds).order("created_at", { ascending: true }),
  ]);
  const allVersions = (dVersData ?? []) as unknown as DeliverableVersion[];
  const allReviews = (dRevData ?? []) as unknown as DeliverableReview[];

  const versionsByDeliv = new Map<string, DeliverableVersion[]>();
  for (const v of allVersions) (versionsByDeliv.get(v.deliverable_id) ?? versionsByDeliv.set(v.deliverable_id, []).get(v.deliverable_id)!).push(v);
  const reviewsByDeliv = new Map<string, DeliverableReview[]>();
  for (const r of allReviews) (reviewsByDeliv.get(r.deliverable_id) ?? reviewsByDeliv.set(r.deliverable_id, []).get(r.deliverable_id)!).push(r);

  // Firmar TODAS las versiones: la actual y las anteriores son descargables.
  const urlByVersion = new Map<string, string>();
  for (const v of allVersions) {
    const u = await signEntregable(v.file_path, v.file_name);
    if (u) urlByVersion.set(v.id, u);
  }

  // ---------- Unificar ----------
  const items: ApprovalItem[] = [];

  for (const p of pieces) {
    items.push({
      key: "c" + p.id,
      tipo: "Contenido",
      title: p.title,
      tone: contentClientTone[p.status],
      label: contentClientLabel[p.status],
      pending: p.status === "propuesta",
      body: <ContentPieceViewer piece={toViewerPiece(p)} hideHeader />,
    });
  }

  for (const d of delivs) {
    const enviado = d.approval_status === "enviado";
    const versions = versionsByDeliv.get(d.id) ?? [];
    const current = versions.find((v) => v.id === d.current_version_id) ?? versions[0] ?? null;
    const previous = versions.filter((v) => v.id !== current?.id);
    const conversacion = reviewsByDeliv.get(d.id) ?? [];
    items.push({
      key: "d" + d.id,
      tipo: "Entregable",
      title: d.title,
      tone: deliverableClientTone[d.approval_status],
      label: deliverableClientLabel[d.approval_status],
      pending: enviado,
      body: (
        <div>
          {d.description && <p className="mut" style={{ fontSize: "13px", margin: "0 0 10px" }}>{d.description}</p>}

          {/* Lo último que te enviamos: versión actual + su nota de qué cambió */}
          {current ? (
            <div className="aprbloque">
              <div className="aprbloque-t">Lo último que te enviamos</div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                {urlByVersion.get(current.id) ? (
                  <a href={urlByVersion.get(current.id)} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">
                    Ver / descargar{current.file_name ? ` · ${current.file_name}` : ""}
                  </a>
                ) : (
                  <span className="mut" style={{ fontSize: "12.5px" }}>Archivo no disponible.</span>
                )}
                <span className="mut" style={{ fontSize: "12px" }}>Versión {current.version_number}</span>
              </div>
              {current.note && (
                <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--tx-1)" }}>
                  <b>Qué cambió:</b> {current.note}
                </p>
              )}
            </div>
          ) : d.approval_status === "borrador" ? (
            <p className="mut" style={{ fontSize: "12.5px", margin: 0 }}>
              Color Media está preparando esta versión. Te avisamos cuando esté lista para revisar.
            </p>
          ) : null}

          {/* Conversación completa */}
          {conversacion.length > 0 && (
            <div className="aprbloque">
              <div className="aprbloque-t">Conversación</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {conversacion.map((r) => (
                  <div key={r.id} className={`aprmsg${r.actor === "client" ? " aprmsg-yo" : ""}`}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <span className="dtype">{deliverableEntryClientLabel(r.kind, r.actor)}</span>
                      <span className="mut" style={{ fontSize: "11.5px" }}>{formatDateTime(r.created_at)}</span>
                    </div>
                    {r.body && (
                      <p style={{ margin: "5px 0 0", whiteSpace: "pre-wrap", fontSize: "13px", color: "var(--tx-1)" }}>{r.body}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decidir (solo si está por revisar) */}
          {enviado && (
            <form action={responderEntregable} style={{ marginTop: "12px" }}>
              <input type="hidden" name="id" value={d.id} />
              <textarea name="comment" rows={2} placeholder="Comentario (opcional)…" style={{ width: "100%" }} />
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <button className="dbtn dbtn-primary dbtn-sm" type="submit" name="decision" value="aprobado">Aprobar</button>
                <button className="dbtn dbtn-sm" type="submit" name="decision" value="cambios_solicitados">Pedir cambios</button>
                <button className="dbtn dbtn-sm" type="submit" name="decision" value="rechazado">Rechazar</button>
              </div>
            </form>
          )}

          {/* Comentar SIN decidir: disponible siempre, también después de responder */}
          <form action={comentarEntregable} style={{ marginTop: enviado ? "10px" : "12px" }}>
            <input type="hidden" name="id" value={d.id} />
            <textarea name="comment" rows={2} placeholder="Escríbenos algo sobre este entregable…" style={{ width: "100%" }} required />
            <div style={{ marginTop: "8px" }}>
              <button className="dbtn dbtn-sm" type="submit">Enviar comentario</button>
            </div>
          </form>

          {/* Versiones anteriores, descargables */}
          {previous.length > 0 && (
            <details style={{ marginTop: "12px" }}>
              <summary className="dbtn dbtn-sm" style={{ width: "fit-content" }}>
                Versiones anteriores ({previous.length})
              </summary>
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {previous.map((v) => (
                  <div key={v.id} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "12.5px" }}>
                    <span className="mono mut">v{v.version_number}</span>
                    <span className="mut">{formatDateTime(v.created_at)}</span>
                    {v.note && <span className="mut">· {v.note}</span>}
                    {urlByVersion.get(v.id) && (
                      <a href={urlByVersion.get(v.id)} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">Descargar</a>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ),
    });
  }

  // Pendientes ("por revisar") primero; dentro, contenido antes que entregables.
  items.sort((a, b) => (a.pending === b.pending ? a.tipo.localeCompare(b.tipo) : a.pending ? -1 : 1));

  const shown = items.filter((it) =>
    filtro === "todo" ? true : filtro === "contenido" ? it.tipo === "Contenido" : it.tipo === "Entregable",
  );
  const pendientes = items.filter((it) => it.pending).length;

  return (
    <>
      <PageHeader title="Aprobaciones" subtitle="Revisa y aprueba lo que preparamos para ti" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        {pendientes > 0 && (
          <div style={{ marginBottom: "12px" }}>
            <StateChip tone="wait" label={`Tienes ${pendientes} cosa${pendientes === 1 ? "" : "s"} por revisar`} />
          </div>
        )}
        <div className="aprtabs">
          <AprTab id="todo" label="Todo" activo={filtro === "todo"} />
          <AprTab id="contenido" label="Contenido" activo={filtro === "contenido"} />
          <AprTab id="entregables" label="Entregables" activo={filtro === "entregables"} />
        </div>
        {shown.length ? (
          <div className="aprlist">
            {shown.map((it) => (
              <div key={it.key} className="apr-item" style={st(it.tone)}>
                <div className="apr-head">
                  <span className="dtype">{it.tipo}</span>
                  <span className="apr-title">{it.title}</span>
                  <StateChip tone={it.tone} label={it.label} />
                </div>
                {it.body}
              </div>
            ))}
          </div>
        ) : (
          <div className="dbox"><div className="dempty">
            {filtro === "todo" ? "Aún no hay nada para revisar." : `No hay ${filtro} para revisar.`}
          </div></div>
        )}
      </div>
    </>
  );
}
