import type { ReunionEstado } from "@/lib/types";

/**
 * Estado de una reunión, DERIVADO — sin campo guardado que sincronizar. La
 * reunión durable es el calendar_event; la única info nueva es
 * meeting_minutes.realizada (un hecho ortogonal, no un espejo del evento).
 *
 *   realizada === true            → "realizada"
 *   starts_at ya pasó (sin marcar) → "por_documentar"
 *   starts_at futuro              → "agendada"
 *
 * Función pura: la usan el detalle admin (Fase B) y el portal (Fase E) — una
 * sola definición del ciclo de vida.
 */
export function deriveReunionEstado(
  startsAt: string,
  realizada: boolean,
  now: Date = new Date(),
): ReunionEstado {
  if (realizada) return "realizada";
  if (new Date(startsAt).getTime() < now.getTime()) return "por_documentar";
  return "agendada";
}
