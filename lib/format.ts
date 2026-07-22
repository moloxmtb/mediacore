import type {
  ClientRole,
  ClientSegment,
  ClientStatus,
  Contract,
  DeliverableApproval,
  DeliverableStatus,
  InvitationStatus,
  ProjectStatus,
  ReunionEstado,
  TaskStatus,
  TaskType,
} from "./types";

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  owner: "Dueño (todo)",
  finance: "Finanzas (solo financiero)",
  content: "Contenido / Proyectos",
};

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
 * Neto mensual de un contrato en pesos. UF → se convierte con la UF del día;
 * CLP fijo → va tal cual. Es el NETO (sin IVA).
 */
export function contractMonthlyNetCLP(
  contract: Pick<Contract, "currency" | "net_uf" | "net_clp_fixed">,
  ufValue: number | null,
): number | null {
  if (contract.currency === "UF") {
    if (ufValue == null || contract.net_uf == null) return null;
    return Math.round(contract.net_uf * ufValue);
  }
  return contract.net_clp_fixed;
}

/** Etiqueta corta del neto por cuota (para tablas): "45,0 UF" o "$650.000". */
export function contractNetLabel(
  contract: Pick<Contract, "currency" | "net_uf" | "net_clp_fixed">,
): string {
  return contract.currency === "UF"
    ? formatUF(contract.net_uf)
    : formatCLP(contract.net_clp_fixed);
}

// ---------- Fechas ----------
export function formatMonthYear(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date + "T00:00:00");
  return `${String(d.getMonth() + 1).padStart(2, "0")}·${d.getFullYear()}`;
}

/**
 * Zona horaria del negocio. TODO lo que se muestre con hora debe fijarla: el
 * servidor de producción (Vercel) corre en UTC, así que sin `timeZone` el
 * usuario ve la hora UTC (4 h adelantada en Chile). Es la misma zona que usa
 * lib/google para hablar con Google Calendar.
 */
export const TZ_CL = "America/Santiago";

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  // Una columna DATE no tiene zona: se ancla a UTC en ambos extremos para que
  // muestre exactamente el día guardado, corra donde corra el servidor.
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
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
    timeZone: TZ_CL,
  });
}

/** Solo la hora (listas de calendario). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_CL,
  });
}

/** Desfase de una zona respecto de UTC, en ms, para un instante dado. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

/**
 * Convierte lo que el usuario escribió en un <input type="datetime-local">
 * ("2026-07-21T15:00", SIN zona) al instante UTC correcto, entendiéndolo como
 * hora de Chile.
 *
 * Sin esto, ese texto se inserta tal cual en un timestamptz y Postgres lo lee
 * como UTC (la sesión de Supabase corre en UTC): las 15:00 quedarían guardadas
 * como 15:00Z = 11:00 de Chile. Respeta el horario de verano porque calcula el
 * desfase de ESA fecha, no uno fijo.
 */
export function chileLocalToISO(local: string | null | undefined): string | null {
  if (!local) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const naive = new Date(local.length === 16 ? local + ":00Z" : local + "Z");
  if (Number.isNaN(naive.getTime())) return null;
  // Dos pasadas: la primera estima el desfase, la segunda lo corrige si el
  // instante estimado cae al otro lado de un cambio de horario de verano.
  let inst = new Date(naive.getTime() - tzOffsetMs(naive, TZ_CL));
  inst = new Date(naive.getTime() - tzOffsetMs(inst, TZ_CL));
  return inst.toISOString();
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

// `Contract.status` es texto libre en la tabla: el consumidor cae al valor
// crudo si aparece uno fuera de esta lista.
export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  activo: "Activo",
  pausado: "Pausado",
  cerrado: "Cerrado",
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

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  interna: "Interna",
  cliente: "Del cliente",
};
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  hecha: "Hecha",
  confirmada: "Confirmada",
};
export function taskStatusBadge(status: TaskStatus): string {
  return status === "confirmada" ? "b-ok" : status === "hecha" ? "b-accent" : "b-warn";
}

export const REUNION_ESTADO_LABELS: Record<ReunionEstado, string> = {
  agendada: "Agendada",
  por_documentar: "Por documentar",
  realizada: "Realizada",
};
export function reunionEstadoBadge(estado: ReunionEstado): string {
  return estado === "realizada" ? "b-ok" : estado === "por_documentar" ? "b-warn" : "b-idle";
}

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  enviado: "Enviado",
  entregado: "Entregado",
  abierto: "Abierto",
  rebotado: "Rebotado",
  fallido: "Falló el envío",
};

export function invitationStatusBadge(status: InvitationStatus): string {
  switch (status) {
    case "abierto":
      return "b-ok";
    case "entregado":
      return "b-accent";
    case "enviado":
      return "b-idle";
    case "rebotado":
    case "fallido":
      return "b-bad";
  }
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

// ---------- Aprobación de entregables (ciclo del cliente) ----------
// "En corrección" se DERIVA de borrador + respondió antes (respondedAt), no es un
// valor del enum: borrador tras un pedido de cambios/rechazo = está en corrección.
export function deliverableApprovalLabel(status: DeliverableApproval, respondedAt: string | null): string {
  if (status === "borrador") return respondedAt ? "En corrección" : "Borrador";
  return {
    enviado: "En revisión",
    aprobado: "Aprobado",
    cambios_solicitados: "Cambios solicitados",
    rechazado: "Rechazado",
  }[status];
}
export function deliverableApprovalBadge(status: DeliverableApproval, respondedAt: string | null): string {
  if (status === "borrador") return respondedAt ? "b-warn" : "b-idle";
  return status === "aprobado" ? "b-ok" : status === "rechazado" ? "b-bad" : status === "enviado" ? "b-accent" : "b-warn";
}

// Las etiquetas cliente-facing viven ahora en lib/estado.ts (fuente única):
// deliverableClientLabel/Tone, contentClientLabel/Tone, taskClientLabel/Tone.
