"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/clientes/ficha-actions";
import type { ClientDetails } from "@/lib/types";

const initial: FormState = { error: null };

export default function FichaForm({
  action,
  clientId,
  details,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  details: ClientDetails | null;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = (k: keyof ClientDetails) => (details?.[k] as string) ?? "";

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />

      <div className="form-row">
        <div className="field">
          <label>Razón social</label>
          <input name="razon_social" defaultValue={v("razon_social")} placeholder="Nocciola SpA" />
        </div>
        <div className="field">
          <label>RUT</label>
          <input name="rut" defaultValue={v("rut")} placeholder="76.543.210-K" />
        </div>
      </div>

      <div className="field">
        <label>Giro</label>
        <input name="giro" defaultValue={v("giro")} placeholder="Cafetería de especialidad" />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Dirección</label>
          <input name="direccion" defaultValue={v("direccion")} placeholder="Av. Siempre Viva 742" />
        </div>
        <div className="field">
          <label>Comuna</label>
          <input name="comuna" defaultValue={v("comuna")} />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Ciudad</label>
          <input name="ciudad" defaultValue={v("ciudad")} />
        </div>
        <div className="field">
          <label>Región</label>
          <input name="region" defaultValue={v("region")} />
        </div>
      </div>

      <div className="field">
        <label>Horarios de funcionamiento</label>
        <input name="horarios" defaultValue={v("horarios")} placeholder="Lun-Vie 9:00-18:00 · Sáb 10:00-14:00" />
      </div>

      <div className="field">
        <label>Notas</label>
        <textarea name="notas" defaultValue={v("notas")} />
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="badge-soft">Ficha guardada</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ficha"}
        </button>
      </div>
    </form>
  );
}
