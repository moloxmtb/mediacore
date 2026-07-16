import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NotaBitacoraForm from "@/components/admin/NotaBitacoraForm";
import NotificarButton from "@/components/admin/NotificarButton";
import SlideOver from "@/components/admin/SlideOver";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { formatDate, formatDateTime, DELIVERABLE_STATUS_LABELS } from "@/lib/format";
import {
  mergeBitacora,
  BITACORA_KIND_LABELS,
  type BitacoraEntry,
  type BitacoraKind,
} from "@/lib/bitacora";
import type { DeliverableStatus } from "@/lib/types";

function todaySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function ymdMonthsAgo(base: string, months: number): string {
  const d = new Date(base + "T00:00:00");
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_COLOR = "var(--tx-3)";
const SEC = "var(--sec-bitacora)";

/* MAPA §9: la bitácora NO lleva semáforo (es log de hechos consumados). Se
   distingue por ICONO según kind, en color neutro. */
const IcoLog = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
);
const KIND_ICON: Record<BitacoraKind, ReactNode> = {
  reunion: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>
  ),
  entrega: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" /></svg>
  ),
  hito: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4M4 4h13l-2 4 2 4H4" /></svg>
  ),
  nota: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
  ),
};

export default async function BitacoraPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; desde?: string }>;
}) {
  await requireAdminRole("acciones"); // owner + ejecutivo
  const supabase = await createClient();
  const sp = await searchParams;

  const today = todaySantiago();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(sp.desde ?? "") ? (sp.desde as string) : ymdMonthsAgo(today, 6);
  const filtro = sp.cliente ?? "";
  const desdeIso = desde + "T00:00:00";

  // Cuatro fuentes, cada una bajo SU RLS (staff_sees_client / _project). La unión
  // se hace en la app: no hay join cross-tabla que salte una policy.
  const [{ data: clientsData }, { data: actionsData }, { data: delivData }, { data: phasesData }, { data: eventsData }, { data: minutesData }] =
    await Promise.all([
      supabase.from("clients").select("id, name, accent_color").order("name"),
      supabase
        .from("actions")
        .select("id, action_date, title, description, project_id, client_id, visible_to_client")
        .gte("action_date", desde),
      supabase
        .from("deliverables")
        .select("id, title, status, delivered_at, visible_to_client, project_id, projects(client_id)")
        .in("status", ["entregado", "aprobado"])
        .not("delivered_at", "is", null)
        .gte("delivered_at", desde),
      supabase
        .from("phases")
        .select("id, name, end_date, progress, project_id, projects(client_id)")
        .eq("progress", 100)
        .gte("end_date", desde),
      supabase
        .from("calendar_events")
        .select("id, title, starts_at, client_id, visible_to_client")
        .eq("kind", "reunion")
        .gte("starts_at", desdeIso),
      supabase.from("meeting_minutes").select("event_id, realizada"),
    ]);

  const clients = (clientsData ?? []) as { id: string; name: string; accent_color: string | null }[];
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const nameOf = (id: string) => clientById.get(id)?.name ?? "Cliente";
  const colorOf = (id: string) => clientById.get(id)?.accent_color ?? DEFAULT_COLOR;

  const realizada = new Map(((minutesData ?? []) as { event_id: string; realizada: boolean }[]).map((m) => [m.event_id, m.realizada]));

  // --- Construir entradas normalizadas (interna derivada del flag de CADA fuente) ---
  const entries: BitacoraEntry[] = [];

  for (const a of (actionsData ?? []) as { id: string; action_date: string; title: string; description: string | null; project_id: string | null; client_id: string; visible_to_client: boolean }[]) {
    entries.push({
      key: "a" + a.id, kind: "nota", date: a.action_date, sortKey: a.action_date + "T00:00:00",
      clientId: a.client_id, title: a.title, detail: a.description,
      href: a.project_id ? `/proyectos/${a.project_id}` : null, interna: !a.visible_to_client,
    });
  }
  for (const d of (delivData ?? []) as unknown as { id: string; title: string; status: DeliverableStatus; delivered_at: string; visible_to_client: boolean; project_id: string; projects: { client_id: string } | null }[]) {
    const cid = d.projects?.client_id ?? "";
    entries.push({
      key: "d" + d.id, kind: "entrega", date: d.delivered_at, sortKey: d.delivered_at + "T00:00:00",
      clientId: cid, title: d.title, detail: `Entrega ${DELIVERABLE_STATUS_LABELS[d.status].toLowerCase()}`,
      href: `/proyectos/${d.project_id}`, interna: !d.visible_to_client,
    });
  }
  for (const p of (phasesData ?? []) as unknown as { id: string; name: string; end_date: string; project_id: string; projects: { client_id: string } | null }[]) {
    const cid = p.projects?.client_id ?? "";
    entries.push({
      key: "p" + p.id, kind: "hito", date: p.end_date, sortKey: p.end_date + "T00:00:00",
      clientId: cid, title: p.name, detail: "Hito cumplido",
      href: `/proyectos/${p.project_id}`, interna: false, // hitos: siempre visibles (RLS por proyecto)
    });
  }
  for (const e of (eventsData ?? []) as { id: string; title: string; starts_at: string; client_id: string; visible_to_client: boolean }[]) {
    if (realizada.get(e.id) !== true) continue; // solo reuniones realizadas
    entries.push({
      key: "e" + e.id, kind: "reunion", date: e.starts_at.slice(0, 10), sortKey: e.starts_at,
      clientId: e.client_id, title: e.title, detail: "Reunión realizada",
      href: `/calendario/${e.id}`, interna: !e.visible_to_client,
    });
  }

  const timeline = mergeBitacora(filtro ? entries.filter((x) => x.clientId === filtro) : entries);
  const byDay = new Map<string, BitacoraEntry[]>();
  for (const it of timeline) (byDay.get(it.date) ?? byDay.set(it.date, []).get(it.date)!).push(it);

  const qp = (v: Record<string, string>) => "?" + new URLSearchParams({ ...(filtro ? { cliente: filtro } : {}), desde, ...v }).toString();
  const masAtras = ymdMonthsAgo(desde, 6);

  const nuevaNota = (
    <SlideOver title="Agregar nota" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar nota</>}>
      <NotaBitacoraForm clients={clients} defaultDate={today} />
    </SlideOver>
  );

  return (
    <>
      <PageHeader title="Bitácora" subtitle="Lo que ya pasó: reuniones, entregas, hitos y notas" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        {/* Filtro por cliente (identidad = cuadradito, no estado) */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          <Link href={qp({ cliente: "" })} className={`dtype${!filtro ? " is-on" : ""}`} style={!filtro ? { borderColor: "var(--sec)", color: "var(--sec)" } : undefined}>Todos</Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={filtro === c.id ? qp({ cliente: "" }) : qp({ cliente: c.id })}
              className="dtype"
              style={{ gap: "6px", ...(filtro === c.id ? { borderColor: "var(--sec)", color: "var(--sec)" } : {}) }}
            >
              <span className="cli-sq" style={{ background: c.accent_color ?? DEFAULT_COLOR, width: "8px", height: "8px" }} />
              {c.name}
            </Link>
          ))}
        </div>

        <div className="dbox">
          <div className="dbox-head">
            <span className="dh-ico"><IcoLog /></span>
            <h3>Línea de tiempo</h3>
            <span className="dcount">{timeline.length}</span>
            <div className="dhead-actions">
              <span className="mut mono" style={{ fontSize: "11px" }}>desde {formatDate(desde)}</span>
              {nuevaNota}
            </div>
          </div>

          {timeline.length ? (
            <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {[...byDay.entries()].map(([date, its]) => (
                <div key={date}>
                  <div className="mono" style={{ fontSize: "11px", color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: "8px" }}>
                    {formatDate(date)}
                  </div>
                  {its.map((it) => (
                    <div key={it.key} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "9px 0", borderBottom: "0.5px solid rgba(255,255,255,.045)" }}>
                      {/* Icono por kind, en neutro (MAPA §9: el log no lleva semáforo) */}
                      <span style={{ color: "var(--tx-3)", display: "inline-flex", width: "16px", height: "16px", flex: "none", marginTop: "2px" }}>
                        {KIND_ICON[it.kind]}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13.5px", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span className="dtype">{BITACORA_KIND_LABELS[it.kind]}</span>
                          {it.href ? <Link href={it.href} className="row-link">{it.title}</Link> : it.title}
                          {it.interna && <span className="dtype">Interna</span>}
                        </div>
                        <div className="mut" style={{ fontSize: "12px", marginTop: "3px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className="cli-sq" style={{ background: colorOf(it.clientId), width: "8px", height: "8px" }} />
                          {nameOf(it.clientId)}
                          {it.detail ? ` · ${it.detail}` : ""}
                          {it.kind === "reunion" ? ` · ${formatDateTime(it.sortKey)}` : ""}
                        </div>
                      </div>
                      {/* Notificar solo las NOTAS (tabla actions = objeto bitácora); el
                          resto del timeline se notifica por su propio kind. key = "a"+id. */}
                      {it.kind === "nota" && (
                        <div className="dacts">
                          <NotificarButton kind="bitacora" id={it.key.slice(1)} icon sec={SEC} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="dempty">
              <span>Sin registros desde {formatDate(desde)}.</span>
              {nuevaNota}
            </div>
          )}
          <div className="dbox-body" style={{ borderTop: "0.5px solid var(--v2-line)" }}>
            <Link href={qp({ desde: masAtras })} className="dbtn dbtn-sm">Cargar 6 meses más (desde {formatDate(masAtras)})</Link>
          </div>
        </div>
      </div>
    </>
  );
}
