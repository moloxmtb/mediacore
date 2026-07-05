import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { requirePortalWorld, canSeeContent, canSeeFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DELIVERABLE_STATUS_LABELS,
  deliverableStatusBadge,
  formatDateTime,
} from "@/lib/format";
import type { DeliverableStatus } from "@/lib/types";
import { confirmarAsistencia } from "./asistencia-actions";

function todaySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function daysUntil(ymd: string, today: string): number {
  const a = new Date(today + "T00:00:00");
  const b = new Date(ymd + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function enDias(d: number): string {
  if (d < 0) return `hace ${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`;
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  return `en ${d} días`;
}

type Alert = {
  tone: string;
  text: string;
  href?: string;
  cta?: string;
  // Para la alerta de reunión: activa los botones de confirmar asistencia.
  reunionId?: string;
  attending?: boolean | null;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  kind: string | null;
  project_id: string | null;
  projects: { name: string } | null;
};
type DeliverableRow = {
  id: string;
  title: string;
  result: string | null;
  status: DeliverableStatus;
  project_id: string;
  projects: { name: string } | null;
};

export default async function QueVienePage() {
  const session = await requirePortalWorld("content");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const today = todaySantiago();

  // RLS filtra a lo del propio cliente y con visible_to_client = true.
  const [{ data: events }, { data: deliverables }, { count: contentPend }, { data: cuotas }] =
    await Promise.all([
      supabase
        .from("calendar_events")
        .select("id, title, description, starts_at, kind, project_id, projects(name)")
        .gte("starts_at", now)
        .order("starts_at", { ascending: true })
        .limit(20),
      supabase
        .from("deliverables")
        .select("id, title, result, status, project_id, projects(name)")
        .neq("status", "aprobado")
        .order("created_at", { ascending: false })
        .limit(20),
      // Piezas por aprobar (RLS: owner/content). content = quien maneja contenido.
      supabase
        .from("content_pieces")
        .select("id", { count: "exact", head: true })
        .eq("status", "propuesta"),
      // Cuota facturada impaga más próxima (RLS: owner/finance).
      supabase
        .from("installments")
        .select("due_date")
        .eq("status", "facturada")
        .order("due_date", { ascending: true })
        .limit(1),
    ]);

  const hitos = (events ?? []) as unknown as EventRow[];
  const entregables = (deliverables ?? []) as unknown as DeliverableRow[];

  // --- Alertas accionables (cada una gateada por rol vía la RLS de su fuente) ---
  const alerts: Alert[] = [];

  // 1. Pago próximo a vencer (≤7 días o ya vencida). Solo dueño/finanzas.
  const nextDue = (cuotas ?? [])[0]?.due_date as string | undefined;
  if (canSeeFinance(session.clientRole) && nextDue) {
    const d = daysUntil(nextDue, today);
    if (d <= 7) {
      alerts.push({
        tone: d < 0 ? "bad" : "warn",
        text: d < 0 ? `Tienes un pago vencido (${enDias(d)}).` : `Tu próximo pago vence ${enDias(d)}.`,
        href: "/portal/finanzas",
        cta: "Ver cuentas",
      });
    }
  }

  // 2. Contenido por aprobar. Solo quien ve contenido (owner/content).
  if (canSeeContent(session.clientRole) && (contentPend ?? 0) > 0) {
    const n = contentPend ?? 0;
    alerts.push({
      tone: "accent",
      text: `Tienes ${n} pieza${n === 1 ? "" : "s"} de contenido por aprobar.`,
      href: "/portal/contenido",
      cta: "Revisar contenido",
    });
  }

  // 3. Próxima reunión en ≤3 días (owner/content, RLS de calendar) + confirmar.
  const proxReunion = hitos.find(
    (h) => h.kind === "reunion" && daysUntil(h.starts_at.slice(0, 10), today) <= 3,
  );
  if (proxReunion) {
    const { data: mine } = await supabase
      .from("event_attendance")
      .select("attending")
      .eq("event_id", proxReunion.id)
      .eq("user_id", session.userId)
      .maybeSingle();
    alerts.push({
      tone: "accent",
      text: `Tu próxima reunión es ${enDias(daysUntil(proxReunion.starts_at.slice(0, 10), today))}: ${proxReunion.title}.`,
      reunionId: proxReunion.id,
      attending: mine ? (mine.attending as boolean) : null,
    });
  }

  return (
    <>
      <PageHeader
        title="Qué viene"
        subtitle="Lo próximo en tus proyectos, ordenado en el tiempo"
      />
      <div className="app-content">
        {alerts.length > 0 && (
          <div className="card" style={{ marginBottom: "18px" }}>
            <div className="card-head">
              <h3>Requieren tu atención</h3>
              <span className="tag">{alerts.length}</span>
            </div>
            <ul className="alert-list">
              {alerts.map((a, i) => (
                <li key={i} className="alert-row">
                  <span className={`alert-dot alert-${a.tone}`} />
                  <span className="alert-text">{a.text}</span>
                  {a.reunionId ? (
                    <span className="alert-actions">
                      {a.attending === true && <span className="badge b-ok">Confirmaste asistencia</span>}
                      {a.attending === false && <span className="badge b-idle">Avisaste que no podrás</span>}
                      <form action={confirmarAsistencia} style={{ display: "inline" }}>
                        <input type="hidden" name="event_id" value={a.reunionId} />
                        <input type="hidden" name="attending" value="si" />
                        <button className={`btn btn-sm${a.attending === true ? " btn-primary" : ""}`} type="submit">
                          Asistiré
                        </button>
                      </form>
                      <form action={confirmarAsistencia} style={{ display: "inline" }}>
                        <input type="hidden" name="event_id" value={a.reunionId} />
                        <input type="hidden" name="attending" value="no" />
                        <button className={`btn btn-sm${a.attending === false ? " btn-danger" : ""}`} type="submit">
                          No podré
                        </button>
                      </form>
                    </span>
                  ) : (
                    a.href && <Link href={a.href} className="btn btn-sm">{a.cta}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid-2">
          {/* Próximos hitos */}
          <div className="card">
            <div className="card-head">
              <h3>Próximos hitos</h3>
              <span className="tag">{hitos.length}</span>
            </div>
            {hitos.length ? (
              <ul className="feed" style={{ margin: 0, padding: "6px 0", listStyle: "none" }}>
                {hitos.map((h) => (
                  <li
                    key={h.id}
                    style={{ display: "flex", gap: "14px", padding: "12px 18px", borderBottom: "1px solid var(--border-soft)" }}
                  >
                    <span
                      className="mono"
                      style={{ color: "var(--accent)", width: "92px", flexShrink: 0, fontSize: "12px" }}
                    >
                      {formatDateTime(h.starts_at)}
                    </span>
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 500 }}>{h.title}</div>
                      <div className="meta">
                        {h.projects?.name ?? ""}
                        {h.kind ? ` · ${h.kind}` : ""}
                      </div>
                      {h.description && (
                        <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "3px" }}>
                          {h.description}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">No hay hitos próximos por ahora.</div>
            )}
          </div>

          {/* Entregables en curso */}
          <div className="card">
            <div className="card-head">
              <h3>Entregables en curso</h3>
              <span className="tag">{entregables.length}</span>
            </div>
            {entregables.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Entregable</th>
                    <th>Proyecto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {entregables.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/portal/proyectos/${d.project_id}`} className="row-link">
                          {d.title}
                        </Link>
                        {d.result && <div className="meta" style={{ marginTop: "3px" }}>{d.result}</div>}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{d.projects?.name ?? "—"}</td>
                      <td>
                        <span className={`badge ${deliverableStatusBadge(d.status)}`}>
                          {DELIVERABLE_STATUS_LABELS[d.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">No hay entregables en curso.</div>
            )}
          </div>
        </div>

        <div className="note">
          <p style={{ margin: 0 }}>
            Aquí ves solo lo que Color Media marcó como visible para ti. Cualquier
            duda sobre tus proyectos, escríbenos.
          </p>
        </div>
      </div>
    </>
  );
}
