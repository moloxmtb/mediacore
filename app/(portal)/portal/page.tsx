import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signMinutas } from "@/lib/storage";
import { mergeBitacora, BITACORA_KIND_LABELS, bitacoraKindBadge, type BitacoraEntry } from "@/lib/bitacora";
import {
  formatDate,
  formatDateTime,
  DELIVERABLE_STATUS_LABELS,
  deliverableStatusBadge,
} from "@/lib/format";
import type { DeliverableStatus } from "@/lib/types";
import { marcarHechaPortal } from "./tareas/actions";
import { confirmarAsistencia } from "./asistencia-actions";

function todaySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function ymdMonthsAgo(base: string, months: number): string {
  const d = new Date(base + "T00:00:00");
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

type EventRow = { id: string; title: string; starts_at: string; kind: string | null; project_id: string | null; projects: { name: string } | null };
type DelivRow = { id: string; title: string; status: DeliverableStatus; project_id: string; projects: { name: string } | null };

export default async function PortalInicioPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string }>;
}) {
  const session = await requirePortalWorld("content"); // finanzas-only → /portal/finanzas
  const supabase = await createClient();
  const sp = await searchParams;
  const now = new Date().toISOString();
  const today = todaySantiago();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(sp.desde ?? "") ? (sp.desde as string) : ymdMonthsAgo(today, 6);
  const desdeIso = desde + "T00:00:00";

  // Todas las consultas corren con la sesión del cliente: la RLS ya corta lo
  // interno y lo ajeno en el ORIGEN. Las tres zonas heredan ese filtro; la vista
  // solo presenta. Cero estado nuevo.
  const [
    { data: pendTasks },
    { count: contentPend },
    { count: entregablesPorRevisar },
    { data: upEvents },
    { data: enCurso },
    { data: pastActs },
    { data: pastDelivs },
    { data: pastPhases },
    { data: pastReun },
    { data: minutes },
  ] = await Promise.all([
    supabase.from("tasks").select("id, titulo, plazo, responsable_id").eq("tipo", "cliente").eq("estado", "pendiente").order("created_at", { ascending: false }),
    supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("status", "propuesta"),
    // Entregables del flujo nuevo enviados, a la espera de respuesta (Te toca a ti).
    // en_flujo_aprobacion filtra los legacy: nunca se le muestran al cliente.
    supabase.from("deliverables").select("id", { count: "exact", head: true }).eq("en_flujo_aprobacion", true).eq("approval_status", "enviado"),
    supabase.from("calendar_events").select("id, title, starts_at, kind, project_id, projects(name)").gte("starts_at", now).order("starts_at", { ascending: true }).limit(15),
    supabase.from("deliverables").select("id, title, status, project_id, projects(name)").neq("status", "aprobado").order("created_at", { ascending: false }).limit(15),
    supabase.from("actions").select("id, action_date, title, description, project_id").gte("action_date", desde),
    supabase.from("deliverables").select("id, title, status, delivered_at, project_id").in("status", ["entregado", "aprobado"]).not("delivered_at", "is", null).gte("delivered_at", desde),
    supabase.from("phases").select("id, name, end_date, project_id").eq("progress", 100).gte("end_date", desde),
    supabase.from("calendar_events").select("id, title, starts_at").eq("kind", "reunion").gte("starts_at", desdeIso),
    supabase.from("meeting_minutes").select("event_id, realizada, minuta_path"),
  ]);

  const tasks = (pendTasks ?? []) as { id: string; titulo: string; plazo: string | null; responsable_id: string | null }[];
  const upcoming = (upEvents ?? []) as unknown as EventRow[];
  const entregasEnCurso = (enCurso ?? []) as unknown as DelivRow[];
  const cid = session.clientId ?? "";

  // Reunión próxima por confirmar (la más cercana). Su asistencia del usuario.
  const proxReunion = upcoming.find((e) => e.kind === "reunion");
  let miAsistencia: boolean | null = null;
  if (proxReunion) {
    const { data: att } = await supabase.from("event_attendance").select("attending").eq("event_id", proxReunion.id).eq("user_id", session.userId).maybeSingle();
    miAsistencia = att ? (att.attending as boolean) : null;
  }

  // --- Zona 3: "Lo que ha pasado" (reusa mergeBitacora; la RLS ya filtró internas) ---
  const minuteByEvent = new Map(((minutes ?? []) as { event_id: string; realizada: boolean; minuta_path: string | null }[]).map((m) => [m.event_id, m]));
  const entries: BitacoraEntry[] = [];
  for (const a of (pastActs ?? []) as { id: string; action_date: string; title: string; description: string | null; project_id: string | null }[]) {
    entries.push({ key: "a" + a.id, kind: "nota", date: a.action_date, sortKey: a.action_date + "T00:00:00", clientId: cid, title: a.title, detail: a.description, href: a.project_id ? `/portal/proyectos/${a.project_id}` : null, interna: false });
  }
  for (const d of (pastDelivs ?? []) as { id: string; title: string; status: DeliverableStatus; delivered_at: string; project_id: string }[]) {
    entries.push({ key: "d" + d.id, kind: "entrega", date: d.delivered_at, sortKey: d.delivered_at + "T00:00:00", clientId: cid, title: d.title, detail: `Entrega ${DELIVERABLE_STATUS_LABELS[d.status].toLowerCase()}`, href: `/portal/proyectos/${d.project_id}`, interna: false });
  }
  for (const p of (pastPhases ?? []) as { id: string; name: string; end_date: string; project_id: string }[]) {
    entries.push({ key: "p" + p.id, kind: "hito", date: p.end_date, sortKey: p.end_date + "T00:00:00", clientId: cid, title: p.name, detail: "Hito cumplido", href: `/portal/proyectos/${p.project_id}`, interna: false });
  }
  const minutaPaths: string[] = [];
  for (const e of (pastReun ?? []) as { id: string; title: string; starts_at: string }[]) {
    const m = minuteByEvent.get(e.id);
    if (!m?.realizada) continue; // solo realizadas (y visibles: la RLS ya lo garantizó)
    if (m.minuta_path) minutaPaths.push(m.minuta_path);
    entries.push({ key: "e" + e.id, kind: "reunion", date: e.starts_at.slice(0, 10), sortKey: e.starts_at, clientId: cid, title: e.title, detail: "Reunión realizada", href: null, interna: false });
  }
  const urlByPath = await signMinutas(minutaPaths);
  const minutaUrlByKey = new Map<string, string>();
  for (const e of (pastReun ?? []) as { id: string }[]) {
    const mp = minuteByEvent.get(e.id)?.minuta_path;
    if (mp && urlByPath[mp]) minutaUrlByKey.set("e" + e.id, urlByPath[mp]);
  }

  const timeline = mergeBitacora(entries);
  const byDay = new Map<string, BitacoraEntry[]>();
  for (const it of timeline) (byDay.get(it.date) ?? byDay.set(it.date, []).get(it.date)!).push(it);
  const masAtras = ymdMonthsAgo(desde, 6);

  const nada = tasks.length === 0 && (contentPend ?? 0) === 0 && (entregablesPorRevisar ?? 0) === 0 && !proxReunion;

  return (
    <>
      <PageHeader title="Inicio" subtitle="Tu resumen con Color Media" />
      <div className="app-content">
        <div className="stack">

          {/* ── Zona 1: Te toca a ti ── */}
          <div className="card">
            <div className="card-head"><h3>Te toca a ti</h3></div>
            {nada ? (
              <div className="empty">Por ahora no hay nada pendiente de tu parte.</div>
            ) : (
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(contentPend ?? 0) > 0 && (
                  <div className="lista-row">
                    <span className="alert-dot alert-accent" />
                    <div style={{ flex: 1 }}>Tienes {contentPend} pieza{contentPend === 1 ? "" : "s"} de contenido por aprobar.</div>
                    <Link href="/portal/contenido" className="btn btn-sm">Revisar contenido</Link>
                  </div>
                )}
                {(entregablesPorRevisar ?? 0) > 0 && (
                  <div className="lista-row">
                    <span className="alert-dot alert-accent" />
                    <div style={{ flex: 1 }}>Tienes {entregablesPorRevisar} entregable{entregablesPorRevisar === 1 ? "" : "s"} por revisar.</div>
                    <Link href="/portal/entregables" className="btn btn-sm">Revisar entregables</Link>
                  </div>
                )}
                {proxReunion && (
                  <div className="lista-row">
                    <span className="alert-dot alert-accent" />
                    <div style={{ flex: 1 }}>
                      Tu próxima reunión: <b>{proxReunion.title}</b> · {formatDateTime(proxReunion.starts_at)}
                      {miAsistencia === true && <span className="badge b-ok" style={{ marginLeft: "8px" }}>Confirmaste</span>}
                      {miAsistencia === false && <span className="badge b-idle" style={{ marginLeft: "8px" }}>Avisaste que no</span>}
                    </div>
                    <span style={{ display: "flex", gap: "6px" }}>
                      <form action={confirmarAsistencia}><input type="hidden" name="event_id" value={proxReunion.id} /><input type="hidden" name="attending" value="si" /><button className={`btn btn-sm${miAsistencia === true ? " btn-primary" : ""}`} type="submit">Asistiré</button></form>
                      <form action={confirmarAsistencia}><input type="hidden" name="event_id" value={proxReunion.id} /><input type="hidden" name="attending" value="no" /><button className="btn btn-sm" type="submit">No podré</button></form>
                    </span>
                  </div>
                )}
                {tasks.map((t) => (
                  <div key={t.id} className="lista-row">
                    <span className="alert-dot alert-warn" />
                    <div style={{ flex: 1 }}>
                      {t.titulo}
                      {t.plazo && <span className="meta"> · para {formatDate(t.plazo)}</span>}
                    </div>
                    <form action={marcarHechaPortal}><input type="hidden" name="id" value={t.id} /><button className="btn btn-sm btn-primary" type="submit">Marcar hecha</button></form>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Zona 2: Lo que viene ── */}
          <div className="card">
            <div className="card-head"><h3>Lo que viene</h3><span className="tag">{upcoming.length}</span></div>
            {upcoming.length ? (
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {upcoming.map((e) => (
                  <div key={e.id} className="lista-row">
                    <span className="mono" style={{ color: "var(--accent)", width: "112px", flexShrink: 0, fontSize: "12px" }}>{formatDateTime(e.starts_at)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 500 }}>{e.title}</div>
                      <div className="meta">{e.projects?.name ?? ""}{e.kind ? ` · ${e.kind}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No hay fechas próximas por ahora.</div>
            )}
            {entregasEnCurso.length > 0 && (
              <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)" }}>
                <div className="meta" style={{ marginBottom: "8px" }}>Entregables en curso</div>
                {entregasEnCurso.map((d) => (
                  <div key={d.id} className="lista-row">
                    <div style={{ flex: 1 }}>
                      <Link href={`/portal/proyectos/${d.project_id}`} className="row-link">{d.title}</Link>
                      <span className="meta"> · {d.projects?.name ?? ""}</span>
                    </div>
                    <span className={`badge ${deliverableStatusBadge(d.status)}`}>{DELIVERABLE_STATUS_LABELS[d.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Zona 3: Lo que ha pasado ── */}
          <div className="card">
            <div className="card-head"><h3>Lo que ha pasado</h3><span className="tag">{timeline.length} · desde {formatDate(desde)}</span></div>
            {timeline.length ? (
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {[...byDay.entries()].map(([date, its]) => (
                  <div key={date}>
                    <div className="lista-fecha">{formatDate(date)}</div>
                    {its.map((it) => (
                      <div key={it.key} className="lista-row">
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "13.5px", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span className={`badge ${bitacoraKindBadge(it.kind)}`}>{BITACORA_KIND_LABELS[it.kind]}</span>
                            {it.href ? <Link href={it.href} className="row-link">{it.title}</Link> : it.title}
                          </div>
                          {it.detail && <div className="meta">{it.detail}</div>}
                        </div>
                        {it.kind === "reunion" && minutaUrlByKey.has(it.key) && (
                          <a href={minutaUrlByKey.get(it.key)} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Descargar minuta</a>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Aún no hay registros desde {formatDate(desde)}.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)" }}>
              <Link href={`?desde=${masAtras}`} className="btn btn-sm">Cargar 6 meses más</Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
