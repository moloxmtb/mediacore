"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, canActOnClient } from "@/lib/auth";
import { MINUTAS_BUCKET } from "@/lib/storage";

/**
 * Acciones de la reunión como objeto (Pieza 3, Fase B). La reunión durable es el
 * calendar_event; acá cuelga su minuta 1:1 + pendientes. Todo es STAFF-only.
 *
 * Blindaje en dos capas (lección Pieza 1 Fase 3): la RLS de meeting_minutes/
 * items y del bucket 'minutas' es el muro, y ADEMÁS cada acción exige
 * canActOnClient(client_id) ANTES de tocar la base o Storage. El client_id se
 * resuelve SIEMPRE desde la BD bajo RLS (del evento o del ítem), nunca del input.
 */

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

type EventCtx = { supabase: Awaited<ReturnType<typeof createClient>>; eventId: string; clientId: string; userId: string };

/** Resuelve el evento (reunión) bajo RLS y aplica el guard explícito. */
async function guardEvent(fd: FormData): Promise<EventCtx | null> {
  const eventId = str(fd, "event_id");
  if (!eventId) return null;
  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return null;
  const supabase = await createClient();
  const { data: ev } = await supabase
    .from("calendar_events")
    .select("client_id, kind")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev || ev.kind !== "reunion") return null; // solo reuniones
  if (!(await canActOnClient(ev.client_id as string))) return null; // guard explícito
  return { supabase, eventId, clientId: ev.client_id as string, userId: session.userId };
}

/** Guard para acciones sobre un ítem: resuelve su client_id desde la BD. */
async function guardItem(fd: FormData): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; itemId: string; eventId: string } | null> {
  const itemId = str(fd, "item_id");
  const eventId = str(fd, "event_id");
  if (!itemId) return null;
  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return null;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("meeting_minute_items")
    .select("client_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return null;
  if (!(await canActOnClient(item.client_id as string))) return null; // guard explícito
  return { supabase, itemId, eventId };
}

/** Crea la fila de minuta si aún no existe (la reunión no tiene minuta hasta
 *  que se documenta). No pisa created_by de una fila previa. */
async function ensureMinute(ctx: EventCtx) {
  const { data: existing } = await ctx.supabase
    .from("meeting_minutes")
    .select("id, realizada, minuta_path")
    .eq("event_id", ctx.eventId)
    .maybeSingle();
  if (existing) return existing;
  const { data } = await ctx.supabase
    .from("meeting_minutes")
    .insert({ event_id: ctx.eventId, client_id: ctx.clientId, created_by: ctx.userId })
    .select("id, realizada, minuta_path")
    .single();
  return data;
}

function revalidate(eventId: string) {
  revalidatePath(`/calendario/${eventId}`);
  revalidatePath("/calendario");
}

// ---------- Realizada (reversible) ----------
export async function marcarRealizada(fd: FormData): Promise<void> {
  const ctx = await guardEvent(fd);
  if (!ctx) return;
  const m = await ensureMinute(ctx);
  if (!m) return;
  await ctx.supabase.from("meeting_minutes").update({ realizada: true, updated_at: new Date().toISOString() }).eq("id", m.id);
  revalidate(ctx.eventId);
}

export async function desmarcarRealizada(fd: FormData): Promise<void> {
  const ctx = await guardEvent(fd);
  if (!ctx) return;
  await ctx.supabase
    .from("meeting_minutes")
    .update({ realizada: false, updated_at: new Date().toISOString() })
    .eq("event_id", ctx.eventId);
  revalidate(ctx.eventId);
}

// ---------- Minuta PDF (reversible) ----------
export async function subirMinutaPdf(fd: FormData): Promise<void> {
  const ctx = await guardEvent(fd); // guard ANTES de tocar Storage
  if (!ctx) return;
  const file = fd.get("pdf") as File | null;
  if (!file || file.size === 0 || file.type !== "application/pdf") return; // solo PDF
  const m = await ensureMinute(ctx);
  if (!m) return;

  const path = `${ctx.clientId}/${ctx.eventId}.pdf`;
  const { error: upErr } = await ctx.supabase.storage
    .from(MINUTAS_BUCKET)
    .upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (upErr) return;

  // Subir minuta marca realizada implícitamente (no obligar a dos pasos).
  await ctx.supabase
    .from("meeting_minutes")
    .update({ minuta_path: path, realizada: true, updated_at: new Date().toISOString() })
    .eq("id", m.id);
  revalidate(ctx.eventId);
}

export async function eliminarMinutaPdf(fd: FormData): Promise<void> {
  const ctx = await guardEvent(fd);
  if (!ctx) return;
  const { data: m } = await ctx.supabase
    .from("meeting_minutes")
    .select("id, minuta_path")
    .eq("event_id", ctx.eventId)
    .maybeSingle();
  if (!m?.minuta_path) return;
  await ctx.supabase.storage.from(MINUTAS_BUCKET).remove([m.minuta_path]);
  // Quitar el PDF NO des-hace la reunión: realizada se mantiene.
  await ctx.supabase.from("meeting_minutes").update({ minuta_path: null, updated_at: new Date().toISOString() }).eq("id", m.id);
  revalidate(ctx.eventId);
}

// ---------- Notas ----------
export async function guardarNotas(fd: FormData): Promise<void> {
  const ctx = await guardEvent(fd);
  if (!ctx) return;
  const m = await ensureMinute(ctx);
  if (!m) return;
  await ctx.supabase
    .from("meeting_minutes")
    .update({ notas: str(fd, "notas") || null, updated_at: new Date().toISOString() })
    .eq("id", m.id);
  revalidate(ctx.eventId);
}

// ---------- Pendientes (filas estructuradas) ----------
export async function agregarPendiente(fd: FormData): Promise<void> {
  const ctx = await guardEvent(fd);
  if (!ctx) return;
  const texto = str(fd, "texto");
  if (!texto) return;
  const m = await ensureMinute(ctx);
  if (!m) return;
  const { count } = await ctx.supabase
    .from("meeting_minute_items")
    .select("id", { count: "exact", head: true })
    .eq("minute_id", m.id);
  await ctx.supabase.from("meeting_minute_items").insert({
    minute_id: m.id,
    client_id: ctx.clientId,
    texto,
    sort_order: count ?? 0,
  });
  revalidate(ctx.eventId);
}

export async function togglePendiente(fd: FormData): Promise<void> {
  const g = await guardItem(fd);
  if (!g) return;
  await g.supabase
    .from("meeting_minute_items")
    .update({ hecho: fd.get("hecho") != null, updated_at: new Date().toISOString() })
    .eq("id", g.itemId);
  if (g.eventId) revalidate(g.eventId);
}

export async function eliminarPendiente(fd: FormData): Promise<void> {
  const g = await guardItem(fd);
  if (!g) return;
  await g.supabase.from("meeting_minute_items").delete().eq("id", g.itemId);
  if (g.eventId) revalidate(g.eventId);
}

// ---------- Clasificar un evento como reunión (reversible) ----------
// Los eventos sincronizados de Google llegan con kind=null (el sync no lo setea).
// Marcarlos como reunión los hace documentables. La marca es DURABLE: el upsert
// del sync no envía kind, así que un re-sync no la pisa. Guard: canActOnClient
// (el client_id se resuelve del evento bajo RLS, nunca del input) + RLS.
export async function marcarComoReunion(fd: FormData): Promise<void> {
  const eventId = str(fd, "event_id");
  if (!eventId) return;
  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return;
  const supabase = await createClient();
  const { data: ev } = await supabase.from("calendar_events").select("client_id, kind").eq("id", eventId).maybeSingle();
  if (!ev || ev.kind === "reunion") return; // ya es reunión, o no accesible por RLS
  if (!(await canActOnClient(ev.client_id as string))) return; // guard explícito
  await supabase.from("calendar_events").update({ kind: "reunion" }).eq("id", eventId);
  revalidate(eventId);
}

// Desmarcar: vuelve a kind=null. SOLO si aún no hay documentación (fila de
// meeting_minutes), para no dejar una minuta huérfana e inaccesible por UI.
export async function desmarcarReunion(fd: FormData): Promise<void> {
  const eventId = str(fd, "event_id");
  if (!eventId) return;
  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return;
  const supabase = await createClient();
  const { data: ev } = await supabase.from("calendar_events").select("client_id, kind").eq("id", eventId).maybeSingle();
  if (!ev || ev.kind !== "reunion") return;
  if (!(await canActOnClient(ev.client_id as string))) return; // guard explícito
  const { data: m } = await supabase.from("meeting_minutes").select("id").eq("event_id", eventId).maybeSingle();
  if (m) return; // ya documentada → no desmarcar (no orfanar)
  await supabase.from("calendar_events").update({ kind: null }).eq("id", eventId);
  revalidate(eventId);
}
