"use client";

import { useActionState, useState } from "react";
import { crearTarea, type FormState } from "@/app/(admin)/tareas/actions";
import type { TaskType } from "@/lib/types";

type Person = { id: string; name: string };
const initial: FormState = { error: null };

/** Crea una tarea. El menú de responsable está CONDICIONADO por empresa+tipo:
 *  interna → miembros internos; cliente → usuarios de portal de la empresa
 *  elegida. Al cambiar empresa o tipo, el responsable se resetea a "sin asignar". */
export default function TareaForm({
  clients,
  internalMembers,
  portalByClient,
}: {
  clients: { id: string; name: string }[];
  internalMembers: Person[];
  portalByClient: Record<string, Person[]>;
}) {
  const [state, formAction, pending] = useActionState(crearTarea, initial);
  const [empresa, setEmpresa] = useState(clients[0]?.id ?? "");
  const [tipo, setTipo] = useState<TaskType>("interna");
  const [responsable, setResponsable] = useState("");

  const responsables: Person[] = tipo === "interna" ? internalMembers : portalByClient[empresa] ?? [];

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <div className="form-row">
        <div className="field">
          <label>Empresa</label>
          <select
            name="client_id"
            value={empresa}
            onChange={(e) => { setEmpresa(e.target.value); setResponsable(""); }}
            required
          >
            {clients.length ? (
              clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
            ) : (
              <option value="">(sin clientes accesibles)</option>
            )}
          </select>
        </div>
        <div className="field">
          <label>Tipo</label>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => { setTipo(e.target.value as TaskType); setResponsable(""); }}
          >
            <option value="interna">Interna</option>
            <option value="cliente">Del cliente</option>
          </select>
        </div>
        <div className="field">
          <label>Responsable</label>
          <select name="responsable_id" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
            <option value="">Sin asignar</option>
            {responsables.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {tipo === "cliente" && responsables.length === 0 && (
            <span className="hint">Esta empresa aún no tiene usuarios de portal.</span>
          )}
        </div>
      </div>

      <div className="field">
        <label>Título</label>
        <input name="titulo" placeholder="Ej. Enviar propuesta de contenido" required />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Descripción</label>
          <input name="descripcion" placeholder="Detalle (opcional)" />
        </div>
        <div className="field">
          <label>Plazo</label>
          <input name="plazo" type="date" />
        </div>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && !state.error && <span className="badge-soft">Tarea creada</span>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending || !clients.length}>
          {pending ? "Creando…" : "Crear tarea"}
        </button>
      </div>
    </form>
  );
}
