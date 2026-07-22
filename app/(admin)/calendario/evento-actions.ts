"use server";

import { revalidatePath } from "next/cache";
import { chileLocalToISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { pushPanelEventToGoogle } from "@/lib/google";
import { notifyEvent, type NotifType } from "@/lib/notify";

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}
function opt(fd: FormData, k: string) {
  const v = str(fd, k);
  return v === "" ? null : v;
}
function notifType(kind: string | null): NotifType {
  return kind === "reunion" ? "reunion" : "hito";
}

const KINDS = ["reunion", "rodaje", "otro"];

/**
 * Crea una reunión o evento suelto desde el calendario del admin y lo sincroniza
 * con el Google Calendar del cliente (misma maquinaria que la creación de hitos:
 * pushPanelEventToGoogle). Solo reuniones/eventos: hitos y entregas se siguen
 * creando en la ficha del proyecto.
 */
export async function crearEventoCalendario(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const client_id = str(fd, "client_id");
  const kindRaw = str(fd, "kind");
  const kind = KINDS.includes(kindRaw) ? kindRaw : "otro";
  const title = str(fd, "title");
  const description = opt(fd, "description");
  // El input datetime-local entrega hora de Chile SIN zona: se convierte
  // al instante UTC correcto antes de guardar en timestamptz.
  const starts_at = chileLocalToISO(str(fd, "starts_at"));
  const ends_at = chileLocalToISO(opt(fd, "ends_at"));
  const visible_to_client = fd.get("visible_to_client") != null;

  if (!client_id) return { error: "Elige el cliente." };
  if (!title) return { error: "El título es obligatorio." };
  if (!starts_at) return { error: "La fecha y hora son obligatorias." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ client_id, title, description, starts_at, ends_at, kind, visible_to_client, source: "panel" })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear el evento: " + error.message };

  await pushPanelEventToGoogle(supabase, data.id, client_id, { title, description, starts_at, ends_at }, null);
  await notifyEvent({
    type: notifType(kind),
    clientId: client_id,
    title,
    detail: description ?? title,
    panelPath: "/calendario",
    portalPath: "/portal/calendario",
  });

  revalidatePath("/calendario");
  revalidatePath("/gantt");
  return { error: null, ok: true };
}

/**
 * Agenda una solicitud de reunión pendiente convirtiéndola en un evento real
 * (reunión, visible al cliente) sincronizado con Google, en la fecha/hora
 * elegida por el admin. Luego marca la solicitud como agendada. Solo admin (RLS).
 */
export async function agendarYCrearEvento(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const client_id = str(fd, "client_id");
  const starts_at = chileLocalToISO(str(fd, "starts_at"));
  const title = str(fd, "title") || "Reunión con Color Media";
  if (!id || !client_id || !starts_at) return;

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("meeting_requests")
    .select("reason, status")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.status !== "pendiente") return; // ya gestionada

  const { data: ev } = await supabase
    .from("calendar_events")
    .insert({
      client_id,
      title,
      description: req.reason,
      starts_at,
      kind: "reunion",
      visible_to_client: true,
      source: "panel",
    })
    .select("id")
    .single();

  if (ev) {
    await pushPanelEventToGoogle(supabase, ev.id, client_id, { title, description: req.reason, starts_at, ends_at: null }, null);
    await notifyEvent({
      type: "reunion",
      clientId: client_id,
      title,
      detail: req.reason,
      panelPath: "/calendario",
      portalPath: "/portal/calendario",
    });
  }

  await supabase
    .from("meeting_requests")
    .update({ status: "agendada", admin_note: str(fd, "admin_note") || null, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  revalidatePath(`/clientes/${client_id}`);
}
