import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NotaBitacoraForm from "@/components/admin/NotaBitacoraForm";
import NotificarButton from "@/components/admin/NotificarButton";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { formatDate, formatDateTime, DELIVERABLE_STATUS_LABELS } from "@/lib/format";
import {
  mergeBitacora,
  BITACORA_KIND_LABELS,
  bitacoraKindBadge,
  type BitacoraEntry,
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

const DEFAULT_COLOR = "#3dbdcb";

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

  return (
    <>
      <PageHeader title="Bitácora" subtitle="Lo que ya pasó: reuniones, entregas, hitos y notas" />
      <div className="app-content">
        <div className="stack">
          {/* Agregar nota a mano */}
          <div className="card">
            <div className="card-head"><h3>Agregar nota</h3></div>
            <div className="card-body">
              <NotaBitacoraForm clients={clients} defaultDate={today} />
            </div>
          </div>

          {/* Filtro por cliente */}
          <div className="cal-legend">
            <Link href={qp({ cliente: "" })} className={`client-chip${!filtro ? " active" : ""}`}>Todos</Link>
            {clients.map((c) => (
              <Link key={c.id} href={filtro === c.id ? qp({ cliente: "" }) : qp({ cliente: c.id })} className={`client-chip${filtro === c.id ? " active" : ""}`}>
                <span className="cal-dot" style={{ background: c.accent_color ?? DEFAULT_COLOR }} />
                {c.name}
              </Link>
            ))}
          </div>

          {/* Timeline */}
          <div className="card">
            <div className="card-head">
              <h3>Línea de tiempo</h3>
              <span className="tag">{timeline.length} · desde {formatDate(desde)}</span>
            </div>
            {timeline.length ? (
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {[...byDay.entries()].map(([date, its]) => (
                  <div key={date}>
                    <div className="lista-fecha">{formatDate(date)}</div>
                    {its.map((it) => (
                      <div key={it.key} className="lista-row">
                        <span className="cal-dot" style={{ background: colorOf(it.clientId) }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "13.5px", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span className={`badge ${bitacoraKindBadge(it.kind)}`}>{BITACORA_KIND_LABELS[it.kind]}</span>
                            {it.href ? <Link href={it.href} className="row-link">{it.title}</Link> : it.title}
                            {it.interna && <span className="badge b-idle">Interna</span>}
                          </div>
                          <div className="meta">
                            {nameOf(it.clientId)}
                            {it.detail ? ` · ${it.detail}` : ""}
                            {it.kind === "reunion" ? ` · ${formatDateTime(it.sortKey)}` : ""}
                          </div>
                          {/* Notificar solo las NOTAS (tabla actions = objeto bitácora);
                              el resto del timeline se notifica por su propio kind. La
                              key es "a"+id → id = key.slice(1). Render incondicional:
                              la RLS ya limitó a clientes accionables (canActOnClient). */}
                          {it.kind === "nota" && (
                            <div style={{ marginTop: "6px" }}>
                              <NotificarButton kind="bitacora" id={it.key.slice(1)} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Sin registros desde {formatDate(desde)}.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)" }}>
              <Link href={qp({ desde: masAtras })} className="btn btn-sm">Cargar 6 meses más (desde {formatDate(masAtras)})</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
