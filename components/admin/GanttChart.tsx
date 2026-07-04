"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildGantt, datePct } from "@/lib/gantt";
import {
  DELIVERABLE_STATUS_LABELS,
  deliverableStatusBadge,
  formatDate,
  formatDateTime,
} from "@/lib/format";
import type {
  Action,
  CalendarEvent,
  Deliverable,
  Phase,
} from "@/lib/types";

type ProjectChip = { id: string; name: string; clientName: string | null };

export default function GanttChart({
  projects,
  selectedId,
  phases,
  events,
  actionsByPhase,
  deliverablesByPhase,
  basePath = "/gantt",
}: {
  projects: ProjectChip[];
  selectedId: string;
  phases: Phase[];
  events: CalendarEvent[];
  actionsByPhase: Record<string, Action[]>;
  deliverablesByPhase: Record<string, Deliverable[]>;
  basePath?: string;
}) {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const [openPhaseId, setOpenPhaseId] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const layout = useMemo(() => buildGantt(phases, today), [phases, today]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenPhaseId(null);
        setOpenEventId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openPhase = phases.find((p) => p.id === openPhaseId) ?? null;
  const openEvent = events.find((e) => e.id === openEventId) ?? null;

  // Hitos ubicables dentro del rango de la Gantt.
  const eventMarkers = useMemo(() => {
    if (!layout) return [];
    return events
      .map((ev) => ({ ev, pct: datePct(layout, ev.starts_at) }))
      .filter((m): m is { ev: CalendarEvent; pct: number } => m.pct !== null);
  }, [events, layout]);

  return (
    <>
      <div className="gantt-toolbar">
        <span className="eyebrow">Proyecto</span>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`${basePath}?p=${p.id}`}
            className={`chip${p.id === selectedId ? " active" : ""}`}
          >
            {p.name}
            {p.clientName ? ` · ${p.clientName}` : ""}
          </Link>
        ))}
      </div>

      {layout ? (
        <div className="gantt">
          <div className="gantt-months">
            <div className="corner">Fase</div>
            <div className="months">
              {layout.months.map((m, i) => (
                <div key={i} style={{ width: `${m.widthPct}%` }}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Carril de hitos (eventos de calendario) */}
          {eventMarkers.length > 0 && (
            <div className="g-hitos">
              <div className="g-name">
                <div className="t">Hitos</div>
                <div className="s">calendario</div>
              </div>
              <div className="hitos-track">
                <div className="grid-lines">
                  {layout.months.map((m, i) => (
                    <span key={i} style={{ width: `${m.widthPct}%` }} />
                  ))}
                </div>
                {layout.todayPct != null && (
                  <div className="today" style={{ left: `${layout.todayPct}%` }} />
                )}
                {eventMarkers.map(({ ev, pct }) => (
                  <button
                    key={ev.id}
                    type="button"
                    className="hito-marker"
                    style={{ left: `${pct}%` }}
                    onClick={() => setOpenEventId(ev.id)}
                    title={`${ev.title} — ${formatDateTime(ev.starts_at)}`}
                  >
                    <span className="stem" />
                    <span
                      className="pin"
                      style={{
                        background: ev.source === "google" ? "var(--accent)" : "var(--warn)",
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {layout.rows.map(({ phase, leftPct, widthPct }) => {
            const done = phase.progress >= 100;
            const empty = phase.progress <= 0;
            return (
              <div className="g-row" key={phase.id}>
                <div className="g-name">
                  <div className="t">{phase.name}</div>
                  <div className="s">
                    {formatDate(phase.start_date)} → {formatDate(phase.end_date)}
                  </div>
                </div>
                <div className="g-track">
                  <div className="grid-lines">
                    {layout.months.map((m, i) => (
                      <span key={i} style={{ width: `${m.widthPct}%` }} />
                    ))}
                  </div>
                  {layout.todayPct != null && (
                    <div className="today" style={{ left: `${layout.todayPct}%` }} />
                  )}
                  <button
                    type="button"
                    className={`bar${done ? " done" : ""}${empty ? " bar-empty" : ""}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    onClick={() => setOpenPhaseId(phase.id)}
                    title={`${phase.name} — ${phase.progress}%`}
                  >
                    <div className="fill" style={{ width: `${phase.progress}%` }} />
                    <span className="pct">{phase.progress}%</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="gantt">
          <div className="empty">
            Este proyecto aún no tiene fases. Agrégalas desde la ficha del
            proyecto para dibujar la carta Gantt.
          </div>
        </div>
      )}

      {openPhase && layout && (
        <PhaseModal
          phase={openPhase}
          actions={actionsByPhase[openPhase.id] ?? []}
          deliverables={deliverablesByPhase[openPhase.id] ?? []}
          events={eventsInPhase(events, openPhase)}
          onClose={() => setOpenPhaseId(null)}
        />
      )}

      {openEvent && (
        <EventModal event={openEvent} onClose={() => setOpenEventId(null)} />
      )}
    </>
  );
}

/** Eventos cuyo inicio cae dentro del rango de una fase. */
function eventsInPhase(events: CalendarEvent[], phase: Phase): CalendarEvent[] {
  const from = new Date(phase.start_date + "T00:00:00").getTime();
  const to = new Date(phase.end_date + "T23:59:59").getTime();
  return events.filter((e) => {
    const t = new Date(e.starts_at).getTime();
    return t >= from && t <= to;
  });
}

function PhaseModal({
  phase,
  actions,
  deliverables,
  events,
  onClose,
}: {
  phase: Phase;
  actions: Action[];
  deliverables: Deliverable[];
  events: CalendarEvent[];
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="modal-head">
        <div>
          <h3>{phase.name}</h3>
          <div className="sub">
            {formatDate(phase.start_date)} → {formatDate(phase.end_date)} ·{" "}
            {phase.progress}% de avance
          </div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>

      <div className="modal-body">
        <div className="modal-sec">
          <h4>Acciones ejecutadas</h4>
          {actions.length ? (
            actions.map((a) => (
              <div className="detail-item" key={a.id}>
                <div className="di-top">
                  <span className="di-title">{a.title}</span>
                  <span className="di-when">
                    {a.kind ? `${a.kind} · ` : ""}
                    {formatDate(a.action_date)}
                  </span>
                </div>
                {a.description && <div className="di-desc">{a.description}</div>}
                {a.result && <div className="di-result">{a.result}</div>}
              </div>
            ))
          ) : (
            <div className="modal-empty">Sin acciones registradas en esta fase.</div>
          )}
        </div>

        <div className="modal-sec">
          <h4>Entregables</h4>
          {deliverables.length ? (
            deliverables.map((d) => (
              <div className="detail-item" key={d.id}>
                <div className="di-top">
                  <span className="di-title">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="row-link">
                        {d.title} ↗
                      </a>
                    ) : (
                      d.title
                    )}
                  </span>
                  <span className={`badge ${deliverableStatusBadge(d.status)}`}>
                    {DELIVERABLE_STATUS_LABELS[d.status]}
                  </span>
                </div>
                {d.description && <div className="di-desc">{d.description}</div>}
                {d.result && <div className="di-result">{d.result}</div>}
              </div>
            ))
          ) : (
            <div className="modal-empty">Sin entregables en esta fase.</div>
          )}
        </div>

        <div className="modal-sec">
          <h4>Hitos de calendario en el rango</h4>
          {events.length ? (
            events.map((e) => (
              <div className="detail-item" key={e.id}>
                <div className="di-top">
                  <span className="di-title">{e.title}</span>
                  <span className="di-when">{formatDateTime(e.starts_at)}</span>
                </div>
                {e.description && <div className="di-desc">{e.description}</div>}
              </div>
            ))
          ) : (
            <div className="modal-empty">Sin hitos en el rango de esta fase.</div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

function EventModal({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="modal-head">
        <div>
          <h3>{event.title}</h3>
          <div className="sub">
            {formatDateTime(event.starts_at)}
            {event.ends_at ? ` → ${formatDateTime(event.ends_at)}` : ""}
          </div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <div className="modal-body">
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`badge ${event.source === "google" ? "b-accent" : "b-idle"}`}>
            {event.source === "google" ? "Google Calendar" : "Creado en el panel"}
          </span>
          {event.kind && <span className="tag">{event.kind}</span>}
        </div>
        {event.description && (
          <div className="di-desc" style={{ marginTop: "4px" }}>
            {event.description}
          </div>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
