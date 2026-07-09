// Bitácora (Pieza 3, Fase D): línea de tiempo hacia atrás que UNE fuentes que ya
// existen (reuniones realizadas, entregas confirmadas, hitos cumplidos, notas de
// `actions`). NO es una tabla nueva. Cada fuente se consulta bajo SU RLS y se
// mezcla en la app; acá viven el tipo de entrada y el merge puro, reusables por
// el admin (Fase D) y el portal (Fase E).

export type BitacoraKind = "reunion" | "entrega" | "hito" | "nota";

export type BitacoraEntry = {
  key: string;
  kind: BitacoraKind;
  date: string;      // YYYY-MM-DD (para agrupar/mostrar)
  sortKey: string;   // ISO comparable (para ordenar entre fuentes)
  clientId: string;
  title: string;
  detail: string | null;
  href: string | null;
  interna: boolean;  // true = no visible al cliente (el portal la filtra en Fase E)
};

/** Une entradas de varias fuentes y las ordena por fecha desc (más reciente
 *  primero). Puro: no consulta nada; recibe entradas ya scopeadas por RLS. */
export function mergeBitacora(entries: BitacoraEntry[]): BitacoraEntry[] {
  return [...entries].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export const BITACORA_KIND_LABELS: Record<BitacoraKind, string> = {
  reunion: "Reunión",
  entrega: "Entrega",
  hito: "Hito",
  nota: "Nota",
};

export function bitacoraKindBadge(kind: BitacoraKind): string {
  return kind === "reunion" ? "b-accent" : kind === "entrega" ? "b-ok" : kind === "hito" ? "b-idle" : "b-warn";
}
