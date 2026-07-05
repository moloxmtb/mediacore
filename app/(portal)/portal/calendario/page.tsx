import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SolicitarReunionForm from "@/components/portal/SolicitarReunionForm";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { confirmarAsistencia } from "../que-viene/asistencia-actions";
import type { MeetingRequest } from "@/lib/types";

// ---------- helpers de fecha (UTC-safe para armar la grilla) ----------
function todaySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m0: number, d: number) {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const TIPO_LABEL: Record<string, string> = {
  reunion: "Reunión", rodaje: "Rodaje", entrega: "Entrega", hito: "Hito", otro: "Evento",
};
function normalizeKind(kind: string | null): string {
  const k = (kind ?? "").toLowerCase();
  return ["reunion", "rodaje", "entrega", "hito"].includes(k) ? k : "otro";
}

type CalItem = {
  key: string;
  date: string;
  datetime?: string;
  type: string;
  title: string;
  meta?: string;
  href?: string;
  eventId?: string;
};

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePortalWorld("content");
  const supabase = await createClient();
  const sp = await searchParams;

  const today = todaySantiago();
  const [ty, tm] = today.split("-").map(Number);
  const vista = sp.vista === "lista" ? "lista" : "mes";
  const mesParam = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : `${ty}-${pad(tm)}`;
  const [Y, M] = mesParam.split("-").map(Number); // M = 1..12

  // Rango de datos: cubre el mes mostrado y los próximos 90 días (para la lista).
  const rangeStart = `${Math.min(Y, ty)}-01-01`;
  const rangeEnd = `${Math.max(Y, ty) + 1}-01-01`;

  // Fuentes existentes (RLS: owner/content del propio cliente y visibles).
  const [{ data: eventsData }, { data: delivData }, { data: phasesData }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, title, starts_at, kind, project_id, projects(name)")
      .gte("starts_at", rangeStart)
      .lt("starts_at", rangeEnd)
      .order("starts_at", { ascending: true }),
    supabase
      .from("deliverables")
      .select("id, title, status, delivered_at, project_id, projects(name)")
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: true }),
    supabase
      .from("phases")
      .select("id, name, end_date, project_id, projects(name)")
      .gte("end_date", today)
      .order("end_date", { ascending: true })
      .limit(6),
  ]);

  const events = (eventsData ?? []) as unknown as {
    id: string; title: string; starts_at: string; kind: string | null; project_id: string | null; projects: { name: string } | null;
  }[];
  const delivs = (delivData ?? []) as unknown as {
    id: string; title: string; status: string; delivered_at: string; project_id: string; projects: { name: string } | null;
  }[];
  const hitosProx = (phasesData ?? []) as unknown as {
    id: string; name: string; end_date: string; project_id: string; projects: { name: string } | null;
  }[];

  // Normalizar a CalItem (una sola fuente por dato, sin duplicar).
  const items: CalItem[] = [];
  for (const e of events) {
    const type = normalizeKind(e.kind);
    items.push({
      key: "e" + e.id,
      date: e.starts_at.slice(0, 10),
      datetime: e.starts_at,
      type,
      title: e.title,
      meta: e.projects?.name ?? undefined,
      href: e.project_id ? `/portal/proyectos/${e.project_id}` : undefined,
      eventId: type === "reunion" ? e.id : undefined,
    });
  }
  for (const d of delivs) {
    items.push({
      key: "d" + d.id,
      date: d.delivered_at,
      type: "entrega",
      title: d.title,
      meta: d.projects?.name ?? undefined,
      href: `/portal/proyectos/${d.project_id}`,
    });
  }

  // Asistencia del usuario para las reuniones visibles (para el botón en la lista).
  const reunionIds = items.filter((i) => i.eventId).map((i) => i.eventId!);
  const attByEvent = new Map<string, boolean>();
  if (reunionIds.length) {
    const { data: att } = await supabase
      .from("event_attendance")
      .select("event_id, attending")
      .eq("user_id", session.userId)
      .in("event_id", reunionIds);
    for (const a of att ?? []) attByEvent.set(a.event_id as string, a.attending as boolean);
  }

  // Solicitudes propias (RLS: propio cliente).
  const { data: reqData } = await supabase
    .from("meeting_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(8);
  const solicitudes = (reqData ?? []) as MeetingRequest[];

  // ---------- Grilla mensual ----------
  const firstWeekday = (new Date(Date.UTC(Y, M - 1, 1)).getUTCDay() + 6) % 7; // Lun=0
  const daysInMonth = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(Y, M - 1, 0)).getUTCDate();
  const cells: { date: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const d = prevDays - firstWeekday + 1 + i;
    const pm = M - 1 === 0 ? 12 : M - 1;
    const py = M - 1 === 0 ? Y - 1 : Y;
    cells.push({ date: ymd(py, pm - 1, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: ymd(Y, M - 1, d), day: d, inMonth: true });
  while (cells.length % 7 !== 0) {
    const d = cells.length - (firstWeekday + daysInMonth) + 1;
    const nm = M + 1 === 13 ? 1 : M + 1;
    const ny = M + 1 === 13 ? Y + 1 : Y;
    cells.push({ date: ymd(ny, nm - 1, d), day: d, inMonth: false });
  }
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) {
    const arr = byDay.get(it.date) ?? [];
    arr.push(it);
    byDay.set(it.date, arr);
  }

  const prevMonth = M - 1 === 0 ? `${Y - 1}-12` : `${Y}-${pad(M - 1)}`;
  const nextMonth = M + 1 === 13 ? `${Y + 1}-01` : `${Y}-${pad(M + 1)}`;
  const qp = (v: Record<string, string>) => "?" + new URLSearchParams({ vista, mes: mesParam, ...v }).toString();

  // Lista: próximos (>= hoy), ordenados.
  const upcoming = items
    .filter((i) => i.date >= today)
    .sort((a, b) => (a.datetime ?? a.date).localeCompare(b.datetime ?? b.date));
  const listaByDay = new Map<string, CalItem[]>();
  for (const it of upcoming) {
    const arr = listaByDay.get(it.date) ?? [];
    arr.push(it);
    listaByDay.set(it.date, arr);
  }

  return (
    <>
      <PageHeader title="Calendario" subtitle="Reuniones, hitos, entregas y rodajes en un solo lugar" />
      <div className="app-content">
        <div className="stack">
          {/* Tira de próximos hitos (liviana: fase + fecha) */}
          {hitosProx.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Próximos hitos</h3>
                <span className="tag">{hitosProx.length}</span>
              </div>
              <div className="hito-strip">
                {hitosProx.map((h) => (
                  <Link key={h.id} href={`/portal/proyectos/${h.project_id}`} className="hito-chip">
                    <span className="hito-date mono">{formatDate(h.end_date)}</span>
                    <span className="hito-name">{h.name}</span>
                    {h.projects?.name && <span className="hito-proj">{h.projects.name}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Interruptor de vista + solicitar reunión */}
          <div className="page-actions" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div className="seg">
              <Link href={qp({ vista: "mes" })} className={`seg-btn${vista === "mes" ? " active" : ""}`}>Mensual</Link>
              <Link href={qp({ vista: "lista" })} className={`seg-btn${vista === "lista" ? " active" : ""}`}>Lista</Link>
            </div>
            <details className="solicitar">
              <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>Solicitar reunión</summary>
              <div className="card" style={{ marginTop: "10px" }}>
                <div className="card-head"><h3>Solicitar una reunión a Color Media</h3></div>
                <SolicitarReunionForm />
              </div>
            </details>
          </div>

          {/* Leyenda */}
          <div className="cal-legend">
            {(["reunion", "hito", "entrega", "rodaje"] as const).map((t) => (
              <span key={t} className="cal-legend-item">
                <span className={`cal-dot cal-${t}`} /> {TIPO_LABEL[t]}
              </span>
            ))}
          </div>

          {vista === "mes" ? (
            <div className="card">
              <div className="card-head">
                <h3 style={{ textTransform: "capitalize" }}>{MESES[M - 1]} {Y}</h3>
                <div style={{ display: "flex", gap: "6px" }}>
                  <Link href={qp({ mes: prevMonth })} className="btn btn-sm">‹</Link>
                  <Link href={qp({ mes: `${ty}-${pad(tm)}` })} className="btn btn-sm">Hoy</Link>
                  <Link href={qp({ mes: nextMonth })} className="btn btn-sm">›</Link>
                </div>
              </div>
              <div className="cal-grid">
                {DIAS.map((d) => <div key={d} className="cal-dow">{d}</div>)}
                {cells.map((c) => {
                  const dayItems = byDay.get(c.date) ?? [];
                  return (
                    <div key={c.date} className={`cal-cell${c.inMonth ? "" : " out"}${c.date === today ? " today" : ""}`}>
                      <div className="cal-daynum">{c.day}</div>
                      {dayItems.slice(0, 3).map((it) => (
                        <div key={it.key} className={`cal-pill cal-${it.type}`} title={it.title}>
                          {it.title}
                        </div>
                      ))}
                      {dayItems.length > 3 && <div className="cal-more">+{dayItems.length - 3}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-head"><h3>Próximos eventos</h3><span className="tag">{upcoming.length}</span></div>
              {upcoming.length ? (
                <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {[...listaByDay.entries()].map(([date, its]) => (
                    <div key={date}>
                      <div className="lista-fecha">{formatDate(date)}</div>
                      {its.map((it) => (
                        <div key={it.key} className="lista-row">
                          <span className={`cal-dot cal-${it.type}`} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13.5px", fontWeight: 500 }}>
                              {it.href ? <Link href={it.href} className="row-link">{it.title}</Link> : it.title}
                            </div>
                            <div className="meta">
                              {TIPO_LABEL[it.type]}{it.meta ? ` · ${it.meta}` : ""}
                              {it.datetime ? ` · ${new Date(it.datetime).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}` : ""}
                            </div>
                          </div>
                          {it.eventId && (
                            <span className="alert-actions">
                              {attByEvent.get(it.eventId) === true && <span className="badge b-ok">Asistirás</span>}
                              {attByEvent.get(it.eventId) === false && <span className="badge b-idle">No asistirás</span>}
                              <form action={confirmarAsistencia} style={{ display: "inline" }}>
                                <input type="hidden" name="event_id" value={it.eventId} />
                                <input type="hidden" name="attending" value="si" />
                                <button className={`btn btn-sm${attByEvent.get(it.eventId) === true ? " btn-primary" : ""}`} type="submit">Asistiré</button>
                              </form>
                              <form action={confirmarAsistencia} style={{ display: "inline" }}>
                                <input type="hidden" name="event_id" value={it.eventId} />
                                <input type="hidden" name="attending" value="no" />
                                <button className={`btn btn-sm${attByEvent.get(it.eventId) === false ? " btn-danger" : ""}`} type="submit">No podré</button>
                              </form>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">No hay eventos próximos.</div>
              )}
            </div>
          )}

          {/* Mis solicitudes de reunión */}
          {solicitudes.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Tus solicitudes de reunión</h3></div>
              <table>
                <thead><tr><th>Motivo</th><th>Preferida</th><th>Urgencia</th><th>Estado</th></tr></thead>
                <tbody>
                  {solicitudes.map((r) => (
                    <tr key={r.id}>
                      <td>{r.reason}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>{r.preferred_at ? formatDate(r.preferred_at.slice(0, 10)) : "—"}</td>
                      <td style={{ textTransform: "capitalize" }}>{r.urgency}</td>
                      <td>
                        <span className={`badge ${r.status === "agendada" ? "b-ok" : r.status === "descartada" ? "b-idle" : "b-warn"}`}>
                          {r.status === "agendada" ? "Agendada" : r.status === "descartada" ? "Descartada" : "Pendiente"}
                        </span>
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
