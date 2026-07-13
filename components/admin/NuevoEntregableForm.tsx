"use client";

import { useActionState } from "react";
import { crearBorrador, type FormState } from "@/app/(admin)/entregables/aprobacion-actions";

const initial: FormState = { error: null };

/** Crea un entregable en BORRADOR con su archivo. El archivo queda bloqueado al
 *  cliente hasta que el staff lo envíe a revisión (ver detalle del entregable). */
export default function NuevoEntregableForm({
  projects,
}: {
  projects: { id: string; name: string; clientName: string }[];
}) {
  const [state, formAction, pending] = useActionState(crearBorrador, initial);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <div className="form-row">
        <div className="field">
          <label>Proyecto</label>
          <select name="project_id" required defaultValue={projects[0]?.id ?? ""}>
            {projects.length ? (
              projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.clientName}</option>)
            ) : (
              <option value="">(sin proyectos accesibles)</option>
            )}
          </select>
        </div>
        <div className="field">
          <label>Título</label>
          <input name="title" placeholder="Ej. Manual de marca" required />
        </div>
      </div>
      <div className="field">
        <label>Descripción / tipo (opcional)</label>
        <input name="description" placeholder="Detalle breve" />
      </div>
      <div className="field">
        <label>Archivo</label>
        <input type="file" name="file" required />
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && !state.error && <span className="badge-soft">Borrador creado (archivo bloqueado al cliente)</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending || !projects.length}>
          {pending ? "Creando…" : "Crear borrador"}
        </button>
      </div>
    </form>
  );
}
