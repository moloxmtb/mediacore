import type {
  Contract,
  ContractModality,
  CurrencyKind,
  Installment,
  InstallmentStatus,
} from "./types";

export const IVA_RATE = 0.19;

// ---------- Neto del acuerdo/cuota según moneda ----------
export function netUF(x: Pick<Contract, "currency" | "net_uf">): number | null {
  return x.currency === "UF" ? x.net_uf : null;
}
export function netCLPFixed(
  x: Pick<Contract, "currency" | "net_clp_fixed">,
): number | null {
  return x.currency === "CLP" ? x.net_clp_fixed : null;
}

// ---------- IVA en UF (modo UF, en vivo) ----------
export function ivaUF(net: number, hasIva: boolean, rate = IVA_RATE): number {
  return hasIva ? Number((net * rate).toFixed(2)) : 0;
}
export function totalUF(net: number, hasIva: boolean, rate = IVA_RATE): number {
  return Number((net + ivaUF(net, hasIva, rate)).toFixed(2));
}

/**
 * Calcula el neto/IVA/total en CLP de una cuota. Para modo UF necesita la UF
 * del día (la que se congela). Para CLP fijo el neto ya está en pesos.
 * El IVA se calcula SIEMPRE sobre el neto; nunca se parte de un total.
 */
export function chargeCLP(opts: {
  currency: CurrencyKind;
  net_uf: number | null;
  net_clp_fixed: number | null;
  has_iva: boolean;
  iva_rate: number;
  uf_value: number | null;
}): { net_clp: number; iva_clp: number; total_clp: number } | null {
  let net_clp: number;
  if (opts.currency === "UF") {
    if (opts.uf_value == null || opts.net_uf == null) return null;
    net_clp = Math.round(opts.net_uf * opts.uf_value);
  } else {
    if (opts.net_clp_fixed == null) return null;
    net_clp = Math.round(opts.net_clp_fixed);
  }
  const iva_clp = opts.has_iva ? Math.round(net_clp * opts.iva_rate) : 0;
  return { net_clp, iva_clp, total_clp: net_clp + iva_clp };
}

/**
 * CLP a mostrar de una cuota: el congelado si ya se facturó, o un estimado con
 * la UF pasada (la de hoy) si aún está proyectada.
 */
export function installmentCLP(
  inst: Installment,
  ufToday: number | null,
): { net_clp: number; iva_clp: number; total_clp: number; frozen: boolean } | null {
  if (inst.status !== "proyectada" && inst.net_clp != null) {
    return {
      net_clp: inst.net_clp,
      iva_clp: inst.iva_clp ?? 0,
      total_clp: inst.total_clp ?? inst.net_clp,
      frozen: true,
    };
  }
  const est = chargeCLP({
    currency: inst.currency,
    net_uf: inst.net_uf,
    net_clp_fixed: inst.net_clp_fixed,
    has_iva: inst.has_iva,
    iva_rate: inst.iva_rate,
    uf_value: ufToday,
  });
  return est ? { ...est, frozen: false } : null;
}

// ---------- Etiquetas ----------
export const MODALITY_LABELS: Record<ContractModality, string> = {
  proyecto: "Proyecto puntual",
  plazo_fijo: "Plazo fijo",
  retainer: "Retainer indefinido",
};

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  proyectada: "Proyectada",
  facturada: "Facturada",
  pagada: "Pagada",
  vencida: "Vencida",
  anulada: "Anulada",
};

export function installmentStatusBadge(status: InstallmentStatus): string {
  switch (status) {
    case "pagada":
      return "b-ok";
    case "facturada":
      return "b-accent";
    case "vencida":
      return "b-bad";
    case "anulada":
      return "b-idle";
    default:
      return "b-warn";
  }
}

/** ¿La cuota proyectada vence hoy? (para el aviso "vence hoy"). */
export function isDueToday(inst: Installment, today: string): boolean {
  return inst.status === "proyectada" && inst.due_date === today;
}
export function isOverdue(inst: Installment, today: string): boolean {
  return (
    (inst.status === "proyectada" || inst.status === "facturada") &&
    inst.due_date < today
  );
}
