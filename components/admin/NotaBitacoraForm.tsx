"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "@/components/admin/SlideOver";
import { crearAccion, type FormState } from "@/app/(admin)/acciones/actions";

const initial: FormState = { error: null };

/** Agrega una nota a mano a la bitácora. Escribe en `actions` (reusa la tabla, no
 *  hay storage nuevo). El toggle "visible al cliente" mapea el interna|cliente y,
 *  gracias al arreglo de crearAccion, una nota interna NO le avisa al cliente. */
export default function NotaBitacoraForm({
  clients,
  defaultDate,
}: {
  clients: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(crearAccion, initial);
  useSlideOverAutoClose(state.ok);

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <div className="form-row">
        <div className="field">
          <label>Empresa</label>
          <select name="client_id" required defaultValue={clients[0]?.id ?? ""}>
            {clients.length ? (
              clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
            ) : (
              <option value="">(sin clientes accesibles)</option>
            )}
          </select>
        </div>
        <div className="field">
          <label>Fecha</label>
          <input name="action_date" type="date" defaultValue={defaultDate} required />
        </div>
      </div>

      <div className="field">
        <label>Título</label>
        <input name="title" placeholder="Ej. Llamada de coordinación con el cliente" required />
      </div>

      <div className="field">
        <label>Detalle</label>
        <input name="description" placeholder="Contexto o resultado (opcional)" />
      </div>

      <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px" }}>
        <input type="checkbox" name="visible_to_client" defaultChecked />
        Visible para el cliente (si la desmarcas, la nota es interna y no le llega aviso)
      </label>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && !state.error && <span className="badge-soft">Nota agregada</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending || !clients.length}>
          {pending ? "Guardando…" : "Agregar nota"}
        </button>
      </div>
    </form>
  );
}
