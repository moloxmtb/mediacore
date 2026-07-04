import PageHeader from "@/components/PageHeader";
import PedirCambiosForm from "@/components/portal/PedirCambiosForm";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signImages } from "@/lib/storage";
import {
  CONTENT_STATUS_LABELS,
  PERIOD_KIND_LABELS,
  contentStatusBadge,
} from "@/lib/content";
import type { ContentPeriod, ContentPiece, ContentVersion } from "@/lib/types";
import { aprobarPeriodo, aprobarPieza, pedirCambios } from "./actions";

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
  const { data: versData } = await supabase
    .from("content_versions")
    .select("*")
    .in("piece_id", ids);
  const versions = (versData ?? []) as ContentVersion[];
  const current = (p: ContentPiece) => versions.find((v) => v.id === p.current_version_id) ?? null;
  const signed = await signImages(pieces.map((p) => current(p)?.image_path ?? "").filter(Boolean));

  const piecesByPeriod = new Map<string, ContentPiece[]>();
  for (const p of pieces) (piecesByPeriod.get(p.period_id) ?? piecesByPeriod.set(p.period_id, []).get(p.period_id)!).push(p);

  return (
    <>
      <PageHeader
        title="Contenido"
        subtitle="Revisa y aprueba las piezas que preparamos para ti"
      />
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
                    {pp.map((p) => {
                      const cur = current(p);
                      const img = cur?.image_path ? signed[cur.image_path] : null;
                      return (
                        <div key={p.id} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", borderTop: "1px solid var(--border-soft)", paddingTop: "18px" }}>
                          <div>
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img} alt={p.title} style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }} />
                            ) : (
                              <div className="empty" style={{ padding: "30px 10px" }}>Sin imagen</div>
                            )}
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                              <span style={{ fontWeight: 500 }}>{p.title}</span>
                              <span className={`badge ${contentStatusBadge(p.status)}`}>
                                {CONTENT_STATUS_LABELS[p.status]}
                              </span>
                            </div>
                            <p style={{ color: "var(--muted)", whiteSpace: "pre-wrap", marginTop: "8px" }}>
                              {cur?.body ?? ""}
                            </p>

                            {p.status === "propuesta" ? (
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                                <form action={aprobarPieza}>
                                  <input type="hidden" name="id" value={p.id} />
                                  <button className="btn btn-sm btn-primary" type="submit">Aprobar</button>
                                </form>
                                <details>
                                  <summary className="btn btn-sm">Pedir cambios</summary>
                                  <PedirCambiosForm action={pedirCambios} pieceId={p.id} />
                                </details>
                              </div>
                            ) : (
                              <div className="meta" style={{ marginTop: "6px" }}>
                                {p.status === "aprobada_cliente" && "Aprobaste esta pieza. Color Media la confirmará."}
                                {p.status === "cambios_solicitados" && "Pediste cambios. Estamos trabajando en ello."}
                                {p.status === "aprobada" && "Pieza aprobada en firme."}
                                {p.status === "rechazada" && "Color Media revisará y te enviará una nueva versión."}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
