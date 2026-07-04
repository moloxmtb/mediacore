"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

function parseAction(fd: FormData) {
  return {
    client_id: str(fd, "client_id"),
    project_id: opt(fd, "project_id"),
    phase_id: opt(fd, "phase_id"),
    action_date: str(fd, "action_date"),
    title: str(fd, "title"),
    description: opt(fd, "description"),
    result: opt(fd, "result"),
    kind: opt(fd, "kind"),
    visible_to_client: fd.get("visible_to_client") != null,
  };
}

export async function crearAccion(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const a = parseAction(fd);
  if (!a.client_id) return { error: "Falta el cliente." };
  if (!a.title) return { error: "El título de la acción es obligatorio." };
  if (!a.action_date) return { error: "La fecha de la acción es obligatoria." };

  const supabase = await createClient();
  const { error } = await supabase.from("actions").insert(a);
  if (error) return { error: "No se pudo registrar la acción: " + error.message };

  if (a.project_id) revalidatePath(`/proyectos/${a.project_id}`);
  revalidatePath("/acciones");
  revalidatePath("/gantt");
  return { error: null, ok: true };
}

export async function actualizarAccion(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const a = parseAction(fd);
  if (!id) return { error: "Falta el identificador de la acción." };
  if (!a.title) return { error: "El título de la acción es obligatorio." };
  if (!a.action_date) return { error: "La fecha de la acción es obligatoria." };

  const supabase = await createClient();
  const { error } = await supabase.from("actions").update(a).eq("id", id);
  if (error)
    return { error: "No se pudo actualizar la acción: " + error.message };

  if (a.project_id) revalidatePath(`/proyectos/${a.project_id}`);
  revalidatePath("/acciones");
  revalidatePath("/gantt");
  return { error: null, ok: true };
}

export async function eliminarAccion(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const projectId = str(fd, "project_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("actions").delete().eq("id", id);
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/acciones");
  revalidatePath("/gantt");
}
