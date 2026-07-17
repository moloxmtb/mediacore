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
  type Tone,
} from "@/lib/estado";
import type {
  ContentMedia,
  ContentPiece,
  ContentStatus,
  ContentVersion,
  DeliverableApproval,
} from "@/lib/types";
import { responderEntregable } from "../entregables/actions";

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
  client_comment: string | null;
  responded_at: string | null;
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
    .select("id, title, description, approval_status, client_comment, responded_at")
    .eq("en_flujo_aprobacion", true)
    .order("created_at", { ascending: false });
  const delivs = (delivData ?? []) as DelivRow[];
  const urlByDeliv = new Map<string, string>();
  if (delivs.length) {
    const { data: files } = await supabase.from("deliverable_files").select("deliverable_id, path, file_name").in("deliverable_id", delivs.map((d) => d.id));
    for (const f of (files ?? []) as { deliverable_id: string; path: string; file_name: string | null }[]) {
      const u = await signEntregable(f.path, f.file_name);
      if (u) urlByDeliv.set(f.deliverable_id, u);
    }
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
    const url = urlByDeliv.get(d.id);
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
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">Ver / descargar archivo</a>
          ) : d.approval_status === "borrador" ? (
            <p className="mut" style={{ fontSize: "12.5px", margin: 0 }}>Color Media está preparando esta versión. Te avisamos cuando esté lista para revisar.</p>
          ) : null}
          {enviado ? (
            <form action={responderEntregable} style={{ marginTop: "12px" }}>
              <input type="hidden" name="id" value={d.id} />
              <textarea name="comment" rows={2} placeholder="Comentario (opcional)…" style={{ width: "100%" }} />
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <button className="dbtn dbtn-primary dbtn-sm" type="submit" name="decision" value="aprobado">Aprobar</button>
                <button className="dbtn dbtn-sm" type="submit" name="decision" value="cambios_solicitados">Pedir cambios</button>
                <button className="dbtn dbtn-sm" type="submit" name="decision" value="rechazado">Rechazar</button>
              </div>
            </form>
          ) : d.responded_at ? (
            <div className="mut" style={{ fontSize: "12.5px", marginTop: "10px" }}>
              Respondiste el {formatDateTime(d.responded_at)}{d.client_comment ? ` · "${d.client_comment}"` : ""}
            </div>
          ) : null}
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
