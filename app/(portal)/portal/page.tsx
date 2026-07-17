import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { taskClientLabel } from "@/lib/estado";
import { marcarHechaPortal } from "./tareas/actions";
import { confirmarAsistencia } from "./asistencia-actions";

const SEC = "var(--accent)";

type EventRow = { id: string; title: string; starts_at: string; kind: string | null; project_id: string | null; projects: { name: string } | null };

const IcoRocket = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 8-10c3 0 5 2 5 5a22 22 0 0 1-10 8z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
);
const IcoCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
);
const IcoCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
);

export default async function PortalInicioPage() {
  const session = await requirePortalWorld("content");
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [
    { data: projectsData },
    { data: phasesData },
    { data: pendTasks },
    { count: contentPend },
    { count: entregablesPorRevisar },
    { data: upEvents },
  ] = await Promise.all([
    supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
    supabase.from("phases").select("project_id, progress"),
    supabase.from("tasks").select("id, titulo, plazo, estado").eq("tipo", "cliente").eq("estado", "pendiente").order("created_at", { ascending: false }),
    supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("status", "propuesta"),
    supabase.from("deliverables").select("id", { count: "exact", head: true }).eq("en_flujo_aprobacion", true).eq("approval_status", "enviado"),
    supabase.from("calendar_events").select("id, title, starts_at, kind, project_id, projects(name)").gte("starts_at", now).order("starts_at", { ascending: true }).limit(15),
  ]);

  const projects = (projectsData ?? []) as { id: string; name: string }[];
  const tasks = (pendTasks ?? []) as { id: string; titulo: string; plazo: string | null; estado: "pendiente" }[];
  const upcoming = (upEvents ?? []) as unknown as EventRow[];

  // Avance por proyecto = promedio de sus fases.
  const progByProject = new Map<string, { sum: number; n: number }>();
  for (const ph of (phasesData ?? []) as { project_id: string; progress: number }[]) {
    const acc = progByProject.get(ph.project_id) ?? { sum: 0, n: 0 };
    acc.sum += ph.progress; acc.n += 1;
    progByProject.set(ph.project_id, acc);
  }
  const projectProgress = (id: string) => {
    const acc = progByProject.get(id);
    return acc && acc.n ? Math.round(acc.sum / acc.n) : 0;
  };

  const nextHitoByProject = new Map<string, EventRow>();
  const nextReunionByProject = new Map<string, EventRow>();
  for (const e of upcoming) {
    const k = e.kind ?? "";
    if ((k === "hito" || k === "deadline") && e.project_id && !nextHitoByProject.has(e.project_id)) nextHitoByProject.set(e.project_id, e);
    if (k === "reunion" && e.project_id && !nextReunionByProject.has(e.project_id)) nextReunionByProject.set(e.project_id, e);
  }
  // Próximo global (por si un evento no está atado a un proyecto): el cliente
  // solo ve los suyos por RLS, así que el "próximo" global es igual de válido.
  const globalNextHito = upcoming.find((e) => e.kind === "hito" || e.kind === "deadline");
  const proxReunion = upcoming.find((e) => e.kind === "reunion");
  let miAsistencia: boolean | null = null;
  if (proxReunion) {
    const { data: att } = await supabase.from("event_attendance").select("attending").eq("event_id", proxReunion.id).eq("user_id", session.userId).maybeSingle();
    miAsistencia = att ? (att.attending as boolean) : null;
  }

  const nada = tasks.length === 0 && (contentPend ?? 0) === 0 && (entregablesPorRevisar ?? 0) === 0 && !proxReunion;

  return (
    <>
      <PageHeader title="Inicio" subtitle="Tu resumen con Color Media" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div className="stack">

          {/* ── 1. Cómo va tu proyecto ── */}
          <div className="dbox">
            <div className="dbox-head"><span className="dh-ico"><IcoRocket /></span><h3>Cómo va tu proyecto</h3></div>
            <div className="dbox-body">
              {projects.length ? projects.map((p) => {
                const pct = projectProgress(p.id);
                // Preferir el evento atado a ESTE proyecto; si no hay, caer al
                // próximo global (útil para el caso típico de un solo proyecto).
                const hito = nextHitoByProject.get(p.id) ?? globalNextHito;
                const reunion = nextReunionByProject.get(p.id) ?? proxReunion;
                return (
                  <div key={p.id} className="pcard">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }}>
                      <Link href={`/portal/proyecto?p=${p.id}`} className="pc-name row-link">{p.name}</Link>
                      <span className="mono" style={{ fontSize: "13px", color: "var(--accent)" }}>{pct}%</span>
                    </div>
                    <div className="pbar"><div className="pbar-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="pc-meta">
                      <span>Próximo hito: <b>{hito ? `${hito.title} · ${formatDate(hito.starts_at.slice(0, 10))}` : "—"}</b></span>
                      <span>Próxima reunión: <b>{reunion ? formatDateTime(reunion.starts_at) : "—"}</b></span>
                    </div>
                  </div>
                );
              }) : (
                <div className="dempty">Aún no hay un proyecto en curso.</div>
              )}
            </div>
          </div>

          {/* ── 2. Te toca a ti ── */}
          <div className="dbox">
            <div className="dbox-head"><span className="dh-ico"><IcoCheck /></span><h3>Te toca a ti</h3></div>
            {nada ? (
              <div className="dempty">Por ahora no hay nada pendiente de tu parte.</div>
            ) : (
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(contentPend ?? 0) > 0 && (
                  <div className="lista-row">
                    <span className="tdot" />
                    <div style={{ flex: 1 }}>Tienes {contentPend} pieza{contentPend === 1 ? "" : "s"} de contenido por aprobar.</div>
                    <Link href="/portal/aprobaciones?tipo=contenido" className="dbtn dbtn-sm">Revisar</Link>
                  </div>
                )}
                {(entregablesPorRevisar ?? 0) > 0 && (
                  <div className="lista-row">
                    <span className="tdot" />
                    <div style={{ flex: 1 }}>Tienes {entregablesPorRevisar} entregable{entregablesPorRevisar === 1 ? "" : "s"} por revisar.</div>
                    <Link href="/portal/aprobaciones?tipo=entregables" className="dbtn dbtn-sm">Revisar</Link>
                  </div>
                )}
                {proxReunion && (
                  <div className="lista-row">
                    <span className="tdot" />
                    <div style={{ flex: 1 }}>
                      Tu próxima reunión: <b>{proxReunion.title}</b> · {formatDateTime(proxReunion.starts_at)}
                      {miAsistencia === true && <span style={{ marginLeft: "8px" }}><StateChip tone="ok" label="Confirmaste" /></span>}
                      {miAsistencia === false && <span style={{ marginLeft: "8px" }}><StateChip tone="neutral" label="Avisaste que no" /></span>}
                    </div>
                    <span style={{ display: "flex", gap: "6px" }}>
                      <form action={confirmarAsistencia}><input type="hidden" name="event_id" value={proxReunion.id} /><input type="hidden" name="attending" value="si" /><button className={`dbtn dbtn-sm${miAsistencia === true ? " dbtn-primary" : ""}`} type="submit">Asistiré</button></form>
                      <form action={confirmarAsistencia}><input type="hidden" name="event_id" value={proxReunion.id} /><input type="hidden" name="attending" value="no" /><button className="dbtn dbtn-sm" type="submit">No podré</button></form>
                    </span>
                  </div>
                )}
                {tasks.map((t) => (
                  <div key={t.id} className="lista-row">
                    <span className="tdot" />
                    <div style={{ flex: 1 }}>
                      {t.titulo}
                      {t.plazo && <span className="mut" style={{ fontSize: "12px" }}> · para {formatDate(t.plazo)}</span>}
                      <span style={{ marginLeft: "8px" }}><StateChip tone="wait" label={taskClientLabel(t.estado)} /></span>
                    </div>
                    <form action={marcarHechaPortal}><input type="hidden" name="id" value={t.id} /><button className="dbtn dbtn-primary dbtn-sm" type="submit">Marcar hecha</button></form>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 3. Lo que viene ── */}
          <div className="dbox">
            <div className="dbox-head"><span className="dh-ico"><IcoCal /></span><h3>Lo que viene</h3><span className="dcount">{upcoming.length}</span></div>
            {upcoming.length ? (
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {upcoming.map((e) => (
                  <div key={e.id} className="lista-row">
                    <span className="mono" style={{ color: "var(--accent)", width: "112px", flexShrink: 0, fontSize: "12px" }}>{formatDateTime(e.starts_at)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 500 }}>{e.title}</div>
                      <div className="mut" style={{ fontSize: "12px" }}>{e.projects?.name ?? ""}{e.kind ? ` · ${e.kind}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dempty">No hay fechas próximas por ahora.</div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
