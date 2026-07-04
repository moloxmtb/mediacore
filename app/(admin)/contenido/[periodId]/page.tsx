import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import PieceForm from "@/components/admin/content/PieceForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { createClient } from "@/lib/supabase/server";
import { signImages } from "@/lib/storage";
import {
  CONTENT_STATUS_LABELS,
  PERIOD_KIND_LABELS,
  REVIEW_KIND_LABELS,
  contentStatusBadge,
} from "@/lib/content";
import { formatDateTime } from "@/lib/format";
import type {
  ContentPeriod,
  ContentPiece,
  ContentReview,
  ContentVersion,
} from "@/lib/types";
import {
  confirmarPieza,
  crearPieza,
  eliminarPeriodo,
  eliminarPieza,
  publicarPeriodo,
  rechazarPieza,
  subirVersion,
} from "../actions";

export default async function PeriodoDetalle({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const supabase = await createClient();

  const { data: periodData } = await supabase
    .from("content_periods")
    .select("*, clients(name)")
    .eq("id", periodId)
    .maybeSingle();
  if (!periodData) notFound();
  const period = periodData as ContentPeriod & { clients: { name: string } | null };

  const { data: piecesData } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("period_id", periodId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const pieces = (piecesData ?? []) as ContentPiece[];
  const ids = pieces.length ? pieces.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"];

  const [{ data: versData }, { data: revData }] = await Promise.all([
    supabase.from("content_versions").select("*").in("piece_id", ids).order("version_number", { ascending: false }),
    supabase.from("content_reviews").select("*").in("piece_id", ids).order("created_at", { ascending: false }),
  ]);
  const versions = (versData ?? []) as ContentVersion[];
  const reviews = (revData ?? []) as ContentReview[];

  const versionsByPiece = new Map<string, ContentVersion[]>();
  for (const v of versions) (versionsByPiece.get(v.piece_id) ?? versionsByPiece.set(v.piece_id, []).get(v.piece_id)!).push(v);
  const reviewsByPiece = new Map<string, ContentReview[]>();
  for (const r of reviews) (reviewsByPiece.get(r.piece_id) ?? reviewsByPiece.set(r.piece_id, []).get(r.piece_id)!).push(r);

  const currentVersion = (p: ContentPiece) =>
    versions.find((v) => v.id === p.current_version_id) ?? null;
  const signed = await signImages(
    pieces.map((p) => currentVersion(p)?.image_path ?? "").filter(Boolean),
  );

  return (
    <>
      <PageHeader
        title={period.label}
        subtitle={`${period.clients?.name ?? ""} · ${PERIOD_KIND_LABELS[period.kind]}`}
      />
      <div className="app-content">
        <Link href="/contenido" className="back-link">← Volver a contenido</Link>

        <div className="page-actions" style={{ justifyContent: "space-between" }}>
          <span className={`badge ${period.published ? "b-accent" : "b-idle"}`}>
            {period.published ? "Publicado (el cliente lo ve)" : "Borrador (oculto al cliente)"}
          </span>
          <div style={{ display: "flex", gap: "10px" }}>
            {!period.published && (
              <form action={publicarPeriodo}>
                <input type="hidden" name="id" value={period.id} />
                <button className="btn btn-sm btn-primary" type="submit">Publicar período</button>
              </form>
            )}
            <DeleteButton action={eliminarPeriodo} hidden={{ id: period.id }} label="Eliminar período" confirm="¿Eliminar el período y todas sus piezas?" />
          </div>
        </div>

        <div className="stack">
          {pieces.map((p) => {
            const cur = currentVersion(p);
            const img = cur?.image_path ? signed[cur.image_path] : null;
            const pVersions = versionsByPiece.get(p.id) ?? [];
            const pReviews = reviewsByPiece.get(p.id) ?? [];
            return (
              <div className="card" key={p.id}>
                <div className="card-head">
                  <h3>{p.title}</h3>
                  <span className={`badge ${contentStatusBadge(p.status)}`}>
                    {CONTENT_STATUS_LABELS[p.status]}
                  </span>
                </div>
                <div className="card-body" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "20px" }}>
                  <div>
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={p.title} style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }} />
                    ) : (
                      <div className="empty" style={{ padding: "30px 10px" }}>Sin imagen</div>
                    )}
                    <div className="meta mono" style={{ marginTop: "6px" }}>v{cur?.version_number ?? "—"}</div>
                  </div>
                  <div>
                    <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{cur?.body ?? <span style={{ color: "var(--faint)" }}>Sin copy.</span>}</p>

                    {/* Decisiones de Color Media */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                      {p.status === "aprobada_cliente" && (
                        <form action={confirmarPieza}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn btn-sm btn-primary" type="submit">Confirmar aprobación</button>
                        </form>
                      )}
                      <details>
                        <summary className="btn btn-sm">Rechazar</summary>
                        <form action={rechazarPieza} style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          <input type="hidden" name="id" value={p.id} />
                          <textarea name="comment" placeholder="Motivo (opcional)" />
                          <button className="btn btn-sm btn-danger" type="submit">Rechazar pieza</button>
                        </form>
                      </details>
                      <details>
                        <summary className="btn btn-sm">Subir nueva versión</summary>
                        <div style={{ marginTop: "8px" }}>
                          <PieceForm action={subirVersion} mode="version" pieceId={p.id} submitLabel="Crear versión" />
                        </div>
                      </details>
                      <DeleteButton action={eliminarPieza} hidden={{ id: p.id, period_id: period.id }} label="Eliminar pieza" confirm="¿Eliminar esta pieza y su historial?" />
                    </div>

                    {/* Historial de versiones */}
                    {pVersions.length > 1 && (
                      <details style={{ marginTop: "14px" }}>
                        <summary className="btn btn-sm btn-ghost">Historial de versiones ({pVersions.length})</summary>
                        <div style={{ marginTop: "8px" }}>
                          {pVersions.map((v) => (
                            <div key={v.id} className="meta" style={{ padding: "4px 0" }}>
                              <span className="mono">v{v.version_number}</span> · {v.note ?? ""} · {formatDateTime(v.created_at)}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Bitácora de revisiones */}
                    {pReviews.length > 0 && (
                      <div style={{ marginTop: "12px", borderTop: "1px solid var(--border-soft)", paddingTop: "10px" }}>
                        {pReviews.map((r) => (
                          <div key={r.id} style={{ fontSize: "12.5px", padding: "4px 0" }}>
                            <span className={`badge ${r.actor === "client" ? "b-accent" : "b-idle"}`} style={{ marginRight: "6px" }}>
                              {r.actor === "client" ? "Cliente" : "Color Media"}
                            </span>
                            {REVIEW_KIND_LABELS[r.kind]}
                            <span className="meta"> · {formatDateTime(r.created_at)}</span>
                            {r.comment && <div style={{ color: "var(--muted)", marginTop: "2px" }}>{r.comment}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Agregar pieza */}
        <div className="card" style={{ marginTop: "20px" }}>
          <div className="card-head"><h3>Agregar pieza</h3></div>
          <div className="card-body">
            <PieceForm action={crearPieza} mode="create" periodId={period.id} submitLabel="Crear pieza" />
          </div>
        </div>
      </div>
    </>
  );
}
