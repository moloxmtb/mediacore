import type {
  ClientSegment,
  ClientStatus,
  Contract,
  DeliverableStatus,
  ProjectStatus,
} from "./types";

// ---------- Dinero ----------
const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const uf = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatCLP(value: number | null | undefined): string {
  if (value == null) return "—";
  return clp.format(Math.round(value));
}

export function formatUF(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${uf.format(value)} UF`;
}

/**
 * Monto mensual de un contrato en pesos. Los contratos en UF se convierten
 * con el valor de UF entregado (el del día). Los CLP van tal cual.
 * (El congelado de UF por período llega en la Fase 5.)
 */
export function contractMonthlyCLP(
  contract: Pick<Contract, "currency" | "base_amount">,
  ufValue: number | null,
): number | null {
  if (contract.currency === "UF") {
    if (ufValue == null) return null;
    return Math.round(contract.base_amount * ufValue);
  }
  return contract.base_amount;
}

/** Etiqueta corta de la tarifa base (para tablas): "45,0 UF" o "$650.000". */
export function contractBaseLabel(
  contract: Pick<Contract, "currency" | "base_amount">,
): string {
  return contract.currency === "UF"
    ? formatUF(contract.base_amount)
    : formatCLP(contract.base_amount);
}

// ---------- Fechas ----------
export function formatMonthYear(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date + "T00:00:00");
  return `${String(d.getMonth() + 1).padStart(2, "0")}·${d.getFullYear()}`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Fecha + hora, para hitos/eventos de calendario (timestamptz ISO). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- Etiquetas de enums ----------
export const SEGMENT_LABELS: Record<ClientSegment, string> = {
  corporativo: "Corporativo",
  asuntos_publicos: "Asuntos públicos",
  pyme: "Pyme",
  personal_brand: "Personal brand",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  activo: "Activo",
  propuesta: "Propuesta",
  inactivo: "Inactivo",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  activo: "Activo",
  pausado: "Pausado",
  cerrado: "Cerrado",
};

// ---------- Clases de badge ----------
export function clientStatusBadge(status: ClientStatus): string {
  return status === "activo" ? "b-ok" : status === "propuesta" ? "b-idle" : "b-bad";
}

export function projectStatusBadge(status: ProjectStatus): string {
  return status === "activo" ? "b-ok" : status === "pausado" ? "b-warn" : "b-idle";
}

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  en_proceso: "En proceso",
  entregado: "Entregado",
  aprobado: "Aprobado",
};

export function deliverableStatusBadge(status: DeliverableStatus): string {
  return status === "aprobado"
    ? "b-ok"
    : status === "entregado"
      ? "b-accent"
      : "b-warn";
}
