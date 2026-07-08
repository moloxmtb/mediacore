"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import type { TaskType } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}
function opt(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return v === "" ? null : v;
}

const TIPOS: TaskType[] = ["interna", "cliente"];

/** Crea una tarea. La RLS de INSERT (staff_sees_client) garantiza que el creador
 *  solo cree tareas para sus clientes. La coherencia responsable↔tipo se valida
 *  acá (la UI no es el muro): interna → responsable role='admin'; cliente →
 *  responsable role='client' Y su client_id = el de la tarea. Responsable nullable. */
export async function crearTarea(_p: FormState, fd: FormData): Promise<FormState> {
  const clientId = str(fd, "client_id");
  const tipo = str(fd, "tipo") as TaskType;
  const titulo = str(fd, "titulo");
  const responsableId = opt(fd, "responsable_id");

  if (!clientId) return { error: "Falta la empresa." };
  if (!TIPOS.includes(tipo)) return { error: "Tipo inválido." };
  if (!titulo) return { error: "El título es obligatorio." };

  // Validación responsable↔tipo (perfil leído por service_role: el ejecutivo no
  // puede leer otros perfiles por RLS).
  if (responsableId) {
    const admin = createAdminClient();
    const { data: prof } = await admin
      .from("profiles")
      .select("role, client_id")
      .eq("id", responsableId)
      .maybeSingle();
    if (!prof) return { error: "El responsable no existe." };
    if (tipo === "interna" && prof.role !== "admin") {
      return { error: "Una tarea interna debe tener un responsable del equipo." };
    }
    if (tipo === "cliente" && (prof.role !== "client" || prof.client_id !== clientId)) {
      return { error: "El responsable debe ser un usuario de portal de esa empresa." };
    }
  }

  const session = await getSessionProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    client_id: clientId,
    tipo,
    titulo,
    descripcion: opt(fd, "descripcion"),
    responsable_id: responsableId,
    plazo: opt(fd, "plazo"),
    estado: "pendiente",
    created_by: session?.userId ?? null,
  });
  if (error) return { error: "No se pudo crear la tarea: " + error.message };

  revalidatePath("/tareas");
  return { error: null, ok: true };
}

/** Cambia el estado de una tarea (updated_at seteado a mano — no hay trigger).
 *  La RLS de UPDATE limita: staff sobre sus clientes. */
async function setEstado(taskId: string, estado: "pendiente" | "hecha" | "confirmada") {
  if (!taskId) return;
  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  revalidatePath("/tareas");
}

/** pendiente → hecha. Cualquier staff con acceso al cliente (el responsable es
 *  informativo, consistente con "completar por empresa"). */
export async function marcarHecha(fd: FormData): Promise<void> {
  await setEstado(str(fd, "id"), "hecha");
}

/** hecha → confirmada. Solo staff (la RLS de UPDATE ya lo limita a
 *  staff_sees_client; el portal no puede poner 'confirmada'). */
export async function confirmarTarea(fd: FormData): Promise<void> {
  await setEstado(str(fd, "id"), "confirmada");
}

/** confirmada|hecha → pendiente. Solo staff. */
export async function reabrirTarea(fd: FormData): Promise<void> {
  await setEstado(str(fd, "id"), "pendiente");
}
