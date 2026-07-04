"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteGoogleEvent,
  getConnectionStatus,
  pushEvent,
} from "@/lib/google";

export type FormState = { error: string | null; ok?: boolean };

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
    starts_at: str(fd, "starts_at"),
    ends_at: opt(fd, "ends_at"),
    kind: opt(fd, "kind"),
    visible_to_client: fd.get("visible_to_client") != null,
  };
}

async function clientCalendar(
  supabase: SupabaseClient,
  clientId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("clients")
    .select("google_calendar_id")
    .eq("id", clientId)
    .maybeSingle();
  return data?.google_calendar_id ?? null;
}

/** Panel → Google, best-effort: si está conectado y el cliente tiene
 *  calendario, crea/actualiza el evento y guarda su google_event_id. Un fallo
 *  aquí no rompe el guardado local (la sync posterior puede reconciliar). */
async function pushToGoogle(
  supabase: SupabaseClient,
  eventId: string,
  clientId: string,
  h: ReturnType<typeof parseHito>,
  existingGoogleId: string | null,
) {
  try {
    const status = await getConnectionStatus();
    if (!status.connected) return;
    const cal = await clientCalendar(supabase, clientId);
    if (!cal) return;
    const gid = await pushEvent({
      google_event_id: existingGoogleId,
      title: h.title,
      description: h.description,
      starts_at: h.starts_at,
      ends_at: h.ends_at,
      calendarId: cal,
    });
    await supabase
      .from("calendar_events")
      .update({
        google_event_id: gid,
        google_calendar_id: cal,
        synced_at: new Date().toISOString(),
      })
      .eq("id", eventId);
  } catch (e) {
    console.error("Push de hito a Google falló:", e);
  }
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
  // Recuperar el google_event_id actual para actualizar (no duplicar) en Google.
  const { data: existing } = await supabase
    .from("calendar_events")
    .select("google_event_id")
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
