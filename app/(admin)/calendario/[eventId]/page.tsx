import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/admin/DeleteButton";
import NotificarButton from "@/components/admin/NotificarButton";
import StateChip from "@/components/admin/StateChip";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signMinuta } from "@/lib/storage";
import { deriveReunionEstado } from "@/lib/reuniones";
import { REUNION_ESTADO_LABELS, formatDateTime } from "@/lib/format";
import { reunionTone } from "@/lib/estado";
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

const SEC = "var(--sec-calendario)";

const IcoCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
);
const IcoDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
);
const IcoCheckList = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l2 2 4-4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
);
const IcoNote = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16M4 10h16M4 15h10" /></svg>
);

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
      <Link href="/calendario" className="dback" style={{ marginBottom: 0 }}>← Volver al calendario</Link>
      <Link href={clientHref} className="dback" style={{ marginBottom: 0 }}>Ver ficha del cliente →</Link>
    </div>
  );

  // ---------- Evento sin clasificar (kind=null u otro): ofrecer marcar ----------
  if (!isReunion) {
    return (
      <>
        {cabecera}
        <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
          {navLinks}
          <div className="stack">
            <div className="dbox">
              <div className="dbox-head">
                <span className="dh-ico"><IcoCal /></span>
                <h3>Evento</h3>
                <div className="dhead-actions"><span className="dtype">Sin clasificar</span></div>
              </div>
              <div className="dbox-body">
                <div className="mut" style={{ fontSize: "12px" }}>{formatDateTime(ev.starts_at)}{ev.ends_at ? ` → ${formatDateTime(ev.ends_at)}` : ""}</div>
                {ev.description && <p style={{ marginTop: "8px" }}>{ev.description}</p>}
                <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <form action={marcarComoReunion}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <button className="dbtn dbtn-primary dbtn-sm" type="submit">Marcar como reunión</button>
                  </form>
                  <Link href={clientHref} className="dbtn dbtn-sm">Ver ficha del cliente</Link>
                </div>
                <p className="mut" style={{ fontSize: "12.5px", marginTop: "10px" }}>
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
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        {navLinks}

        <div className="stack">
          {/* Estado + datos */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoCal /></span>
              <h3>Reunión</h3>
              <div className="dhead-actions"><StateChip tone={reunionTone[estado]} label={REUNION_ESTADO_LABELS[estado]} /></div>
            </div>
            <div className="dbox-body">
              <div className="mut" style={{ fontSize: "12px" }}>{formatDateTime(ev.starts_at)}{ev.ends_at ? ` → ${formatDateTime(ev.ends_at)}` : ""}</div>
              {ev.description && <p style={{ marginTop: "8px" }}>{ev.description}</p>}
              {!ev.visible_to_client && (
                <div style={{ marginTop: "10px" }}>
                  <span className="dtype">Interna (no visible al cliente)</span>
                </div>
              )}

              {/* Transición: realizada (reversible) */}
              <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
                {minute?.realizada ? (
                  <form action={desmarcarRealizada}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <button className="dbtn dbtn-sm" type="submit">Desmarcar realizada</button>
                  </form>
                ) : (
                  <form action={marcarRealizada}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <button className="dbtn dbtn-primary dbtn-sm" type="submit">Marcar realizada</button>
                  </form>
                )}
                <span className="mut" style={{ fontSize: "12.5px" }}>
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
                    <button className="dbtn dbtn-sm" type="submit">No es una reunión (quitar tipo)</button>
                  </form>
                  <span className="mut" style={{ fontSize: "12.5px" }}>Disponible solo mientras no tenga minuta ni pendientes.</span>
                </div>
              )}

              {/* Notificar: render incondicional — la RLS ya limitó el evento a
                  staff que puede actuar sobre el cliente (canActOnClient). El gate
                  de cliente (visible_to_client del evento) lo aplica el motor. */}
              <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-soft)", paddingTop: "12px" }}>
                <NotificarButton kind="reunion" id={eventId} icon sec={SEC} />
              </div>
            </div>
          </div>

          {/* Minuta PDF (reversible) */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoDoc /></span>
              <h3>Minuta (PDF)</h3>
              <div className="dhead-actions"><span className="dtype">{minute?.minuta_path ? "Cargada" : "Sin minuta"}</span></div>
            </div>
            <div className="dbox-body">
              {minutaUrl && (
                <div style={{ marginBottom: "12px" }}>
                  <a href={minutaUrl} target="_blank" rel="noopener noreferrer" className="dbtn dbtn-sm">Ver minuta actual</a>
                </div>
              )}
              <form action={subirMinutaPdf} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input type="hidden" name="event_id" value={eventId} />
                <input type="file" name="pdf" accept="application/pdf" required />
                <button className="dbtn dbtn-primary dbtn-sm" type="submit">
                  {minute?.minuta_path ? "Reemplazar minuta" : "Subir minuta"}
                </button>
              </form>
              {minute?.minuta_path && (
                <div style={{ marginTop: "10px" }}>
                  <DeleteButton
                    icon
                    action={eliminarMinutaPdf}
                    hidden={{ event_id: eventId }}
                    label="Quitar minuta"
                    confirm="¿Quitar el PDF de la minuta? La reunión seguirá marcada como realizada."
                  />
                </div>
              )}
              <p className="mut" style={{ fontSize: "12.5px", marginTop: "10px" }}>Subir la minuta marca la reunión como realizada.</p>
            </div>
          </div>

          {/* Pendientes estructurados */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoCheckList /></span>
              <h3>Pendientes de la reunión</h3>
              <span className="dcount">{items.length}</span>
            </div>
            {items.length > 0 && (
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {items.map((it) => (
                  <div key={it.id} className="lista-row">
                    <form action={togglePendiente}>
                      <input type="hidden" name="item_id" value={it.id} />
                      <input type="hidden" name="event_id" value={eventId} />
                      {!it.hecho && <input type="hidden" name="hecho" value="1" />}
                      <button className="dbtn dbtn-sm" type="submit" title={it.hecho ? "Marcar pendiente" : "Marcar hecho"}>
                        {it.hecho ? "✓" : "○"}
                      </button>
                    </form>
                    <div style={{ flex: 1, textDecoration: it.hecho ? "line-through" : "none", color: it.hecho ? "var(--muted)" : "var(--text)" }}>
                      {it.texto}
                    </div>
                    <DeleteButton
                      icon
                      action={eliminarPendiente}
                      hidden={{ item_id: it.id, event_id: eventId }}
                      label="Eliminar"
                      confirm="¿Eliminar este pendiente?"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="dbox-body" style={{ borderTop: items.length ? "1px solid var(--border-soft)" : undefined }}>
              <form action={agregarPendiente} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="hidden" name="event_id" value={eventId} />
                <input name="texto" placeholder="Nuevo pendiente…" required style={{ flex: 1 }} />
                <button className="dbtn dbtn-primary dbtn-sm" type="submit">Agregar</button>
              </form>
              <p className="mut" style={{ fontSize: "12.5px", marginTop: "10px" }}>Estos pendientes podrán promoverse a tareas más adelante.</p>
            </div>
          </div>

          {/* Notas de la minuta */}
          <div className="dbox">
            <div className="dbox-head"><span className="dh-ico"><IcoNote /></span><h3>Notas</h3></div>
            <div className="dbox-body">
              <form action={guardarNotas}>
                <input type="hidden" name="event_id" value={eventId} />
                <textarea name="notas" rows={5} defaultValue={minute?.notas ?? ""} placeholder="Acuerdos, contexto, resumen…" style={{ width: "100%" }} />
                <div className="form-actions" style={{ marginTop: "10px" }}>
                  <button className="dbtn dbtn-primary dbtn-sm" type="submit">Guardar notas</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
