"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "@/components/admin/SlideOver";
import type { FormState } from "@/app/(admin)/entregables/actions";
import type { Deliverable, Phase } from "@/lib/types";
import { DELIVERABLE_STATUS_LABELS } from "@/lib/format";

const initial: FormState = { error: null };

export default function DeliverableForm({
  action,
  projectId,
  phases,
  deliverable,
  submitLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  projectId: string;
  phases: Pick<Phase, "id" | "name">[];
  deliverable?: Deliverable;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useSlideOverAutoClose(state.ok);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="project_id" value={projectId} />
      {deliverable && <input type="hidden" name="id" value={deliverable.id} />}

      <div className="field">
        <label>Título</label>
        <input name="title" defaultValue={deliverable?.title ?? ""} required />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Fase</label>
          <select name="phase_id" defaultValue={deliverable?.phase_id ?? ""}>
            <option value="">Sin fase específica</option>
            {phases.map((ph) => (
              <option key={ph.id} value={ph.id}>
                {ph.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Estado</label>
          <select name="status" defaultValue={deliverable?.status ?? "en_proceso"}>
            {Object.entries(DELIVERABLE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Enlace (Drive u otro)</label>
          <input
            name="url"
            type="url"
            defaultValue={deliverable?.url ?? ""}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label>Fecha de entrega (opcional)</label>
          <input
            name="delivered_at"
            type="date"
            defaultValue={deliverable?.delivered_at ?? ""}
          />
        </div>
      </div>

      <div className="field">
        <label>Descripción</label>
        <textarea name="description" defaultValue={deliverable?.description ?? ""} />
      </div>

      <div className="field">
        <label>Resultado / feedback</label>
        <textarea name="result" defaultValue={deliverable?.result ?? ""} />
      </div>

      <label
        style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--muted)" }}
      >
        <input
          type="checkbox"
          name="visible_to_client"
          defaultChecked={deliverable ? deliverable.visible_to_client : true}
          style={{ width: "auto" }}
        />
        Visible para el cliente en su portal
      </label>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Entregable guardado</span>}

      <div className="form-actions">
        <button className="dbtn dbtn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
