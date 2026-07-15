import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/admin/DeleteButton";
import NotificarButton from "@/components/admin/NotificarButton";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signMinuta } from "@/lib/storage";
import { deriveReunionEstado } from "@/lib/reuniones";
import { REUNION_ESTADO_LABELS, reunionEstadoBadge, formatDateTime } from "@/lib/format";
import type { MeetingMinute, MeetingMinuteItem } from "@/lib/types";
import {
  marcarRealizada,
  desmarcarRealizada,
  subirMinutaPdf,
  eliminarMinutaPdf,
  guardarNotas,
  agregarPendiente,
  togglePendiente,
  eliminarPendiente,
  marcarComoReunion,
  desmarcarReunion,
} from "../minuta-actions";

export default async function EventoDetallePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireAdminRole("calendario");
  const { eventId } = await params;
  const supabase = await createClient();

  // RLS: staff solo alcanza los eventos de sus clientes. Cualquier evento abre
  // esta vista; se adapta según sea reunión o un evento sin clasificar.
  const { data: ev } = await supabase
    .from("calendar_events")
    .select("id, title, description, starts_at, ends_at, kind, client_id, visible_to_client, clients(name)")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) notFound();

  const clientName = (ev.clients as unknown as { name: string } | null)?.name ?? "Cliente";
  const clientHref = `/clientes/${ev.client_id}`;
  const isReunion = ev.kind === "reunion";

  // Datos de documentación solo si es reunión.
  const minute = isReunion
    ? (((await supabase.from("meeting_minutes").select("*").eq("event_id", eventId).maybeSingle()).data) as MeetingMinute | null)
    : null;
  const items = minute
    ? ((
        await supabase
          .from("meeting_minute_items")
          .select("*")
          .eq("minute_id", minute.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      ).data as MeetingMinuteItem[] | null) ?? []
    : [];
  const estado = deriveReunionEstado(ev.starts_at, minute?.realizada ?? false);
  const minutaUrl = await signMinuta(minute?.minuta_path ?? null);

  const cabecera = (
    <>
      <PageHeader title={ev.title} subtitle={`${isReunion ? "Reunión" : "Evento"} · ${clientName}`} />
    </>
  );
  const navLinks = (
    <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
      <Link href="/calendario" className="back-link">← Volver al calendario</Link>
      <Link href={clientHref} className="back-link">Ver ficha del cliente →</Link>
    </div>
  );

  // ---------- Evento sin clasificar (kind=null u otro): ofrecer marcar ----------
  if (!isReunion) {
    return (
      <>
        {cabecera}
        <div className="app-content">
          {navLinks}
          <div className="stack">
            <div className="card">
              <div className="card-head">
                <h3>Evento</h3>
                <span className="badge b-idle">Sin clasificar</span>
              </div>
              <div className="card-body">
                <div className="meta">{formatDateTime(ev.starts_at)}{ev.ends_at ? ` → ${formatDateTime(ev.ends_at)}` : ""}</div>
                {ev.description && <p style={{ marginTop: "8px" }}>{ev.description}</p>}
                <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <form action={marcarComoReunion}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <button className="btn btn-sm btn-primary" type="submit">Marcar como reunión</button>
                  </form>
                  <Link href={clientHref} className="btn btn-sm">Ver ficha del cliente</Link>
                </div>
                <p className="hint" style={{ marginTop: "10px" }}>
                  Este evento vino de tu calendario sin tipo. Márcalo como reunión para documentarla
                  (marcar realizada, subir minuta, pendientes).
                </p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ---------- Reunión: UI de documentar ----------
  return (
    <>
      {cabecera}
      <div className="app-content">
        {navLinks}

        <div className="stack">
          {/* Estado + datos */}
          <div className="card">
            <div className="card-head">
              <h3>Reunión</h3>
              <span className={`badge ${reunionEstadoBadge(estado)}`}>{REUNION_ESTADO_LABELS[estado]}</span>
            </div>
            <div className="card-body">
              <div className="meta">{formatDateTime(ev.starts_at)}{ev.ends_at ? ` → ${formatDateTime(ev.ends_at)}` : ""}</div>
              {ev.description && <p style={{ marginTop: "8px" }}>{ev.description}</p>}
              {!ev.visible_to_client && (
                <div style={{ marginTop: "10px" }}>
                  <span className="badge b-idle">Interna (no visible al cliente)</span>
                </div>
              )}

              {/* Transición: realizada (reversible) */}
              <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
                {minute?.realizada ? (
                  <form action={desmarcarRealizada}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <button className="btn btn-sm" type="submit">Desmarcar realizada</button>
                  </form>
                ) : (
                  <form action={marcarRealizada}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <button className="btn btn-sm btn-primary" type="submit">Marcar realizada</button>
                  </form>
                )}
                <span className="hint">
                  {estado === "por_documentar"
                    ? "La reunión ya pasó y aún no se documenta."
                    : estado === "realizada"
                      ? "Reunión realizada."
                      : "Reunión agendada (aún no ocurre)."}
                </span>
              </div>

              {/* Desmarcar el tipo reunión — solo si aún no hay documentación */}
              {!minute && (
                <div style={{ marginTop: "12px", borderTop: "1px solid var(--border-soft)", paddingTop: "12px" }}>
                  <form action={desmarcarReunion}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <button className="btn btn-sm" type="submit">No es una reunión (quitar tipo)</button>
                  </form>
                  <span className="hint">Disponible solo mientras no tenga minuta ni pendientes.</span>
                </div>
              )}

              {/* Notificar: render incondicional — la RLS ya limitó el evento a
                  staff que puede actuar sobre el cliente (canActOnClient). El gate
                  de cliente (visible_to_client del evento) lo aplica el motor. */}
              <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-soft)", paddingTop: "12px" }}>
                <NotificarButton kind="reunion" id={eventId} />
              </div>
            </div>
          </div>

          {/* Minuta PDF (reversible) */}
          <div className="card">
            <div className="card-head">
              <h3>Minuta (PDF)</h3>
              {minute?.minuta_path ? <span className="badge b-ok">Cargada</span> : <span className="badge b-idle">Sin minuta</span>}
            </div>
            <div className="card-body">
              {minutaUrl && (
                <div style={{ marginBottom: "12px" }}>
                  <a href={minutaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Ver minuta actual</a>
                </div>
              )}
              <form action={subirMinutaPdf} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input type="hidden" name="event_id" value={eventId} />
                <input type="file" name="pdf" accept="application/pdf" required />
                <button className="btn btn-sm btn-primary" type="submit">
                  {minute?.minuta_path ? "Reemplazar minuta" : "Subir minuta"}
                </button>
              </form>
              {minute?.minuta_path && (
                <div style={{ marginTop: "10px" }}>
                  <DeleteButton
                    action={eliminarMinutaPdf}
                    hidden={{ event_id: eventId }}
                    label="Quitar minuta"
                    confirm="¿Quitar el PDF de la minuta? La reunión seguirá marcada como realizada."
                  />
                </div>
              )}
              <p className="hint" style={{ marginTop: "10px" }}>Subir la minuta marca la reunión como realizada.</p>
            </div>
          </div>

          {/* Pendientes estructurados */}
          <div className="card">
            <div className="card-head">
              <h3>Pendientes de la reunión</h3>
              <span className="tag">{items.length}</span>
            </div>
            {items.length > 0 && (
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {items.map((it) => (
                  <div key={it.id} className="lista-row">
                    <form action={togglePendiente}>
                      <input type="hidden" name="item_id" value={it.id} />
                      <input type="hidden" name="event_id" value={eventId} />
                      {!it.hecho && <input type="hidden" name="hecho" value="1" />}
                      <button className="btn btn-sm" type="submit" title={it.hecho ? "Marcar pendiente" : "Marcar hecho"}>
                        {it.hecho ? "✓" : "○"}
                      </button>
                    </form>
                    <div style={{ flex: 1, textDecoration: it.hecho ? "line-through" : "none", color: it.hecho ? "var(--muted)" : "var(--text)" }}>
                      {it.texto}
                    </div>
                    <DeleteButton
                      action={eliminarPendiente}
                      hidden={{ item_id: it.id, event_id: eventId }}
                      label="Eliminar"
                      confirm="¿Eliminar este pendiente?"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="card-body" style={{ borderTop: items.length ? "1px solid var(--border-soft)" : undefined }}>
              <form action={agregarPendiente} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="hidden" name="event_id" value={eventId} />
                <input name="texto" placeholder="Nuevo pendiente…" required style={{ flex: 1 }} />
                <button className="btn btn-sm btn-primary" type="submit">Agregar</button>
              </form>
              <p className="hint" style={{ marginTop: "10px" }}>Estos pendientes podrán promoverse a tareas más adelante.</p>
            </div>
          </div>

          {/* Notas de la minuta */}
          <div className="card">
            <div className="card-head"><h3>Notas</h3></div>
            <div className="card-body">
              <form action={guardarNotas}>
                <input type="hidden" name="event_id" value={eventId} />
                <textarea name="notas" rows={5} defaultValue={minute?.notas ?? ""} placeholder="Acuerdos, contexto, resumen…" style={{ width: "100%" }} />
                <div className="form-actions" style={{ marginTop: "10px" }}>
                  <button className="btn btn-sm btn-primary" type="submit">Guardar notas</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
