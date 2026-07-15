"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "@/components/admin/SlideOver";
import type { FormState } from "@/app/(admin)/proyectos/actions";
import type { Phase } from "@/lib/types";

const initial: FormState = { error: null };

export default function PhaseForm({
  action,
  projectId,
  phase,
  submitLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  projectId: string;
  phase?: Phase;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useSlideOverAutoClose(state.ok);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="project_id" value={projectId} />
      {phase && <input type="hidden" name="id" value={phase.id} />}

      <div className="field">
        <label>Nombre de la fase</label>
        <input name="name" defaultValue={phase?.name ?? ""} required />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Inicio</label>
          <input
            name="start_date"
            type="date"
            defaultValue={phase?.start_date ?? ""}
            required
          />
        </div>
        <div className="field">
          <label>Término</label>
          <input
            name="end_date"
            type="date"
            defaultValue={phase?.end_date ?? ""}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Avance: {phase?.progress ?? 0}%</label>
          <input
            name="progress"
            type="number"
            min={0}
            max={100}
            step={5}
            defaultValue={phase?.progress ?? 0}
          />
          <span className="hint">0 = sin empezar · 100 = completada.</span>
        </div>
        <div className="field">
          <label>Orden</label>
          <input
            name="sort_order"
            type="number"
            defaultValue={phase?.sort_order ?? 0}
          />
          <span className="hint">Orden de las barras en la Gantt (menor arriba).</span>
        </div>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Fase guardada</span>}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
