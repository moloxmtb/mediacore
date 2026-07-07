import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvitationStatus } from "@/lib/types";

/**
 * Registro y estado de invitaciones. Una fila por envío/reenvío; el webhook de
 * Resend la actualiza por su message_id. Toda la escritura pasa por acá con un
 * cliente service_role (la acción de invitar y el webhook, ambos sin sesión de
 * usuario admin en el caso del webhook).
 */

/** Mapea un tipo de evento de Resend a nuestro estado. null = evento que no
 *  seguimos (se ignora sin tocar la base). */
export function statusFromEvent(type: string): InvitationStatus | null {
  switch (type) {
    case "email.sent":
      return "enviado";
    case "email.delivered":
      return "entregado";
    case "email.opened":
      return "abierto";
    case "email.bounced":
      return "rebotado";
    case "email.failed":
      return "fallido";
    default:
      return null;
  }
}

// Progreso positivo del envío. Un evento fuera de orden (p. ej. 'entregado'
// que llega después de 'abierto') NO debe retroceder el estado.
const RANK: Record<InvitationStatus, number> = {
  enviado: 1,
  entregado: 2,
  abierto: 3,
  rebotado: 0, // negativos: no participan del ranking positivo
  fallido: 0,
};
const NEGATIVE = new Set<InvitationStatus>(["rebotado", "fallido"]);

/** ¿El estado nuevo debe reemplazar al actual? Anti-regresión:
 *  - Un negativo (rebotado/fallido) se aplica salvo que ya haya un negativo.
 *  - Un positivo solo avanza (rank mayor) y nunca resucita una fila ya negativa. */
export function shouldAdvance(current: InvitationStatus, next: InvitationStatus): boolean {
  if (NEGATIVE.has(next)) return !NEGATIVE.has(current);
  if (NEGATIVE.has(current)) return false;
  return RANK[next] > RANK[current];
}

/** Inserta una fila de invitación (envío o reenvío). No pisa filas previas. */
export async function recordInvitation(
  admin: SupabaseClient,
  row: {
    client_id: string;
    user_id: string | null;
    email: string;
    kind: "invite" | "recovery";
    message_id: string | null;
    status: InvitationStatus;
    error?: string | null;
  },
): Promise<void> {
  await admin.from("client_invitations").insert({
    client_id: row.client_id,
    user_id: row.user_id,
    email: row.email,
    kind: row.kind,
    message_id: row.message_id,
    status: row.status,
    error: row.error ?? null,
  });
}

/** Aplica un evento verificado del webhook: casa la fila por message_id y
 *  avanza su estado (monótono). Devuelve qué pasó para el log del webhook. */
export async function applyInvitationEvent(
  admin: SupabaseClient,
  messageId: string,
  next: InvitationStatus,
): Promise<"updated" | "no-op" | "not-found"> {
  const { data: row } = await admin
    .from("client_invitations")
    .select("id, status")
    .eq("message_id", messageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return "not-found"; // evento de un correo que no registramos (no es invitación)

  const current = row.status as InvitationStatus;
  if (!shouldAdvance(current, next)) return "no-op";

  await admin
    .from("client_invitations")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return "updated";
}
