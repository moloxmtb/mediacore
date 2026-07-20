"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, canSeeContent } from "@/lib/auth";
import { notifyDeliverableResponse } from "@/lib/notify";
import type { DeliverableReviewKind } from "@/lib/types";

/**
 * Lado CLIENTE del flujo de entregables (v2).
 *
 * El cliente NUNCA hace UPDATE de estado: inserta su fila en deliverable_reviews
 * con actor='client' y el trigger `apply_client_deliverable_review` la traduce a
 * approval_status (mismo patrón que apply_client_review en contenido). La RLS de
 * inserción acota qué puede escribir y en qué estado:
 *   · comentario                 → mientras el entregable esté enviado+visible
 *   · aprobacion/cambios/rechazo → solo si está 'enviado' (esperando respuesta)
 * Así el cliente ya NO queda mudo tras responder: puede seguir comentando.
 */

const DECISION_KIND: Record<string, DeliverableReviewKind> = {
  aprobado: "aprobacion",
  cambios_solicitados: "cambios",
  rechazado: "rechazo",
};

async function clientCtx(deliverableId: string) {
  const session = await getSessionProfile();
  if (!session || session.role !== "client" || !canSeeContent(session.clientRole)) return null;
  if (!session.clientId) return null;
  const supabase = await createClient();
  // La RLS ya limita a los entregables visibles de su empresa: si no lo alcanza,
  // para este usuario no existe.
  const { data: d } = await supabase.from("deliverables").select("id").eq("id", deliverableId).maybeSingle();
  if (!d) return null;
  return { supabase, clientId: session.clientId, userId: session.userId };
}

/** Aprobar / pedir cambios / rechazar, con comentario opcional. */
export async function responderEntregable(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "").trim();
  const decision = String(fd.get("decision") ?? "").trim();
  const comment = String(fd.get("comment") ?? "").trim();
  const kind = DECISION_KIND[decision];
  if (!id || !kind) return;

  const ctx = await clientCtx(id);
  if (!ctx) return;

  const { error } = await ctx.supabase.from("deliverable_reviews").insert({
    deliverable_id: id,
    client_id: ctx.clientId,
    actor: "client",
    kind,
    body: comment || null,
    created_by: ctx.userId,
  });
  // El trigger ya movió el estado. Solo se avisa si la fila entró de verdad: si
  // la RLS la rechazó (estado equivocado, rol), no hay aviso fantasma.
  if (!error) {
    await notifyDeliverableResponse({ deliverableId: id, kind: "decision" }).catch(() => {});
  }
  revalidatePath("/portal/aprobaciones");
  revalidatePath("/portal");
}

/** Comentar SIN decidir. Disponible aunque ya haya respondido antes. */
export async function comentarEntregable(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "").trim();
  const comment = String(fd.get("comment") ?? "").trim();
  if (!id || !comment) return;

  const ctx = await clientCtx(id);
  if (!ctx) return;

  const { error } = await ctx.supabase.from("deliverable_reviews").insert({
    deliverable_id: id,
    client_id: ctx.clientId,
    actor: "client",
    kind: "comentario",
    body: comment,
    created_by: ctx.userId,
  });
  if (!error) {
    await notifyDeliverableResponse({ deliverableId: id, kind: "comentario", comment }).catch(() => {});
  }
  revalidatePath("/portal/aprobaciones");
  revalidatePath("/portal");
}
