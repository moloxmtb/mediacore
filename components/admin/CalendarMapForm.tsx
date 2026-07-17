"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/clientes/actions";

const initial: FormState = { error: null };

export default function CalendarMapForm({
  action,
  clientId,
  current,
  calendars,
  connected,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  current: string | null;
  calendars: { id: string; summary: string; primary: boolean }[];
  connected: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "520px" }}>
      <input type="hidden" name="id" value={clientId} />

      <div className="field">
        <label>Calendario de Google de este cliente</label>
        {connected && calendars.length ? (
          <select name="google_calendar_id" defaultValue={current ?? ""}>
            <option value="">Sin calendario asignado</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary}
                {c.primary ? " (principal)" : ""}
              </option>
            ))}
            {/* Conserva el id actual aunque no esté en la lista devuelta. */}
            {current && !calendars.some((c) => c.id === current) && (
              <option value={current}>{current}</option>
            )}
          </select>
        ) : (
          <>
            <input
              name="google_calendar_id"
              defaultValue={current ?? ""}
              placeholder="ID del calendario (ej: abc123@group.calendar.google.com)"
            />
            <span className="hint">
              {connected
                ? "Conecta el listado de calendarios o pega el ID manualmente."
                : "Conecta Google Calendar en Integraciones para elegir de una lista."}
            </span>
          </>
        )}
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Calendario guardado</span>}

      <div className="form-actions">
        <button className="dbtn dbtn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar calendario"}
        </button>
      </div>
    </form>
  );
}
