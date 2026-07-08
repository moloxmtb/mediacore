"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, canSeeContent } from "@/lib/auth";

/**
 * El cliente marca una tarea de su empresa como hecha (pendiente → hecha).
 * Company-scoped: cualquier owner/content de la empresa puede hacerlo, no solo
 * el responsable (el responsable es informativo). La RLS de tasks es el muro
 * real: el UPDATE del portal solo pasa para tipo='cliente' de su empresa y con
 * estado <> 'confirmada' (with check), así que confirmar/reabrir son imposibles
 * desde aquí aunque se intentaran. El guard de sesión es defensa en profundidad.
 */
export async function marcarHechaPortal(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;

  const session = await getSessionProfile();
  if (!session || session.role !== "client" || !canSeeContent(session.clientRole)) return;
  if (!session.clientId) return;

  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ estado: "hecha", updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/portal/tareas");
}
