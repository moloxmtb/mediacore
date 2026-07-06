import PageHeader from "@/components/PageHeader";
import ContentPieceViewer, {
  type ViewerMedia,
  type ViewerPiece,
  type ViewerVersion,
} from "@/components/portal/content/ContentPieceViewer";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signImages } from "@/lib/storage";
import { resolveVideoThumbs } from "@/lib/video-thumbs";
import { PERIOD_KIND_LABELS } from "@/lib/content";
import type {
  ContentMedia,
  ContentPeriod,
  ContentPiece,
  ContentStatus,
  ContentVersion,
} from "@/lib/types";
import { aprobarPeriodo } from "./actions";

const STATUS_MESSAGE: Partial<Record<ContentStatus, string>> = {
  aprobada_cliente: "Aprobaste esta pieza. Color Media la confirmará.",
  cambios_solicitados: "Pediste cambios. Estamos trabajando en ello.",
  aprobada: "Pieza aprobada en firme.",
  rechazada: "Color Media revisará y te enviará una nueva versión.",
};

export default async function PortalContenidoPage() {
  await requirePortalWorld("content");
  const supabase = await createClient();

  // RLS: solo períodos publicados y piezas no-borrador de su empresa.
  const [{ data: periodsData }, { data: piecesData }] = await Promise.all([
    supabase.from("content_periods").select("*").order("created_at", { ascending: false }),
    supabase.from("content_pieces").select("*").order("sort_order", { ascending: true }),
  ]);
  const periods = (periodsData ?? []) as ContentPeriod[];
  const pieces = (piecesData ?? []) as ContentPiece[];

  const ids = pieces.length ? pieces.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"];

  // TODAS las versiones de las piezas visibles (la actual + el historial).
  const { data: versData } = await supabase
    .from("content_versions")
    .select("*")
    .in("piece_id", ids)
    .order("version_number", { ascending: false });
  const versions = (versData ?? []) as ContentVersion[];

  // Medios de todas esas versiones (RLS ya limita a piezas del cliente no-borrador).
  const versionIds = versions.length
    ? versions.map((v) => v.id)
    : ["00000000-0000-0000-0000-000000000000"];
  const { data: mediaData } = await supabase
    .from("content_media")
    .select("*")
    .in("version_id", versionIds)
    .order("sort_order", { ascending: true });
  const media = (mediaData ?? []) as ContentMedia[];

  // Firmar imágenes + resolver thumbnails de video.
  const signed = await signImages(
    media.filter((m) => m.kind === "imagen" && m.storage_path).map((m) => m.storage_path!),
  );
  const videoThumbs = await resolveVideoThumbs(
    media.filter((m) => m.kind === "video").map((m) => ({ provider: m.provider, embedUrl: m.embed_url })),
  );

  const mediaByVersion = new Map<string, ContentMedia[]>();
  for (const m of media)
    (mediaByVersion.get(m.version_id) ?? mediaByVersion.set(m.version_id, []).get(m.version_id)!).push(m);

  const toViewerMedia = (m: ContentMedia): ViewerMedia =>
    m.kind === "imagen"
      ? {
          id: m.id,
          kind: "imagen",
          thumb: m.storage_path ? (signed[m.storage_path] ?? null) : null,
          full: m.storage_path ? (signed[m.storage_path] ?? null) : null,
          provider: null,
          orientation: m.orientation,
        }
      : {
          id: m.id,
          kind: "video",
          thumb: m.embed_url ? (videoThumbs[m.embed_url] ?? null) : null,
          full: m.embed_url,
          provider: m.provider,
          orientation: m.orientation,
        };

  const toViewerVersion = (v: ContentVersion): ViewerVersion => ({
    id: v.id,
    versionNumber: v.version_number,
    body: v.body,
    media: (mediaByVersion.get(v.id) ?? []).map(toViewerMedia),
  });

  const versionsByPiece = new Map<string, ContentVersion[]>();
  for (const v of versions)
    (versionsByPiece.get(v.piece_id) ?? versionsByPiece.set(v.piece_id, []).get(v.piece_id)!).push(v);

  const toViewerPiece = (p: ContentPiece): ViewerPiece => {
    const pv = versionsByPiece.get(p.id) ?? [];
    const cur = pv.find((v) => v.id === p.current_version_id) ?? null;
    const past = pv.filter((v) => v.id !== cur?.id); // ya vienen desc por version_number
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      votable: p.status === "propuesta",
      statusMessage: STATUS_MESSAGE[p.status] ?? null,
      current: cur ? toViewerVersion(cur) : null,
      past: past.map(toViewerVersion),
    };
  };

  const piecesByPeriod = new Map<string, ContentPiece[]>();
  for (const p of pieces)
    (piecesByPeriod.get(p.period_id) ?? piecesByPeriod.set(p.period_id, []).get(p.period_id)!).push(p);

  return (
    <>
      <PageHeader title="Contenido" subtitle="Revisa y aprueba las piezas que preparamos para ti" />
      <div className="app-content">
        {periods.length ? (
          <div className="stack">
            {periods.map((period) => {
              const pp = piecesByPeriod.get(period.id) ?? [];
              const pendientes = pp.filter((p) => p.status === "propuesta").length;
              return (
                <div className="card" key={period.id}>
                  <div className="card-head">
                    <h3>{period.label}</h3>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span className="tag">{PERIOD_KIND_LABELS[period.kind]}</span>
                      {pendientes > 0 && (
                        <form action={aprobarPeriodo}>
                          <input type="hidden" name="period_id" value={period.id} />
                          <button className="btn btn-sm btn-primary" type="submit">
                            Aprobar todo ({pendientes})
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    {pp.map((p) => (
                      <div
                        key={p.id}
                        style={{ borderTop: "1px solid var(--border-soft)", paddingTop: "18px" }}
                      >
                        <ContentPieceViewer piece={toViewerPiece(p)} />
                      </div>
                    ))}
                    {!pp.length && <div className="empty">Aún no hay piezas en este período.</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <div className="empty">Aún no hay contenido para revisar.</div>
          </div>
        )}
      </div>
    </>
  );
}
