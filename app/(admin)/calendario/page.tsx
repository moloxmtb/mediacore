import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  agendarSolicitud,
  descartarSolicitud,
} from "../../(portal)/portal/calendario/reunion-actions";
import type { MeetingRequest } from "@/lib/types";

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
const TIPO_LABEL: Record<string, string> = { reunion: "Reunión", rodaje: "Rodaje", entrega: "Entrega", hito: "Hito", otro: "Evento", solicitud: "Solicitud" };
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
  clientId: string;
  clientName: string;
  color: string;
  href?: string;
  request?: MeetingRequest;
};

const DEFAULT_COLOR = "#3dbdcb";

export default async function AdminCalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const today = todaySantiago();
  const [ty, tm] = today.split("-").map(Number);
  const vista = sp.vista === "lista" ? "lista" : "mes";
  const mesParam = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : `${ty}-${pad(tm)}`;
  const [Y, M] = mesParam.split("-").map(Number);
  const filtro = sp.cliente ?? "";

  const rangeStart = `${Math.min(Y, ty)}-01-01`;
  const rangeEnd = `${Math.max(Y, ty) + 1}-01-01`;

  // Admin ve TODO (RLS is_admin). Sin filtrar por cliente ni por visible_to_client.
  const [{ data: clientsData }, { data: eventsData }, { data: delivData }, { data: phasesData }, { data: reqData }] =
    await Promise.all([
      supabase.from("clients").select("id, name, accent_color").order("name"),
      supabase
        .from("calendar_events")
        .select("id, title, starts_at, kind, client_id, project_id")
        .gte("starts_at", rangeStart)
        .lt("starts_at", rangeEnd)
        .order("starts_at", { ascending: true }),
      supabase
        .from("deliverables")
        .select("id, title, delivered_at, project_id, projects(client_id, name)")
        .not("delivered_at", "is", null),
      supabase
        .from("phases")
        .select("id, name, end_date, project_id, projects(client_id, name)")
        .gte("end_date", today)
        .order("end_date", { ascending: true })
        .limit(10),
      supabase
        .from("meeting_requests")
        .select("*")
        .eq("status", "pendiente")
        .order("created_at", { ascending: false }),
    ]);

  const clients = (clientsData ?? []) as { id: string; name: string; accent_color: string | null }[];
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const colorOf = (id: string) => clientById.get(id)?.accent_color ?? DEFAULT_COLOR;
  const nameOf = (id: string) => clientById.get(id)?.name ?? "Cliente";

  const events = (eventsData ?? []) as unknown as { id: string; title: string; starts_at: string; kind: string | null; client_id: string; project_id: string | null }[];
  const delivs = (delivData ?? []) as unknown as { id: string; title: string; delivered_at: string; project_id: string; projects: { client_id: string; name: string } | null }[];
  const phases = (phasesData ?? []) as unknown as { id: string; name: string; end_date: string; project_id: string; projects: { client_id: string; name: string } | null }[];
  const requests = (reqData ?? []) as MeetingRequest[];

  // Emails de quién solicitó (para la lista).
  let reqEmailById = new Map<string, string>();
  if (requests.length) {
    const { data: userList } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    reqEmailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? "—"]));
  }

  // Normalizar a CalItem (una sola fuente por dato).
  const items: CalItem[] = [];
  for (const e of events) {
    items.push({
      key: "e" + e.id, date: e.starts_at.slice(0, 10), datetime: e.starts_at, type: normalizeKind(e.kind),
      title: e.title, clientId: e.client_id, clientName: nameOf(e.client_id), color: colorOf(e.client_id),
      href: `/clientes/${e.client_id}`,
    });
  }
  for (const d of delivs) {
    const cid = d.projects?.client_id ?? "";
    items.push({
      key: "d" + d.id, date: d.delivered_at, type: "entrega", title: d.title,
      clientId: cid, clientName: nameOf(cid), color: colorOf(cid), href: `/clientes/${cid}`,
    });
  }
  for (const r of requests) {
    if (!r.preferred_at) continue; // sin fecha preferida no se ubica en la grilla (va en la lista)
    items.push({
      key: "r" + r.id, date: r.preferred_at.slice(0, 10), datetime: r.preferred_at, type: "solicitud",
      title: `Solicitud: ${r.reason}`, clientId: r.client_id, clientName: nameOf(r.client_id),
      color: colorOf(r.client_id), href: `/clientes/${r.client_id}`, request: r,
    });
  }

  const shown = filtro ? items.filter((i) => i.clientId === filtro) : items;

  // Grilla mensual.
  const firstWeekday = (new Date(Date.UTC(Y, M - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(Y, M - 1, 0)).getUTCDate();
  const cells: { date: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const d = prevDays - firstWeekday + 1 + i;
    const pm = M - 1 === 0 ? 12 : M - 1, py = M - 1 === 0 ? Y - 1 : Y;
    cells.push({ date: ymd(py, pm - 1, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: ymd(Y, M - 1, d), day: d, inMonth: true });
  while (cells.length % 7 !== 0) {
    const d = cells.length - (firstWeekday + daysInMonth) + 1;
    const nm = M + 1 === 13 ? 1 : M + 1, ny = M + 1 === 13 ? Y + 1 : Y;
    cells.push({ date: ymd(ny, nm - 1, d), day: d, inMonth: false });
  }
  const byDay = new Map<string, CalItem[]>();
  for (const it of shown) {
    const arr = byDay.get(it.date) ?? [];
    arr.push(it);
    byDay.set(it.date, arr);
  }

  const prevMonth = M - 1 === 0 ? `${Y - 1}-12` : `${Y}-${pad(M - 1)}`;
  const nextMonth = M + 1 === 13 ? `${Y + 1}-01` : `${Y}-${pad(M + 1)}`;
  const qp = (v: Record<string, string>) => "?" + new URLSearchParams({ vista, mes: mesParam, ...(filtro ? { cliente: filtro } : {}), ...v }).toString();

  const upcoming = shown.filter((i) => i.date >= today).sort((a, b) => (a.datetime ?? a.date).localeCompare(b.datetime ?? b.date));
  const listaByDay = new Map<string, CalItem[]>();
  for (const it of upcoming) {
    const arr = listaByDay.get(it.date) ?? [];
    arr.push(it);
    listaByDay.set(it.date, arr);
  }
  const reqSinFecha = requests.filter((r) => !r.preferred_at && (!filtro || r.client_id === filtro));

  return (
    <>
      <PageHeader title="Calendario" subtitle="Todos los clientes en una vista: reuniones, rodajes, entregas, hitos y solicitudes" />
      <div className="app-content">
        <div className="stack">
          {/* Filtro por cliente (color por cliente) */}
          <div className="cal-legend">
            <Link href={qp({ cliente: "" })} className={`client-chip${!filtro ? " active" : ""}`}>Todos</Link>
            {clients.map((c) => (
              <Link
                key={c.id}
                href={filtro === c.id ? qp({ cliente: "" }) : qp({ cliente: c.id })}
                className={`client-chip${filtro === c.id ? " active" : ""}`}
              >
                <span className="cal-dot" style={{ background: c.accent_color ?? DEFAULT_COLOR }} />
                {c.name}
              </Link>
            ))}
          </div>

          {/* Interruptor de vista */}
          <div className="page-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="seg">
              <Link href={qp({ vista: "mes" })} className={`seg-btn${vista === "mes" ? " active" : ""}`}>Mensual</Link>
              <Link href={qp({ vista: "lista" })} className={`seg-btn${vista === "lista" ? " active" : ""}`}>Lista</Link>
            </div>
            <span className="tag mono">{shown.length} eventos{filtro ? ` · ${nameOf(filtro)}` : ""}</span>
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
                    <div key={c.date} className={`cal-cell${c.inMonth ? "" : " out"}${c.date === today ? " cal-today" : ""}`}>
                      <div className="cal-daynum">{c.day}</div>
                      {dayItems.slice(0, 4).map((it) => (
                        <Link
                          key={it.key}
                          href={it.href ?? "#"}
                          className={`cal-pill${it.type === "solicitud" ? " cal-solicitud" : ""}`}
                          style={{ borderLeftColor: it.color }}
                          title={`${it.clientName} · ${TIPO_LABEL[it.type]}: ${it.title}`}
                        >
                          {it.title}
                        </Link>
                      ))}
                      {dayItems.length > 4 && <div className="cal-more">+{dayItems.length - 4}</div>}
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
                          <span className="cal-dot" style={{ background: it.color }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13.5px", fontWeight: 500 }}>
                              {it.href ? <Link href={it.href} className="row-link">{it.title}</Link> : it.title}
                            </div>
                            <div className="meta">
                              {it.clientName} · {TIPO_LABEL[it.type]}
                              {it.datetime ? ` · ${new Date(it.datetime).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}` : ""}
                            </div>
                          </div>
                          {it.request && (
                            <form style={{ display: "flex", gap: "6px" }}>
                              <input type="hidden" name="id" value={it.request.id} />
                              <input type="hidden" name="client_id" value={it.clientId} />
                              <button className="btn btn-sm btn-primary" formAction={agendarSolicitud}>Agendar</button>
                              <button className="btn btn-sm btn-danger" formAction={descartarSolicitud}>Descartar</button>
                            </form>
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

          {/* Solicitudes sin fecha preferida (no ubicables en la grilla) */}
          {reqSinFecha.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Solicitudes sin fecha preferida</h3><span className="tag">{reqSinFecha.length}</span></div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {reqSinFecha.map((r) => (
                  <div key={r.id} className="lista-row">
                    <span className="cal-dot" style={{ background: colorOf(r.client_id) }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 500 }}>{r.reason}</div>
                      <div className="meta">{nameOf(r.client_id)} · {reqEmailById.get(r.requested_by) ?? "—"} · urgencia {r.urgency}</div>
                    </div>
                    <form style={{ display: "flex", gap: "6px" }}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="client_id" value={r.client_id} />
                      <button className="btn btn-sm btn-primary" formAction={agendarSolicitud}>Agendar</button>
                      <button className="btn btn-sm btn-danger" formAction={descartarSolicitud}>Descartar</button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Próximos hitos (fases, todos los clientes) */}
          {phases.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Próximos hitos</h3><span className="tag">{phases.length}</span></div>
              <div className="hito-strip">
                {phases.filter((h) => !filtro || h.projects?.client_id === filtro).map((h) => (
                  <Link key={h.id} href={`/proyectos/${h.project_id}`} className="hito-chip" style={{ borderLeftColor: colorOf(h.projects?.client_id ?? "") }}>
                    <span className="hito-date mono">{formatDate(h.end_date)}</span>
                    <span className="hito-name">{h.name}</span>
                    {h.projects?.name && <span className="hito-proj">{nameOf(h.projects?.client_id ?? "")}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
