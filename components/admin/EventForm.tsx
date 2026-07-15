"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "@/components/admin/SlideOver";
import type { FormState } from "@/app/(admin)/proyectos/hitos-actions";
import type { CalendarEvent } from "@/lib/types";

const initial: FormState = { error: null };

const KINDS = ["hito", "reunion", "rodaje", "entrega", "deadline"];

/** Convierte un timestamptz ISO al formato de <input datetime-local>. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export default function EventForm({
  action,
  clientId,
  projectId,
  event,
  submitLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  projectId: string;
  event?: CalendarEvent;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useSlideOverAutoClose(state.ok);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="project_id" value={projectId} />
      {event && <input type="hidden" name="id" value={event.id} />}

      <div className="field">
        <label>Título del hito</label>
        <input name="title" defaultValue={event?.title ?? ""} required />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Inicio</label>
          <input
            name="starts_at"
            type="datetime-local"
            defaultValue={toLocalInput(event?.starts_at ?? null)}
            required
          />
        </div>
        <div className="field">
          <label>Término (opcional)</label>
          <input
            name="ends_at"
            type="datetime-local"
            defaultValue={toLocalInput(event?.ends_at ?? null)}
          />
        </div>
      </div>

      <div className="field">
        <label>Tipo</label>
        <select name="kind" defaultValue={event?.kind ?? "hito"}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Descripción</label>
        <textarea name="description" defaultValue={event?.description ?? ""} />
      </div>

      <label
        style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--muted)" }}
      >
        <input
          type="checkbox"
          name="visible_to_client"
          defaultChecked={event ? event.visible_to_client : true}
          style={{ width: "auto" }}
        />
        Visible para el cliente en su portal
      </label>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Hito guardado</span>}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
