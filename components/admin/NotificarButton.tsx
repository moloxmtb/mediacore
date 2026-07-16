"use client";

import { useActionState } from "react";
import { notificarObjeto, type NotifyState } from "@/app/(admin)/notificar-actions";
import type { NotifyKind } from "@/lib/notify-manual";
import SlideOver, { useSlideOverAutoClose } from "@/components/admin/SlideOver";

const initial: NotifyState = { error: null };

/**
 * Formulario de aviso (audiencia + mensaje). La lógica es idéntica en ambas
 * variantes; solo cambia el envoltorio. `useSlideOverAutoClose` cierra el panel
 * al enviar con éxito y es no-op fuera de un slide-over.
 */
function NotificarForm({ kind, id }: { kind: NotifyKind; id: string }) {
  const [state, formAction, pending] = useActionState(notificarObjeto, initial);
  useSlideOverAutoClose(state.ok);

  return (
    <form action={formAction} style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px", maxWidth: "360px" }}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />

      <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: "14px", fontSize: "13px" }}>
        <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="radio" name="audience" value="equipo" required /> Equipo
        </label>
        <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="radio" name="audience" value="cliente" required /> Cliente
        </label>
      </fieldset>

      <textarea name="message" rows={2} placeholder="Mensaje (opcional)…" style={{ width: "100%" }} />

      <div>
        <button className="btn btn-sm btn-primary" type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar aviso"}
        </button>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && state.skipped && <div className="hint">{state.skipped}</div>}
      {state.ok && !state.skipped && <span className="badge-soft">Aviso enviado ({state.sent})</span>}
    </form>
  );
}

/**
 * Botón contextual "notificar" para cualquiera de los 7 objetos. Variante por
 * defecto: `<details>` legacy (páginas aún sin migrar). Variante `icon`: campana
 * v2 (.dact con tooltip) que abre el formulario en un slide-over — para las
 * páginas ya migradas al sistema v2. `sec` fija el tono del panel.
 */
export default function NotificarButton({
  kind,
  id,
  icon = false,
  sec = "var(--sec)",
}: {
  kind: NotifyKind;
  id: string;
  icon?: boolean;
  sec?: string;
}) {
  if (icon) {
    return (
      <SlideOver
        title="Notificar"
        sec={sec}
        triggerClass="dact"
        triggerTip="Notificar"
        triggerAria="Notificar"
        trigger={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        }
      >
        <NotificarForm kind={kind} id={id} />
      </SlideOver>
    );
  }

  return (
    <details className="notificar">
      <summary className="btn btn-sm">Notificar</summary>
      <NotificarForm kind={kind} id={id} />
    </details>
  );
}
