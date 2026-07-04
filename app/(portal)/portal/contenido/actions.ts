"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ReviewKind } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

/** Inserta una revisión del cliente. RLS exige que la pieza sea de su empresa
 *  y que actor='client' con created_by = su uid; el trigger traduce al estado. */
async function insertClientReview(
  pieceId: string,
  kind: ReviewKind,
  comment: string | null,
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("current_version_id")
    .eq("id", pieceId)
    .maybeSingle();
  const { error } = await supabase.from("content_reviews").insert({
    piece_id: pieceId,
    version_id: piece?.current_version_id ?? null,
    actor: "client",
    kind,
    comment,
    created_by: user?.id,
  });
  return error?.message ?? null;
}

export async function aprobarPieza(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  await insertClientReview(id, "aprobacion", null);
  revalidatePath("/portal/contenido");
}

export async function pedirCambios(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const comment = str(fd, "comment");
  if (!id) return { error: "Falta la pieza." };
  if (!comment) return { error: "Escribe qué te gustaría cambiar." };
  const err = await insertClientReview(id, "cambios", comment);
  if (err) return { error: "No se pudo enviar: " + err };
  revalidatePath("/portal/contenido");
  return { error: null, ok: true };
}

export async function aprobarPeriodo(fd: FormData): Promise<void> {
  const periodId = str(fd, "period_id");
  if (!periodId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Solo las que están en revisión; RLS ya limita a las de su empresa.
  const { data: pieces } = await supabase
    .from("content_pieces")
    .select("id, current_version_id")
    .eq("period_id", periodId)
    .eq("status", "propuesta");
  const rows = (pieces ?? []).map((p) => ({
    piece_id: p.id,
    version_id: p.current_version_id,
    actor: "client" as const,
    kind: "aprobacion" as const,
    created_by: user?.id,
  }));
  if (rows.length) await supabase.from("content_reviews").insert(rows);
  revalidatePath("/portal/contenido");
}
