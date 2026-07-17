"use client";

import { useActionState } from "react";
import { useSlideOverAutoClose } from "./SlideOver";
import type { FormState } from "@/app/(admin)/clientes/contexto-actions";
import type { ClientPlanItem } from "@/lib/types";

const initial: FormState = { error: null };

export default function PlanItemForm({
  action,
  clientId,
  item,
  submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  clientId: string;
  item?: ClientPlanItem;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useSlideOverAutoClose(state.ok);
  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="client_id" value={clientId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="form-row">
        <div className="field">
          <label>Ítem del plan</label>
          <input name="name" defaultValue={item?.name ?? ""} required placeholder="Plan de contenidos" />
        </div>
        <div className="field">
          <label>Estado</label>
          <select name="status" defaultValue={item?.status ?? "pendiente"}>
            <option value="activo">Activo (se trabaja ahora)</option>
            <option value="pendiente">Pendiente (viene)</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Descripción</label>
        <textarea name="description" defaultValue={item?.description ?? ""} placeholder="Qué incluye este ítem" />
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <span className="dchip" style={{ ["--st" as string]: "var(--st-ok)" }}>Ítem guardado</span>}
      <div className="form-actions">
        <button className="dbtn dbtn-primary dbtn-sm" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
