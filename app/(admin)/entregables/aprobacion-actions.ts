"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, canActOnClient } from "@/lib/auth";
import { ENTREGABLES_BUCKET } from "@/lib/storage";
import { notifyDeliverableToClient } from "@/lib/notify";

/**
 * Flujo de aprobación de entregables (v2: versiones + conversación).
 *
 * TODO STAFF-only con doble muro: la RLS es el muro y ADEMÁS cada acción exige
 * canActOnClient(client_id), resuelto del proyecto BAJO RLS, nunca del input.
 *
 * NADA SE SOBRESCRIBE:
 *  · cada versión sube a su PROPIA ruta `<client>/<entregable>/<version>` —
 *    nunca un upsert sobre ruta estable, así el archivo anterior sigue vivo y
 *    descargable;
 *  · los textos y comentarios son filas nuevas en deliverable_reviews.
 *
 * El historial (deliverable_reviews) es la FUENTE. Los campos client_comment /
 * responded_* quedan como caché de la última respuesta (los lee el motor de
 * correo) y ya NO se limpian al reenviar.
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

/** Resuelve (supabase, client_id, estado) del entregable bajo RLS + guard. */
async function guardDeliverable(
  id: string,
): Promise<{ supabase: Supa; clientId: string; status: string; userId: string } | null> {
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
  return { supabase, clientId, status: d.approval_status as string, userId: session.userId };
}

/** Ruta PROPIA de cada versión. Nunca se reutiliza entre versiones. */
const versionPath = (clientId: string, deliverableId: string, versionId: string) =>
  `${clientId}/${deliverableId}/${versionId}`;

/**
 * Crea una versión: sube el archivo a su ruta propia, inserta la fila, mueve el
 * puntero y deja la entrada 'version' en el historial. Devuelve el número de
 * versión, o null si algo falló (sin dejar basura a medias).
 */
async function crearVersion(
  supabase: Supa,
  clientId: string,
  deliverableId: string,
  file: File,
  note: string | null,
  userId: string,
): Promise<{ versionId: string; versionNumber: number } | null> {
  const { data: last } = await supabase
    .from("deliverable_versions")
    .select("version_number")
    .eq("deliverable_id", deliverableId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNumber = ((last?.version_number as number | undefined) ?? 0) + 1;

  // El id se genera acá para poder nombrar la ruta ANTES de insertar la fila.
  const versionId = randomUUID();
  const path = versionPath(clientId, deliverableId, versionId);

  const { error: upErr } = await supabase.storage.from(ENTREGABLES_BUCKET).upload(path, file, {
    upsert: false, // ruta nueva por versión: nunca debería existir
    contentType: file.type || "application/octet-stream",
  });
  if (upErr) return null;

  const { error: insErr } = await supabase.from("deliverable_versions").insert({
    id: versionId,
    deliverable_id: deliverableId,
    client_id: clientId,
    version_number: versionNumber,
    file_path: path,
    file_name: file.name,
    file_mime: file.type || null,
    note,
    created_by: userId,
  });
  if (insErr) {
    await supabase.storage.from(ENTREGABLES_BUCKET).remove([path]); // no dejar objeto huérfano
    return null;
  }

  await supabase.from("deliverables").update({ current_version_id: versionId }).eq("id", deliverableId);
  await supabase.from("deliverable_reviews").insert({
    deliverable_id: deliverableId,
    client_id: clientId,
    version_id: versionId,
    actor: "admin",
    kind: "version",
    body: note,
    created_by: userId,
  });
  return { versionId, versionNumber };
}

/** Crea un entregable en BORRADOR con su versión 1 (bloqueada al cliente). */
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
    .insert({
      project_id: projectId,
      title,
      description: opt(fd, "description"),
      approval_status: "borrador",
      visible_to_client: true,
      en_flujo_aprobacion: true,
    })
    .select("id")
    .single();
  if (insErr || !dv) return { error: "No se pudo crear el entregable: " + (insErr?.message ?? "") };

  const v = await crearVersion(supabase, clientId, dv.id, file, "Versión inicial", session.userId);
  if (!v) {
    await supabase.from("deliverables").delete().eq("id", dv.id); // no dejar borrador sin archivo
    return { error: "No se pudo subir el archivo. Reintenta." };
  }

  revalidatePath("/entregables");
  return { error: null, ok: true };
}

/**
 * UN SOLO GESTO: sube una versión nueva, la envía al cliente y le avisa.
 * Antes esto eran 4 pasos en 2 pantallas (reemplazar → editar texto → enviar →
 * campanita) y olvidar uno dejaba al cliente esperando.
 */
export async function subirVersion(_p: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const file = fd.get("file") as File | null;
  const note = opt(fd, "note");
  const avisar = fd.get("avisar") != null; // casilla marcada por defecto en la UI

  const g = await guardDeliverable(id);
  if (!g) return { error: "No autorizado." };
  if (!file || file.size === 0) return { error: "Adjunta el archivo de la versión nueva." };
  if (g.status === "aprobado") return { error: "El entregable ya está aprobado; no admite versiones nuevas." };

  const v = await crearVersion(g.supabase, g.clientId, id, file, note, g.userId);
  if (!v) return { error: "No se pudo subir el archivo. El anterior sigue intacto." };

  // Archivo nuevo = vuelve a "por revisar": el cliente aprueba lo que ve.
  await g.supabase
    .from("deliverables")
    .update({ approval_status: "enviado", sent_at: new Date().toISOString() })
    .eq("id", id);

  if (avisar) {
    await notifyDeliverableToClient({ deliverableId: id, kind: "version", message: note }).catch(() => {});
  }

  revalidatePath("/entregables");
  revalidatePath(`/entregables/${id}`);
  return { error: null, ok: true };
}

/** El admin responde en la conversación (sin decidir nada). Avisa al cliente. */
export async function responderCliente(_p: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const mensaje = str(fd, "mensaje");
  const avisar = fd.get("avisar") != null;
  if (!mensaje) return { error: "Escribe un mensaje." };

  const g = await guardDeliverable(id);
  if (!g) return { error: "No autorizado." };

  const { error } = await g.supabase.from("deliverable_reviews").insert({
    deliverable_id: id,
    client_id: g.clientId,
    actor: "admin",
    kind: "comentario",
    body: mensaje,
    created_by: g.userId,
  });
  if (error) return { error: "No se pudo enviar el mensaje." };

  if (avisar) {
    await notifyDeliverableToClient({ deliverableId: id, kind: "comentario", message: mensaje }).catch(() => {});
  }

  revalidatePath(`/entregables/${id}`);
  return { error: null, ok: true };
}

/**
 * Edita título/descripción. NO cambia estado ni versión: deja una entrada
 * 'texto' con el texto nuevo, así el anterior queda visible en su propia
 * entrada, con fecha.
 */
export async function editarTextoEntregable(_p: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const title = str(fd, "title");
  const description = opt(fd, "description");
  if (!title) return { error: "El título es obligatorio." };

  const g = await guardDeliverable(id);
  if (!g) return { error: "No autorizado." };

  await g.supabase.from("deliverables").update({ title, description }).eq("id", id);
  await g.supabase.from("deliverable_reviews").insert({
    deliverable_id: id,
    client_id: g.clientId,
    actor: "admin",
    kind: "texto",
    body: description ? `${title}\n\n${description}` : title,
    created_by: g.userId,
  });

  revalidatePath("/entregables");
  revalidatePath(`/entregables/${id}`);
  return { error: null, ok: true };
}

/**
 * Envía al cliente un entregable que ya tiene versión (típicamente el borrador
 * recién creado). YA NO borra la respuesta previa: el historial manda.
 */
export async function enviarAlCliente(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const g = await guardDeliverable(id);
  if (!g) return;
  if (!["borrador", "cambios_solicitados", "rechazado"].includes(g.status)) return;

  const { count } = await g.supabase
    .from("deliverable_versions")
    .select("id", { count: "exact", head: true })
    .eq("deliverable_id", id);
  if (!count) return; // no se envía un entregable sin versión

  await g.supabase
    .from("deliverables")
    .update({ approval_status: "enviado", sent_at: new Date().toISOString() })
    .eq("id", id);

  await notifyDeliverableToClient({ deliverableId: id, kind: "version" }).catch(() => {});

  revalidatePath("/entregables");
  revalidatePath(`/entregables/${id}`);
}
