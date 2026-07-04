"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DeliverableStatus } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };

const STATUSES: DeliverableStatus[] = ["en_proceso", "entregado", "aprobado"];

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

function parseDeliverable(fd: FormData) {
  return {
    project_id: str(fd, "project_id"),
    phase_id: opt(fd, "phase_id"),
    title: str(fd, "title"),
    description: opt(fd, "description"),
    url: opt(fd, "url"),
    status: (str(fd, "status") || "en_proceso") as DeliverableStatus,
    result: opt(fd, "result"),
    delivered_at: opt(fd, "delivered_at"),
    visible_to_client: fd.get("visible_to_client") != null,
  };
}

export async function crearEntregable(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const d = parseDeliverable(fd);
  if (!d.project_id) return { error: "Falta el proyecto." };
  if (!d.title) return { error: "El título del entregable es obligatorio." };
  if (!STATUSES.includes(d.status)) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").insert(d);
  if (error) return { error: "No se pudo crear el entregable: " + error.message };

  revalidatePath(`/proyectos/${d.project_id}`);
  revalidatePath("/entregables");
  revalidatePath("/gantt");
  return { error: null, ok: true };
}

export async function actualizarEntregable(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const d = parseDeliverable(fd);
  if (!id) return { error: "Falta el identificador del entregable." };
  if (!d.title) return { error: "El título del entregable es obligatorio." };
  if (!STATUSES.includes(d.status)) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").update(d).eq("id", id);
  if (error)
    return { error: "No se pudo actualizar el entregable: " + error.message };

  revalidatePath(`/proyectos/${d.project_id}`);
  revalidatePath("/entregables");
  revalidatePath("/gantt");
  return { error: null, ok: true };
}

export async function eliminarEntregable(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const projectId = str(fd, "project_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("deliverables").delete().eq("id", id);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/entregables");
  revalidatePath("/gantt");
}
