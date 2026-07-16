import { agendarYCrearEvento } from "@/app/(admin)/calendario/evento-actions";
import { descartarSolicitud } from "@/app/(portal)/portal/calendario/reunion-actions";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/**
 * Acciones sobre una solicitud de reunión: "Agendar" (crea el evento real
 * sincronizado con Google en la fecha elegida y la marca agendada) o "Descartar".
 * Reusado en el dashboard, la ficha del cliente y el calendario del admin.
 */
export default function AgendarSolicitudForm({
  requestId,
  clientId,
  clientName,
  preferredAt,
}: {
  requestId: string;
  clientId: string;
  clientName: string;
  preferredAt: string | null;
}) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
      <details>
        <summary className="dbtn dbtn-primary dbtn-sm">Agendar</summary>
        <form className="form" style={{ maxWidth: "none", marginTop: "8px", minWidth: "260px" }}>
          <input type="hidden" name="id" value={requestId} />
          <input type="hidden" name="client_id" value={clientId} />
          <div className="field">
            <label>Fecha y hora</label>
            <input type="datetime-local" name="starts_at" defaultValue={toLocalInput(preferredAt)} required />
          </div>
          <div className="field">
            <label>Título del evento</label>
            <input name="title" defaultValue={`Reunión con ${clientName}`} />
          </div>
          <span className="hint">Crea el evento y lo sincroniza con el Google Calendar del cliente.</span>
          <div className="form-actions">
            <button className="dbtn dbtn-primary dbtn-sm" formAction={agendarYCrearEvento}>Agendar y crear evento</button>
          </div>
        </form>
      </details>
      <form>
        <input type="hidden" name="id" value={requestId} />
        <input type="hidden" name="client_id" value={clientId} />
        <button className="btn btn-sm btn-danger" formAction={descartarSolicitud}>Descartar</button>
      </form>
    </div>
  );
}
