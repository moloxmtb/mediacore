"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, canActOnClient } from "@/lib/auth";
import { ENTREGABLES_BUCKET } from "@/lib/storage";

/**
 * Flujo de aprobación de entregables (Fase 2, lado admin). Todo STAFF-only con
 * doble muro (lección Pieza 1 Fase 3): la RLS (staff_sees_project / _client / el
 * bucket) es el muro y ADEMÁS cada acción exige canActOnClient(client_id) — el
 * client_id se resuelve del proyecto del entregable BAJO RLS, nunca del input.
 *
 * Bloqueo de archivo (Fase 1): el gate de dos niveles se activa con
 * approval_status='borrador'. Por eso "reemplazar" deja el entregable en
 * 'borrador' → re-bloquea el archivo hasta el próximo "enviar". "En corrección"
 * se deriva (borrador + responded_at) en la UI; no es un estado guardado aparte.
 */

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}
function opt(fd: FormData, k: string) {
  const v = str(fd, k);
  return v === "" ? null : v;
}

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Resuelve (supabase, client_id, approval_status) del entregable bajo RLS +
 *  guard. Devuelve null si no existe/accesible o el staff no puede actuar. */
async function guardDeliverable(id: string): Promise<{ supabase: Supa; clientId: string; status: string } | null> {
  if (!id) return null;
  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return null;
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("deliverables")
    .select("approval_status, projects(client_id)")
    .eq("id", id)
    .maybeSingle();
  const clientId = (d?.projects as unknown as { client_id: string } | null)?.client_id;
  if (!d || !clientId) return null;
  if (!(await canActOnClient(clientId))) return null;
  return { supabase, clientId, status: d.approval_status as string };
}

const pathOf = (clientId: string, deliverableId: string) => `${clientId}/${deliverableId}`;

/** Crea un entregable en BORRADOR y sube su archivo (queda bloqueado al cliente). */
export async function crearBorrador(_p: FormState, fd: FormData): Promise<FormState> {
  const projectId = str(fd, "project_id");
  const title = str(fd, "title");
  const file = fd.get("file") as File | null;
  if (!projectId) return { error: "Elige el proyecto." };
  if (!title) return { error: "El título es obligatorio." };
  if (!file || file.size === 0) return { error: "Adjunta el archivo del entregable." };

  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return { error: "No autorizado." };
  const supabase = await createClient();
  const { data: proj } = await supabase.from("projects").select("client_id").eq("id", projectId).maybeSingle();
  const clientId = proj?.client_id as string | undefined;
  if (!clientId) return { error: "Proyecto no accesible." };
  if (!(await canActOnClient(clientId))) return { error: "No puedes crear entregables de ese cliente." };

  const { data: dv, error: insErr } = await supabase
    .from("deliverables")
    .insert({ project_id: projectId, title, description: opt(fd, "description"), approval_status: "borrador", visible_to_client: true, en_flujo_aprobacion: true })
    .select("id")
    .single();
  if (insErr || !dv) return { error: "No se pudo crear el entregable: " + (insErr?.message ?? "") };

  const path = pathOf(clientId, dv.id);
  const { error: upErr } = await supabase.storage.from(ENTREGABLES_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (upErr) {
    await supabase.from("deliverables").delete().eq("id", dv.id); // no dejar borrador huérfano sin archivo
    return { error: "No se pudo subir el archivo: " + upErr.message };
  }
  await supabase.from("deliverable_files").upsert(
    { deliverable_id: dv.id, client_id: clientId, path, file_name: file.name, file_mime: file.type || null, updated_at: new Date().toISOString() },
    { onConflict: "deliverable_id" },
  );

  revalidatePath("/entregables");
  return { error: null, ok: true };
}

/** Envía al cliente: borrador/en-corrección/respondido-negativo → enviado.
 *  Precondición: tiene archivo. Limpia la respuesta previa (ciclo fresco). */
export async function enviarAlCliente(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const g = await guardDeliverable(id);
  if (!g) return;
  if (!["borrador", "cambios_solicitados", "rechazado"].includes(g.status)) return; // ya enviado o aprobado
  const { count } = await g.supabase.from("deliverable_files").select("deliverable_id", { count: "exact", head: true }).eq("deliverable_id", id);
  if (!count) return; // no se envía un entregable sin archivo
  await g.supabase
    .from("deliverables")
    .update({ approval_status: "enviado", sent_at: new Date().toISOString(), client_comment: null, responded_by: null, responded_at: null })
    .eq("id", id);
  revalidatePath("/entregables");
  revalidatePath(`/entregables/${id}`);
}

/** Reemplaza el archivo (atómico: upsert a ruta estable; una subida fallida deja
 *  el anterior). Deja el entregable en 'borrador' → RE-BLOQUEA hasta el próximo
 *  "enviar" (gate de Fase 1). No toca la respuesta previa (para derivar "en
 *  corrección"); esa se limpia recién al reenviar. */
export async function reemplazarArchivo(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const file = fd.get("file") as File | null;
  const g = await guardDeliverable(id);
  if (!g) return;
  if (!file || file.size === 0) return; // archivo inválido → no tocar el anterior

  const path = pathOf(g.clientId, id);
  const { error: upErr } = await g.supabase.storage.from(ENTREGABLES_BUCKET).upload(path, file, {
    upsert: true, // reemplazo in-place; si falla, el objeto anterior queda intacto
    contentType: file.type || "application/octet-stream",
  });
  if (upErr) return; // subida falló → el anterior sigue

  await g.supabase.from("deliverable_files").upsert(
    { deliverable_id: id, client_id: g.clientId, path, file_name: file.name, file_mime: file.type || null, updated_at: new Date().toISOString() },
    { onConflict: "deliverable_id" },
  );
  // Re-bloqueo: vuelve a 'borrador' hasta que el staff reenvíe explícitamente.
  // NO marca en_flujo_aprobacion: reemplazar un archivo no "despierta" un legacy
  // (solo crearBorrador mete algo al flujo del cliente).
  await g.supabase.from("deliverables").update({ approval_status: "borrador" }).eq("id", id);
  revalidatePath("/entregables");
  revalidatePath(`/entregables/${id}`);
}
