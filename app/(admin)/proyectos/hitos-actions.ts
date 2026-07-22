"use server";

import { revalidatePath } from "next/cache";
import { chileLocalToISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteGoogleEvent,
  getConnectionStatus,
  pushPanelEventToGoogle,
} from "@/lib/google";
import { notifyEvent, type NotifType } from "@/lib/notify";

export type FormState = { error: string | null; ok?: boolean };

function hitoType(kind: string | null): NotifType {
  return kind === "reunion" ? "reunion" : "hito";
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

function parseHito(fd: FormData) {
  return {
    client_id: str(fd, "client_id"),
    project_id: opt(fd, "project_id"),
    title: str(fd, "title"),
    description: opt(fd, "description"),
    // hora de Chile del input datetime-local → instante UTC
    starts_at: chileLocalToISO(str(fd, "starts_at")),
    ends_at: chileLocalToISO(opt(fd, "ends_at")),
    kind: opt(fd, "kind"),
    visible_to_client: fd.get("visible_to_client") != null,
  };
}

/** Panel → Google, best-effort. Delega en la orquestación compartida de
 *  lib/google (la misma que usa la creación de eventos desde el calendario). */
async function pushToGoogle(
  supabase: SupabaseClient,
  eventId: string,
  clientId: string,
  h: ReturnType<typeof parseHito>,
  existingGoogleId: string | null,
) {
  // Sin fecha válida no hay nada que empujar (los llamadores ya lo validan;
  // esto además estrecha el tipo, que ahora admite null si el input vino mal).
  if (!h.starts_at) return;
  await pushPanelEventToGoogle(
    supabase,
    eventId,
    clientId,
    { title: h.title, description: h.description, starts_at: h.starts_at, ends_at: h.ends_at },
    existingGoogleId,
  );
}

function revalidate(projectId: string | null) {
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/gantt");
}

export async function crearHito(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const h = parseHito(fd);
  if (!h.client_id) return { error: "Falta el cliente." };
  if (!h.title) return { error: "El título del hito es obligatorio." };
  if (!h.starts_at) return { error: "La fecha y hora del hito son obligatorias." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ ...h, source: "panel" })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear el hito: " + error.message };

  await pushToGoogle(supabase, data.id, h.client_id, h, null);
  await notifyEvent({
    type: hitoType(h.kind),
    clientId: h.client_id,
    title: h.title,
    detail: h.description ?? h.title,
    panelPath: h.project_id ? `/proyectos/${h.project_id}` : "/gantt",
    portalPath: "/portal/avance",
  });
  revalidate(h.project_id);
  return { error: null, ok: true };
}

export async function actualizarHito(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const h = parseHito(fd);
  if (!id) return { error: "Falta el identificador del hito." };
  if (!h.title) return { error: "El título del hito es obligatorio." };
  if (!h.starts_at) return { error: "La fecha y hora del hito son obligatorias." };

  const supabase = await createClient();
  // Recuperar el google_event_id y la fecha actual (para detectar si se movió).
  const { data: existing } = await supabase
    .from("calendar_events")
    .select("google_event_id, starts_at")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("calendar_events")
    .update({
      title: h.title,
      description: h.description,
      starts_at: h.starts_at,
      ends_at: h.ends_at,
      kind: h.kind,
      visible_to_client: h.visible_to_client,
      project_id: h.project_id,
    })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el hito: " + error.message };

  await pushToGoogle(supabase, id, h.client_id, h, existing?.google_event_id ?? null);

  // Notificar solo si se MOVIÓ la fecha/hora.
  const moved =
    existing?.starts_at != null &&
    existing.starts_at.slice(0, 16) !== h.starts_at.slice(0, 16);
  if (moved) {
    await notifyEvent({
      type: hitoType(h.kind),
      clientId: h.client_id,
      title: h.title,
      detail: `Se movió la fecha: ${h.title}`,
      panelPath: h.project_id ? `/proyectos/${h.project_id}` : "/gantt",
      portalPath: "/portal/avance",
    });
  }

  revalidate(h.project_id);
  return { error: null, ok: true };
}

export async function eliminarHito(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const projectId = opt(fd, "project_id");
  if (!id) return;

  const supabase = await createClient();
  const { data: ev } = await supabase
    .from("calendar_events")
    .select("google_event_id, google_calendar_id")
    .eq("id", id)
    .maybeSingle();

  // Panel → Google: borrar también en Google si corresponde.
  if (ev?.google_event_id && ev?.google_calendar_id) {
    try {
      const status = await getConnectionStatus();
      if (status.connected) {
        await deleteGoogleEvent(ev.google_calendar_id, ev.google_event_id);
      }
    } catch (e) {
      console.error("Borrado de hito en Google falló:", e);
    }
  }

  await supabase.from("calendar_events").delete().eq("id", id);
  revalidate(projectId);
}
