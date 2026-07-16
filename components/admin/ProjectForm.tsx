"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/proyectos/actions";
import type { Project, ProjectStatus } from "@/lib/types";
import { PROJECT_STATUS_LABELS } from "@/lib/format";

const initial: FormState = { error: null };

export default function ProjectForm({
  action,
  clients,
  project,
  defaultClientId,
  submitLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  clients: { id: string; name: string }[];
  project?: Project;
  defaultClientId?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const selectedClient = project?.client_id ?? defaultClientId ?? "";

  return (
    <form action={formAction} className="form">
      {project && <input type="hidden" name="id" value={project.id} />}

      <div className="field">
        <label>Nombre del proyecto</label>
        <input name="name" defaultValue={project?.name ?? ""} required autoFocus />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Cliente</label>
          <select name="client_id" defaultValue={selectedClient} required>
            <option value="" disabled>
              Elige un cliente…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Estado</label>
          <select
            name="status"
            defaultValue={project?.status ?? ("activo" as ProjectStatus)}
          >
            {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Inicio (opcional)</label>
          <input
            name="start_date"
            type="date"
            defaultValue={project?.start_date ?? ""}
          />
        </div>
        <div className="field">
          <label>Término (opcional)</label>
          <input
            name="end_date"
            type="date"
            defaultValue={project?.end_date ?? ""}
          />
        </div>
      </div>

      <div className="field">
        <label>Descripción</label>
        <textarea name="description" defaultValue={project?.description ?? ""} />
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Cambios guardados</span>}

      <div className="form-actions">
        <button className="dbtn dbtn-primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
