"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "@/components/admin/SlideOver";
import {
  subirVersion,
  responderCliente,
  editarTextoEntregable,
  type FormState,
} from "@/app/(admin)/entregables/aprobacion-actions";

const initial: FormState = { error: null };

/**
 * UN SOLO GESTO: archivo + nota de qué cambió, y al confirmar crea la versión,
 * la envía al cliente y le avisa. La casilla de aviso viene marcada: olvidarla
 * era justo lo que dejaba al cliente esperando sin enterarse.
 */
export function SubirVersionForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(subirVersion, initial);
  useSlideOverAutoClose(state.ok);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label>Archivo de la versión nueva</label>
        <input type="file" name="file" required />
      </div>
      <div className="field">
        <label>Qué cambió</label>
        <textarea
          name="note"
          rows={3}
          placeholder="Acorté la intro y cambié el cierre, como pediste."
        />
        <span className="mut" style={{ fontSize: "12.5px" }}>
          El cliente lo ve junto a la versión, así entiende qué revisar.
        </span>
      </div>
      <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13.5px" }}>
        <input type="checkbox" name="avisar" defaultChecked />
        Avisar al cliente por correo
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary dbtn-sm" disabled={pending}>
          {pending ? "Subiendo…" : "Subir y enviar al cliente"}
        </button>
      </div>
    </form>
  );
}

/** El admin responde en la conversación, sin cambiar el estado. */
export function ResponderClienteForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(responderCliente, initial);
  useSlideOverAutoClose(state.ok);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label>Tu respuesta</label>
        <textarea name="mensaje" rows={3} placeholder="Gracias, lo ajustamos y te subimos una versión nueva hoy." required />
      </div>
      <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13.5px" }}>
        <input type="checkbox" name="avisar" defaultChecked />
        Avisar al cliente por correo
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary dbtn-sm" disabled={pending}>
          {pending ? "Enviando…" : "Responder"}
        </button>
      </div>
    </form>
  );
}

/** Editar título/descripción: queda como entrada del historial, sin tocar
 *  estado ni versión (el texto anterior sigue visible en su propia entrada). */
export function EditarTextoForm({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string | null;
}) {
  const [state, formAction, pending] = useActionState(editarTextoEntregable, initial);
  useSlideOverAutoClose(state.ok);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label>Título</label>
        <input name="title" defaultValue={title} required />
      </div>
      <div className="field">
        <label>Descripción</label>
        <textarea name="description" rows={3} defaultValue={description ?? ""} />
      </div>
      <span className="mut" style={{ fontSize: "12.5px" }}>
        El cambio queda registrado en el historial. No altera el estado ni crea una versión.
      </span>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary dbtn-sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
