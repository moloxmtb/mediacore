"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "@/components/admin/SlideOver";
import type { FormState } from "@/app/(admin)/acciones/actions";
import type { Action, Phase } from "@/lib/types";

const initial: FormState = { error: null };

const KINDS = [
  "reunion",
  "contenido",
  "rodaje",
  "reporte",
  "asesoria",
  "entrega",
  "planificacion",
];

export default function ActionForm({
  action,
  clientId,
  projectId,
  phases,
  actionRecord,
  submitLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  projectId: string;
  phases: Pick<Phase, "id" | "name">[];
  actionRecord?: Action;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useSlideOverAutoClose(state.ok);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="project_id" value={projectId} />
      {actionRecord && <input type="hidden" name="id" value={actionRecord.id} />}

      <div className="field">
        <label>Título</label>
        <input name="title" defaultValue={actionRecord?.title ?? ""} required />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Fecha</label>
          <input
            name="action_date"
            type="date"
            defaultValue={actionRecord?.action_date ?? ""}
            required
          />
        </div>
        <div className="field">
          <label>Fase</label>
          <select name="phase_id" defaultValue={actionRecord?.phase_id ?? ""}>
            <option value="">Sin fase específica</option>
            {phases.map((ph) => (
              <option key={ph.id} value={ph.id}>
                {ph.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Tipo</label>
        <select name="kind" defaultValue={actionRecord?.kind ?? "reunion"}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Descripción</label>
        <textarea name="description" defaultValue={actionRecord?.description ?? ""} />
      </div>

      <div className="field">
        <label>Resultado</label>
        <textarea name="result" defaultValue={actionRecord?.result ?? ""} />
      </div>

      <label
        style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--muted)" }}
      >
        <input
          type="checkbox"
          name="visible_to_client"
          defaultChecked={actionRecord ? actionRecord.visible_to_client : true}
          style={{ width: "auto" }}
        />
        Visible para el cliente en su portal
      </label>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Acción guardada</span>}

      <div className="form-actions">
        <button className="dbtn dbtn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
