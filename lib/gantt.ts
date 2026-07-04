import type { Phase } from "./types";

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

export type GanttMonth = { label: string; widthPct: number };
export type GanttRow = {
  phase: Phase;
  leftPct: number;
  widthPct: number;
};
export type GanttLayout = {
  months: GanttMonth[];
  rows: GanttRow[];
  todayPct: number | null;
  totalDays: number;
  rangeStartMs: number;
};

/** Posición (0–100) de una fecha dentro del rango de la Gantt, o null si cae
 *  fuera. Sirve para ubicar los hitos de calendario sobre la línea. */
export function datePct(layout: GanttLayout, iso: string): number | null {
  const t = new Date(iso).getTime();
  const pct = ((t - layout.rangeStartMs) / (layout.totalDays * 86400000)) * 100;
  if (pct < 0 || pct > 100) return null;
  return pct;
}

function parse(date: string): Date {
  return new Date(date + "T00:00:00");
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Convierte las fases de un proyecto en la geometría de la carta Gantt.
 * El rango se calcula desde las fechas reales de las fases y se redondea a
 * meses completos. `today` se pasa desde el llamador (cliente) para marcar
 * la línea de HOY. Devuelve null si no hay fases.
 */
export function buildGantt(
  phases: Phase[],
  today: Date | null,
): GanttLayout | null {
  if (!phases.length) return null;

  const starts = phases.map((p) => parse(p.start_date).getTime());
  const ends = phases.map((p) => parse(p.end_date).getTime());
  const minStart = new Date(Math.min(...starts));
  const maxEnd = new Date(Math.max(...ends));

  // Redondea a meses completos.
  const rangeStart = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
  const rangeEnd = new Date(maxEnd.getFullYear(), maxEnd.getMonth() + 1, 0);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

  // Meses del rango, cada uno con su ancho proporcional.
  const months: GanttMonth[] = [];
  let cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const from = mStart < rangeStart ? rangeStart : mStart;
    const to = mEnd > rangeEnd ? rangeEnd : mEnd;
    const days = daysBetween(from, to) + 1;
    months.push({
      label: `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`,
      widthPct: (days / totalDays) * 100,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const rows: GanttRow[] = phases.map((p) => {
    const s = parse(p.start_date);
    const e = parse(p.end_date);
    return {
      phase: p,
      leftPct: (daysBetween(rangeStart, s) / totalDays) * 100,
      widthPct: ((daysBetween(s, e) + 1) / totalDays) * 100,
    };
  });

  let todayPct: number | null = null;
  if (today && today >= rangeStart && today <= rangeEnd) {
    todayPct = (daysBetween(rangeStart, today) / totalDays) * 100;
  }

  return {
    months,
    rows,
    todayPct,
    totalDays,
    rangeStartMs: rangeStart.getTime(),
  };
}
