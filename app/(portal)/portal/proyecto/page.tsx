import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GanttChart from "@/components/admin/GanttChart";
import Markdown from "@/components/Markdown";
import StateChip from "@/components/admin/StateChip";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signMinutas } from "@/lib/storage";
import { mergeBitacora, BITACORA_KIND_LABELS, type BitacoraEntry } from "@/lib/bitacora";
import { stStyle as st, projectTone } from "@/lib/estado";
import { PROJECT_STATUS_LABELS, formatDate, DELIVERABLE_STATUS_LABELS } from "@/lib/format";
import type {
  Action,
  CalendarEvent,
  ClientStrategy,
  Deliverable,
  DeliverableStatus,
  Phase,
  Project,
} from "@/lib/types";

const SEC = "var(--accent)";

function todaySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function ymdMonthsAgo(base: string, months: number): string {
  const d = new Date(base + "T00:00:00");
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const IcoGantt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M4 12h13M10 18h11M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
);
const IcoTarget = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></svg>
);
const IcoClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

export default async function PortalProyectoPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; desde?: string }>;
}) {
  const session = await requirePortalWorld("content");
  const supabase = await createClient();
  const sp = await searchParams;
  const today = todaySantiago();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(sp.desde ?? "") ? (sp.desde as string) : ymdMonthsAgo(today, 6);
  const desdeIso = desde + "T00:00:00";
  const cid = session.clientId ?? "";

  // RLS: solo los proyectos del propio cliente.
  const { data: projectsData } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
  const projects = (projectsData ?? []) as Project[];
  const chips = projects.map((p) => ({ id: p.id, name: p.name, clientName: null }));
  const selectedId = sp.p && projects.some((p) => p.id === sp.p) ? sp.p : (projects[0]?.id ?? "");

  // Gantt del proyecto seleccionado + Estrategia + histórico, en paralelo.
  let phases: Phase[] = [];
  let events: CalendarEvent[] = [];
  const actionsByPhase: Record<string, Action[]> = {};
  const deliverablesByPhase: Record<string, Deliverable[]> = {};

  const [
    { data: ph },
    { data: ac },
    { data: de },
    { data: ev },
    { data: strategyData },
    { data: pastActs },
    { data: pastDelivs },
    { data: pastPhases },
    { data: pastReun },
    { data: minutes },
  ] = await Promise.all([
    selectedId ? supabase.from("phases").select("*").eq("project_id", selectedId).order("sort_order", { ascending: true }).order("start_date", { ascending: true }) : Promise.resolve({ data: [] }),
    selectedId ? supabase.from("actions").select("*").eq("project_id", selectedId).not("phase_id", "is", null).order("action_date", { ascending: false }) : Promise.resolve({ data: [] }),
    selectedId ? supabase.from("deliverables").select("*").eq("project_id", selectedId).not("phase_id", "is", null).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
    selectedId ? supabase.from("calendar_events").select("*").eq("project_id", selectedId).order("starts_at", { ascending: true }) : Promise.resolve({ data: [] }),
    supabase.from("client_strategy").select("*").maybeSingle(),
    supabase.from("actions").select("id, action_date, title, description, project_id").gte("action_date", desde),
    supabase.from("deliverables").select("id, title, status, delivered_at, project_id").in("status", ["entregado", "aprobado"]).not("delivered_at", "is", null).gte("delivered_at", desde),
    supabase.from("phases").select("id, name, end_date, project_id").eq("progress", 100).gte("end_date", desde),
    supabase.from("calendar_events").select("id, title, starts_at").eq("kind", "reunion").gte("starts_at", desdeIso),
    supabase.from("meeting_minutes").select("event_id, realizada, minuta_path"),
  ]);

  phases = (ph ?? []) as Phase[];
  events = (ev ?? []) as CalendarEvent[];
  for (const a of (ac ?? []) as Action[]) (actionsByPhase[a.phase_id!] ??= []).push(a);
  for (const d of (de ?? []) as Deliverable[]) (deliverablesByPhase[d.phase_id!] ??= []).push(d);

  const strategy = (strategyData as ClientStrategy | null) ?? null;
  const estrategiaVacia = !strategy || (!strategy.objetivo?.trim() && !strategy.publico?.trim() && !strategy.mensajes_clave?.trim() && !strategy.cuerpo?.trim());

  // --- Histórico ("Lo que ha pasado") ---
  const minuteByEvent = new Map(((minutes ?? []) as { event_id: string; realizada: boolean; minuta_path: string | null }[]).map((m) => [m.event_id, m]));
  const entries: BitacoraEntry[] = [];
  for (const a of (pastActs ?? []) as { id: string; action_date: string; title: string; description: string | null; project_id: string | null }[])
    entries.push({ key: "a" + a.id, kind: "nota", date: a.action_date, sortKey: a.action_date + "T00:00:00", clientId: cid, title: a.title, detail: a.description, href: null, interna: false });
  for (const d of (pastDelivs ?? []) as { id: string; title: string; status: DeliverableStatus; delivered_at: string; project_id: string }[])
    entries.push({ key: "d" + d.id, kind: "entrega", date: d.delivered_at, sortKey: d.delivered_at + "T00:00:00", clientId: cid, title: d.title, detail: `Entrega ${DELIVERABLE_STATUS_LABELS[d.status].toLowerCase()}`, href: null, interna: false });
  for (const p of (pastPhases ?? []) as { id: string; name: string; end_date: string; project_id: string }[])
    entries.push({ key: "p" + p.id, kind: "hito", date: p.end_date, sortKey: p.end_date + "T00:00:00", clientId: cid, title: p.name, detail: "Hito cumplido", href: null, interna: false });
  const minutaPaths: string[] = [];
  for (const e of (pastReun ?? []) as { id: string; title: string; starts_at: string }[]) {
    const m = minuteByEvent.get(e.id);
    if (!m?.realizada) continue;
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

  return (
    <>
      <PageHeader title="Mi proyecto" subtitle="Avance, estrategia y lo que hemos hecho contigo" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        {projects.length === 0 ? (
          <div className="dbox"><div className="dempty">Aún no hay proyectos que mostrar.</div></div>
        ) : (
          <div className="stack">
            {/* Resumen del/los proyecto(s) */}
            <div className="dbox">
              <div className="dbox-head">
                <span className="dh-ico"><IcoGantt /></span>
                <h3>Tu{projects.length > 1 ? "s" : ""} proyecto{projects.length > 1 ? "s" : ""}</h3>
                {projects.length > 1 && <span className="dcount">{projects.length}</span>}
              </div>
              <table className="dtable">
                <thead>
                  <tr><th>Proyecto</th><th>Estado</th><th>Inicio</th><th>Término</th></tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="drow" style={st(projectTone[p.status])}>
                      <td>
                        <Link href={`/portal/proyecto?p=${p.id}`} className="row-link">{p.name}</Link>
                        {p.description && <div className="mut" style={{ fontSize: "12px", marginTop: "2px" }}>{p.description}</div>}
                      </td>
                      <td><StateChip tone={projectTone[p.status]} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                      <td className="mono mut">{formatDate(p.start_date)}</td>
                      <td className="mono mut">{formatDate(p.end_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Avance (Carta Gantt, lectura) */}
            <div>
              <div className="dbox-head" style={{ marginBottom: "10px" }}>
                <span className="dh-ico"><IcoGantt /></span>
                <h3>Avance</h3>
              </div>
              <GanttChart
                projects={chips}
                selectedId={selectedId}
                phases={phases}
                events={events}
                actionsByPhase={actionsByPhase}
                deliverablesByPhase={deliverablesByPhase}
                basePath="/portal/proyecto"
              />
              <p className="mut" style={{ fontSize: "12.5px", marginTop: "8px" }}>
                Haz clic en una barra para ver el detalle de la fase: acciones y entregables. Es la misma planificación que llevamos internamente, en modo lectura.
              </p>
            </div>

            {/* Estrategia */}
            {!estrategiaVacia && (
              <div className="dbox">
                <div className="dbox-head">
                  <span className="dh-ico"><IcoTarget /></span>
                  <h3>Estrategia</h3>
                </div>
                <div className="dbox-body kv">
                  <div className="kv-row"><span className="kv-k">Objetivo</span><span className="kv-v">{strategy!.objetivo?.trim() || "—"}</span></div>
                  <div className="kv-row"><span className="kv-k">Público</span><span className="kv-v">{strategy!.publico?.trim() || "—"}</span></div>
                  <div className="kv-row"><span className="kv-k">Mensajes clave</span><span className="kv-v">{strategy!.mensajes_clave?.trim() || "—"}</span></div>
                </div>
                {strategy!.cuerpo?.trim() && (
                  <div className="dbox-body" style={{ borderTop: "0.5px solid var(--v2-line)" }}>
                    <Markdown>{strategy!.cuerpo}</Markdown>
                  </div>
                )}
              </div>
            )}

            {/* Lo que ha pasado */}
            <div className="dbox">
              <div className="dbox-head">
                <span className="dh-ico"><IcoClock /></span>
                <h3>Lo que ha pasado</h3>
                <span className="dcount">{timeline.length} · desde {formatDate(desde)}</span>
              </div>
              {timeline.length ? (
                <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {[...byDay.entries()].map(([date, its]) => (
                    <div key={date}>
                      <div className="lista-fecha">{formatDate(date)}</div>
                      {its.map((it) => (
                        <div key={it.key} className="lista-row">
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13.5px", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span className="dtype">{BITACORA_KIND_LABELS[it.kind]}</span>
                              {it.title}
                            </div>
                            {it.detail && <div className="mut" style={{ fontSize: "12px" }}>{it.detail}</div>}
                          </div>
                          {it.kind === "reunion" && minutaUrlByKey.has(it.key) && (
                            <a href={minutaUrlByKey.get(it.key)} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">Descargar minuta</a>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dempty">Aún no hay registros desde {formatDate(desde)}.</div>
              )}
              <div className="dbox-body" style={{ borderTop: "0.5px solid var(--v2-line)" }}>
                <Link href={`?desde=${masAtras}`} className="dbtn dbtn-sm">Cargar 6 meses más</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
