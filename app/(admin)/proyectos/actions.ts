"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };

const STATUSES: ProjectStatus[] = ["activo", "pausado", "cerrado"];

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

function parseProject(fd: FormData) {
  return {
    name: str(fd, "name"),
    client_id: str(fd, "client_id"),
    description: opt(fd, "description"),
    status: (str(fd, "status") || "activo") as ProjectStatus,
    start_date: opt(fd, "start_date"),
    end_date: opt(fd, "end_date"),
  };
}

export async function crearProyecto(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const p = parseProject(fd);
  if (!p.client_id) return { error: "Debes elegir un cliente." };
  if (!p.name) return { error: "El nombre del proyecto es obligatorio." };
  if (!STATUSES.includes(p.status)) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert(p)
    .select("id")
    .single();

  if (error) return { error: "No se pudo crear el proyecto: " + error.message };

  revalidatePath("/proyectos");
  revalidatePath(`/clientes/${p.client_id}`);
  revalidatePath("/dashboard");
  redirect(`/proyectos/${data.id}`);
}

export async function actualizarProyecto(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const p = parseProject(fd);
  if (!id) return { error: "Falta el identificador del proyecto." };
  if (!p.client_id) return { error: "Debes elegir un cliente." };
  if (!p.name) return { error: "El nombre del proyecto es obligatorio." };
  if (!STATUSES.includes(p.status)) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(p).eq("id", id);

  if (error) return { error: "No se pudo actualizar el proyecto: " + error.message };

  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${id}`);
  revalidatePath(`/clientes/${p.client_id}`);
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

export async function eliminarProyecto(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("projects").delete().eq("id", id);
  revalidatePath("/proyectos");
  revalidatePath("/dashboard");
  redirect("/proyectos");
}
