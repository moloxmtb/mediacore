"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseVideoUrl } from "@/lib/video";
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

// Contexto de una versión: pieza, cliente, período, estado, número. Los medios
// solo se editan si la pieza está en 'borrador' (versión editable).
type VersionCtx = {
  versionId: string;
  versionNumber: number;
  pieceId: string;
  clientId: string;
  periodId: string;
  status: string;
};
async function loadVersionCtx(
  supabase: Awaited<ReturnType<typeof createClient>>,
  versionId: string,
): Promise<VersionCtx | null> {
  // Desambiguar la relación: content_versions ↔ content_pieces existe por dos
  // FK (piece_id y el inverso current_version_id). Usamos el FK de piece_id.
  const { data } = await supabase
    .from("content_versions")
    .select("id, version_number, piece_id, content_pieces!content_versions_piece_id_fkey(client_id, period_id, status)")
    .eq("id", versionId)
    .maybeSingle();
  if (!data) return null;
  const p = data.content_pieces as unknown as { client_id: string; period_id: string; status: string };
  return {
    versionId: data.id as string,
    versionNumber: data.version_number as number,
    pieceId: data.piece_id as string,
    clientId: p.client_id,
    periodId: p.period_id,
    status: p.status,
  };
}

async function nextOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  versionId: string,
): Promise<number> {
  const { data } = await supabase
    .from("content_media")
    .select("sort_order")
    .eq("version_id", versionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data.sort_order as number) + 1 : 0;
}

// ---------- Períodos (INTACTOS) ----------
export async function crearPeriodo(_p: FormState, fd: FormData): Promise<FormState> {
  const client_id = str(fd, "client_id");
  const kind = str(fd, "kind") as ContentPeriodKind;
  const label = str(fd, "label");
  if (!client_id) return { error: "Elige un cliente." };
  if (!KINDS.includes(kind)) return { error: "Cadencia inválida." };
  if (!label) return { error: "Ponle una etiqueta al período (ej. Julio 2026)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_periods")
    .insert({ client_id, kind, label, start_date: opt(fd, "start_date"), end_date: opt(fd, "end_date") })
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
  await supabase.from("content_pieces").update({ status: "propuesta" }).eq("period_id", id).eq("status", "borrador");
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

// ---------- Piezas ----------
/** Crea una pieza en 'borrador' con su versión 1 (set de medios VACÍO). Los
 *  medios se agregan luego con el editor. */
export async function crearPieza(_p: FormState, fd: FormData): Promise<FormState> {
  const period_id = str(fd, "period_id");
  const title = str(fd, "title");
  const body = opt(fd, "body");
  if (!period_id) return { error: "Falta el período." };
  if (!title) return { error: "Ponle un nombre interno a la pieza." };

  const supabase = await createClient();
  const { data: period } = await supabase.from("content_periods").select("client_id").eq("id", period_id).maybeSingle();
  if (!period) return { error: "No existe el período." };
  const { data: { user } } = await supabase.auth.getUser();

  const { data: piece, error: pErr } = await supabase
    .from("content_pieces")
    .insert({ period_id, client_id: period.client_id, title, status: "borrador" })
    .select("id")
    .single();
  if (pErr) return { error: "No se pudo crear la pieza: " + pErr.message };

  const { data: ver, error: vErr } = await supabase
    .from("content_versions")
    .insert({ piece_id: piece.id, version_number: 1, body, note: "Versión inicial", created_by: user?.id })
    .select("id")
    .single();
  if (vErr) return { error: "No se pudo crear la versión: " + vErr.message };
  await supabase.from("content_pieces").update({ current_version_id: ver.id }).eq("id", piece.id);

  revalidatePath(`/contenido/${period_id}`);
  return { error: null, ok: true };
}

/** Edita el copy de la versión (solo en borrador). */
export async function editarCopia(_p: FormState, fd: FormData): Promise<FormState> {
  const version_id = str(fd, "version_id");
  if (!version_id) return { error: "Falta la versión." };
  const supabase = await createClient();
  const ctx = await loadVersionCtx(supabase, version_id);
  if (!ctx) return { error: "No existe la versión." };
  if (ctx.status !== "borrador") return { error: "Solo se edita en borrador." };
  await supabase.from("content_versions").update({ body: opt(fd, "body") }).eq("id", version_id);
  revalidatePath(`/contenido/${ctx.periodId}`);
  return { error: null, ok: true };
}

// ---------- Medios (editables solo en borrador) ----------
export async function agregarImagen(_p: FormState, fd: FormData): Promise<FormState> {
  const version_id = str(fd, "version_id");
  const file = fd.get("image") as File | null;
  if (!version_id) return { error: "Falta la versión." };
  if (!file || file.size === 0) return { error: "Elige una imagen." };

  const supabase = await createClient();
  const ctx = await loadVersionCtx(supabase, version_id);
  if (!ctx) return { error: "No existe la versión." };
  if (ctx.status !== "borrador") return { error: "Solo se agregan medios en borrador." };

  const path = `${ctx.clientId}/${ctx.pieceId}/v${ctx.versionNumber}/${randomUUID()}.${ext(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { error: "Error al subir la imagen: " + upErr.message };

  const { error } = await supabase
    .from("content_media")
    .insert({ version_id, kind: "imagen", sort_order: await nextOrder(supabase, version_id), storage_path: path });
  if (error) return { error: "No se pudo guardar la imagen: " + error.message };

  revalidatePath(`/contenido/${ctx.periodId}`);
  return { error: null, ok: true };
}

export async function agregarVideo(_p: FormState, fd: FormData): Promise<FormState> {
  const version_id = str(fd, "version_id");
  const url = str(fd, "url");
  const orientationRaw = str(fd, "orientation");
  if (!version_id) return { error: "Falta la versión." };

  const parsed = parseVideoUrl(url);
  if (!parsed) return { error: "El link no es de YouTube ni Vimeo. Pega un enlace válido de esos proveedores." };
  const orientation = ["vertical", "horizontal"].includes(orientationRaw) ? orientationRaw : parsed.orientationGuess;

  const supabase = await createClient();
  const ctx = await loadVersionCtx(supabase, version_id);
  if (!ctx) return { error: "No existe la versión." };
  if (ctx.status !== "borrador") return { error: "Solo se agregan medios en borrador." };

  const { error } = await supabase.from("content_media").insert({
    version_id,
    kind: "video",
    sort_order: await nextOrder(supabase, version_id),
    embed_url: parsed.embedUrl,
    provider: parsed.provider,
    orientation,
  });
  if (error) return { error: "No se pudo guardar el video: " + error.message };

  revalidatePath(`/contenido/${ctx.periodId}`);
  return { error: null, ok: true };
}

export async function quitarMedio(fd: FormData): Promise<void> {
  const media_id = str(fd, "media_id");
  if (!media_id) return;
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("content_media")
    .select("version_id, kind, storage_path")
    .eq("id", media_id)
    .maybeSingle();
  if (!m) return;
  const ctx = await loadVersionCtx(supabase, m.version_id as string);
  if (!ctx || ctx.status !== "borrador") return; // solo en borrador

  await supabase.from("content_media").delete().eq("id", media_id);
  // Con copia física por versión, este archivo es exclusivo de esta versión:
  // borrarlo no puede afectar a otra.
  if (m.kind === "imagen" && m.storage_path) {
    await supabase.storage.from(BUCKET).remove([m.storage_path as string]);
  }
  revalidatePath(`/contenido/${ctx.periodId}`);
}

/** Persiste el nuevo orden (dnd-kit). Dos fases para no violar el
 *  unique(version_id, sort_order) a mitad de camino. */
export async function reordenarMedios(fd: FormData): Promise<void> {
  const version_id = str(fd, "version_id");
  let ids: string[] = [];
  try { ids = JSON.parse(str(fd, "order")); } catch { return; }
  if (!version_id || !Array.isArray(ids) || !ids.length) return;

  const supabase = await createClient();
  const ctx = await loadVersionCtx(supabase, version_id);
  if (!ctx || ctx.status !== "borrador") return;

  // Fase 1: valores temporales negativos (no chocan con los finales 0..n-1).
  for (let i = 0; i < ids.length; i++) {
    await supabase.from("content_media").update({ sort_order: -(i + 1) }).eq("id", ids[i]).eq("version_id", version_id);
  }
  // Fase 2: orden final.
  for (let i = 0; i < ids.length; i++) {
    await supabase.from("content_media").update({ sort_order: i }).eq("id", ids[i]).eq("version_id", version_id);
  }
  revalidatePath(`/contenido/${ctx.periodId}`);
}

// ---------- Versionado (opción B: copia física de medios) ----------
/** "Rehacer / Nueva versión": nace en 'borrador', copiando el set de medios de
 *  la versión actual. Cada imagen se COPIA físicamente en Storage a una ruta
 *  propia de la versión nueva (los videos solo copian la fila). Habilitada desde
 *  cualquier estado salvo 'borrador' (ya editable) y 'aprobada' (cerrada).
 *
 *  ATÓMICA: o copia TODOS los medios, o no crea la versión. Si falla una copia o
 *  un insert, revierte lo parcial (archivos copiados + la fila de versión, que
 *  por cascade borra las filas de medios ya insertadas) y devuelve error. La
 *  pieza no se toca (current_version_id / status) hasta que todo salió bien, así
 *  que un fallo nunca deja al cliente una versión con medios incompletos. */
export async function crearVersion(_p: FormState, fd: FormData): Promise<FormState> {
  const piece_id = str(fd, "piece_id");
  if (!piece_id) return { error: "Falta la pieza." };
  const supabase = await createClient();
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, client_id, period_id, status, current_version_id")
    .eq("id", piece_id)
    .maybeSingle();
  if (!piece) return { error: "No existe la pieza." };
  if (piece.status === "borrador" || piece.status === "aprobada") {
    return { error: "No se puede rehacer la pieza en su estado actual." };
  }

  const { data: cur } = piece.current_version_id
    ? await supabase.from("content_versions").select("version_number, body").eq("id", piece.current_version_id).maybeSingle()
    : { data: null };
  const nextN = (cur?.version_number ?? 0) + 1;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: newVer, error: vErr } = await supabase
    .from("content_versions")
    .insert({ piece_id, version_number: nextN, body: cur?.body ?? null, note: "Nueva versión", created_by: user?.id })
    .select("id")
    .single();
  if (vErr || !newVer) return { error: "No se pudo crear la versión, reintenta." };

  // Copiar el set de medios de la versión actual.
  const { data: media } = piece.current_version_id
    ? await supabase
        .from("content_media")
        .select("kind, sort_order, storage_path, embed_url, provider, orientation")
        .eq("version_id", piece.current_version_id)
        .order("sort_order", { ascending: true })
    : { data: [] };

  // Revertir lo parcial: borrar los archivos ya copiados y la fila de versión
  // (cascade elimina las filas de medios ya insertadas). La pieza sigue intacta.
  const copiedPaths: string[] = [];
  const rollback = async () => {
    if (copiedPaths.length) await supabase.storage.from(BUCKET).remove(copiedPaths);
    await supabase.from("content_versions").delete().eq("id", newVer.id);
  };
  const failed = { error: "No se pudo crear la versión, reintenta." };

  for (const m of media ?? []) {
    if (m.kind === "imagen" && m.storage_path) {
      const e = (m.storage_path as string).split(".").pop() ?? "jpg";
      const newPath = `${piece.client_id}/${piece_id}/v${nextN}/${randomUUID()}.${e}`;
      // Copia server-side (no descarga/sube); cada versión con sus propios archivos.
      const { error: cErr } = await supabase.storage.from(BUCKET).copy(m.storage_path as string, newPath);
      if (cErr) { await rollback(); return failed; }
      copiedPaths.push(newPath);
      const { error: iErr } = await supabase
        .from("content_media")
        .insert({ version_id: newVer.id, kind: "imagen", sort_order: m.sort_order, storage_path: newPath });
      if (iErr) { await rollback(); return failed; }
    } else if (m.kind === "video") {
      const { error: iErr } = await supabase.from("content_media").insert({
        version_id: newVer.id, kind: "video", sort_order: m.sort_order,
        embed_url: m.embed_url, provider: m.provider, orientation: m.orientation,
      });
      if (iErr) { await rollback(); return failed; }
    }
  }

  // Todo copiado: recién ahora la versión nueva queda como actual y la pieza
  // vuelve a 'borrador' para editar.
  await supabase.from("content_pieces").update({ current_version_id: newVer.id, status: "borrador" }).eq("id", piece_id);
  revalidatePath(`/contenido/${piece.period_id}`);
  return { error: null, ok: true };
}

/** "Proponer": borrador -> propuesta (re-ronda por pieza). */
export async function proponerPieza(fd: FormData): Promise<void> {
  const piece_id = str(fd, "piece_id");
  const period_id = str(fd, "period_id");
  if (!piece_id) return;
  const supabase = await createClient();
  await supabase.from("content_pieces").update({ status: "propuesta" }).eq("id", piece_id).eq("status", "borrador");
  if (period_id) revalidatePath(`/contenido/${period_id}`);
}

// ---------- Decisión de Color Media (INTACTO) ----------
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
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("content_pieces").update({ status }).eq("id", pieceId);
  await supabase.from("content_reviews").insert({
    piece_id: pieceId, version_id: piece?.current_version_id ?? null, actor: "admin", kind, comment, created_by: user?.id,
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

// ---------- Eliminar pieza (+ limpieza de Storage) ----------
export async function eliminarPieza(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const periodId = str(fd, "period_id");
  if (!id) return;
  const supabase = await createClient();

  // Reunir los archivos de TODAS las versiones de la pieza y borrarlos de Storage
  // (el cascade de la base borra filas, pero no toca Storage).
  const { data: vers } = await supabase.from("content_versions").select("id, image_path").eq("piece_id", id);
  const vids = (vers ?? []).map((v) => v.id as string);
  const paths: string[] = [];
  if (vids.length) {
    const { data: media } = await supabase
      .from("content_media")
      .select("storage_path")
      .eq("kind", "imagen")
      .in("version_id", vids)
      .not("storage_path", "is", null);
    for (const m of media ?? []) if (m.storage_path) paths.push(m.storage_path as string);
  }
  // Vestigial: rutas viejas en content_versions.image_path (por si alguna existe).
  for (const v of vers ?? []) if (v.image_path) paths.push(v.image_path as string);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

  await supabase.from("content_pieces").delete().eq("id", id); // cascade: versiones + medios
  if (periodId) revalidatePath(`/contenido/${periodId}`);
}
