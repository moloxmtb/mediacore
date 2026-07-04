"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ContentPeriodKind } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };
const BUCKET = "contenido";
const KINDS: ContentPeriodKind[] = ["mensual", "quincenal", "semanal"];

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}
function opt(fd: FormData, k: string) {
  const v = str(fd, k);
  return v === "" ? null : v;
}
function ext(name: string) {
  const e = name.split(".").pop();
  return e && e.length <= 5 ? e.toLowerCase() : "jpg";
}

// ---------- Períodos ----------
export async function crearPeriodo(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const client_id = str(fd, "client_id");
  const kind = str(fd, "kind") as ContentPeriodKind;
  const label = str(fd, "label");
  if (!client_id) return { error: "Elige un cliente." };
  if (!KINDS.includes(kind)) return { error: "Cadencia inválida." };
  if (!label) return { error: "Ponle una etiqueta al período (ej. Julio 2026)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_periods")
    .insert({
      client_id,
      kind,
      label,
      start_date: opt(fd, "start_date"),
      end_date: opt(fd, "end_date"),
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear el período: " + error.message };

  revalidatePath("/contenido");
  redirect(`/contenido/${data.id}`);
}

export async function publicarPeriodo(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("content_periods").update({ published: true }).eq("id", id);
  await supabase
    .from("content_pieces")
    .update({ status: "propuesta" })
    .eq("period_id", id)
    .eq("status", "borrador");
  revalidatePath(`/contenido/${id}`);
  revalidatePath("/contenido");
}

export async function eliminarPeriodo(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("content_periods").delete().eq("id", id);
  revalidatePath("/contenido");
  redirect("/contenido");
}

// ---------- Piezas + versiones ----------
export async function crearPieza(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const period_id = str(fd, "period_id");
  const title = str(fd, "title");
  const body = str(fd, "body");
  const file = fd.get("image") as File | null;
  if (!period_id) return { error: "Falta el período." };
  if (!title) return { error: "Ponle un nombre interno a la pieza." };

  const supabase = await createClient();
  const { data: period } = await supabase
    .from("content_periods")
    .select("client_id")
    .eq("id", period_id)
    .maybeSingle();
  if (!period) return { error: "No existe el período." };
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: piece, error: pErr } = await supabase
    .from("content_pieces")
    .insert({ period_id, client_id: period.client_id, title, status: "borrador" })
    .select("id")
    .single();
  if (pErr) return { error: "No se pudo crear la pieza: " + pErr.message };

  let image_path: string | null = null;
  if (file && file.size > 0) {
    image_path = `${period.client_id}/${piece.id}/v1.${ext(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(image_path, file, { upsert: true, contentType: file.type });
    if (upErr) return { error: "Error al subir la imagen: " + upErr.message };
  }

  const { data: ver } = await supabase
    .from("content_versions")
    .insert({
      piece_id: piece.id,
      version_number: 1,
      image_path,
      body,
      note: "Versión inicial",
      created_by: user?.id,
    })
    .select("id")
    .single();
  await supabase
    .from("content_pieces")
    .update({ current_version_id: ver!.id })
    .eq("id", piece.id);

  revalidatePath(`/contenido/${period_id}`);
  return { error: null, ok: true };
}

export async function subirVersion(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const piece_id = str(fd, "piece_id");
  const body = str(fd, "body");
  const note = opt(fd, "note");
  const file = fd.get("image") as File | null;
  if (!piece_id) return { error: "Falta la pieza." };

  const supabase = await createClient();
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, client_id, period_id, current_version_id")
    .eq("id", piece_id)
    .maybeSingle();
  if (!piece) return { error: "No existe la pieza." };

  const { data: cur } = piece.current_version_id
    ? await supabase
        .from("content_versions")
        .select("version_number, image_path")
        .eq("id", piece.current_version_id)
        .maybeSingle()
    : { data: null };

  const nextN = (cur?.version_number ?? 0) + 1;
  let image_path: string | null = cur?.image_path ?? null; // reutiliza si no hay imagen nueva
  if (file && file.size > 0) {
    image_path = `${piece.client_id}/${piece.id}/v${nextN}.${ext(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(image_path, file, { upsert: true, contentType: file.type });
    if (upErr) return { error: "Error al subir la imagen: " + upErr.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: ver, error } = await supabase
    .from("content_versions")
    .insert({
      piece_id,
      version_number: nextN,
      image_path,
      body,
      note: note ?? "Nueva versión",
      created_by: user?.id,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear la versión: " + error.message };

  // La nueva versión devuelve la pieza a ronda (propuesta), historial intacto.
  await supabase
    .from("content_pieces")
    .update({ current_version_id: ver.id, status: "propuesta" })
    .eq("id", piece_id);

  revalidatePath(`/contenido/${piece.period_id}`);
  return { error: null, ok: true };
}

// ---------- Decisión de Color Media ----------
async function reviewAndSet(
  pieceId: string,
  status: "aprobada" | "rechazada",
  kind: "confirmacion" | "devolucion",
  comment: string | null,
) {
  const supabase = await createClient();
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("period_id, current_version_id")
    .eq("id", pieceId)
    .maybeSingle();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("content_pieces").update({ status }).eq("id", pieceId);
  await supabase.from("content_reviews").insert({
    piece_id: pieceId,
    version_id: piece?.current_version_id ?? null,
    actor: "admin",
    kind,
    comment,
    created_by: user?.id,
  });
  if (piece?.period_id) revalidatePath(`/contenido/${piece.period_id}`);
}

export async function confirmarPieza(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (id) await reviewAndSet(id, "aprobada", "confirmacion", null);
}

export async function rechazarPieza(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (id) await reviewAndSet(id, "rechazada", "devolucion", opt(fd, "comment"));
}

export async function eliminarPieza(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const periodId = str(fd, "period_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("content_pieces").delete().eq("id", id);
  if (periodId) revalidatePath(`/contenido/${periodId}`);
}
