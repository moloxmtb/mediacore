import type { CSSProperties } from "react";
import type {
  ClientStatus,
  ContentStatus,
  DeliverableApproval,
  DeliverableStatus,
  InstallmentStatus,
  InvitationStatus,
  MeetingRequestStatus,
  PlanItemStatus,
  ProjectStatus,
  ReunionEstado,
  TaskStatus,
} from "@/lib/types";

/**
 * FUENTE ÚNICA del semáforo del panel (sistema v2). Implementa MAPA-ESTADOS-COLORES.md:
 * un mismo estado = el mismo color en TODA la app. Antes cada página repetía su
 * propio mapa; acá vive una sola vez para que no se desincronicen.
 *
 *   🟢 ok      listo / aprobado / pagado / hecho / al día
 *   🟡 wait    en espera / esperando acción / por cobrar
 *   🔴 bad     atrasado / vencido / rechazado
 *   ⚪ neutral neutro / borrador / en curso interno / sin enviar / archivado
 */
export type Tone = "ok" | "wait" | "bad" | "neutral";

export const ST: Record<Tone, string> = {
  ok: "var(--st-ok)",
  wait: "var(--st-wait)",
  bad: "var(--st-bad)",
  neutral: "var(--st-neutral)",
};

/** Estilo inline que fija --st (chip de estado, borde de fila, tarjeta teñida). */
export const stStyle = (t: Tone): CSSProperties => ({ ["--st" as string]: ST[t] }) as CSSProperties;

/** Hoy en Santiago (YYYY-MM-DD) — para derivar vencimientos. */
export function todaySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

// ---------- §1 Clientes ----------
export const clientTone: Record<ClientStatus, Tone> = {
  activo: "ok",
  propuesta: "wait",
  inactivo: "neutral",
};

// ---------- §2 Proyectos ----------
export const projectTone: Record<ProjectStatus, Tone> = {
  activo: "ok",
  pausado: "wait",
  cerrado: "neutral",
};

// ---------- §3 Tareas (estado + plazo) ----------
/** pendiente sin vencer → ámbar · pendiente con plazo vencido → rojo · hecha/confirmada → verde.
 *  El color NO depende del `tipo` (interna/cliente): ese eje va en su pill. */
export function taskTone(estado: TaskStatus, plazo: string | null, today: string): Tone {
  if (estado === "hecha" || estado === "confirmada") return "ok";
  if (plazo && plazo < today) return "bad";
  return "wait";
}

// ---------- Fases (no están en el MAPA: derivación del avance) ----------
/** El MAPA no cubre fases (no tienen estado propio en el esquema). Derivación
 *  usada en el panel, consistente con el semáforo: 100% → verde (hecha),
 *  >0% → ámbar (en curso), 0% → gris (sin empezar). */
export function phaseTone(progress: number): Tone {
  if (progress >= 100) return "ok";
  return progress > 0 ? "wait" : "neutral";
}

// ---------- §4a Reuniones (evento) ----------
export const reunionTone: Record<ReunionEstado, Tone> = {
  agendada: "neutral",
  por_documentar: "wait",
  realizada: "ok",
};

// ---------- §4b Solicitudes de reunión ----------
export const meetingRequestTone: Record<MeetingRequestStatus, Tone> = {
  pendiente: "wait",
  agendada: "ok",
  descartada: "neutral",
};

// ---------- §5 Hitos ----------
/** Futuro → gris · pasado → verde (cumplido).
 *  ⚠️ El ROJO de "vencido e incumplido" NO es derivable con el esquema actual:
 *  falta un flag de cumplido en el hito (ver MAPA §5 y su pendiente 1). */
export function hitoTone(startsAtIso: string, nowMs: number): Tone {
  return new Date(startsAtIso).getTime() < nowMs ? "ok" : "neutral";
}

// ---------- §6 Entregables ----------
export const deliverableApprovalTone: Record<DeliverableApproval, Tone> = {
  borrador: "neutral",
  enviado: "wait",
  cambios_solicitados: "wait",
  aprobado: "ok",
  rechazado: "bad",
};

export const deliverableLegacyTone: Record<DeliverableStatus, Tone> = {
  en_proceso: "neutral",
  entregado: "wait",
  aprobado: "ok",
};

/** MAPA §6: manda `approval_status` si el entregable está en el flujo de
 *  aprobación (`en_flujo_aprobacion`); si no, manda `status` (legacy). */
export function deliverableTone(d: {
  en_flujo_aprobacion?: boolean | null;
  approval_status?: DeliverableApproval | null;
  status: DeliverableStatus;
}): Tone {
  if (d.en_flujo_aprobacion && d.approval_status) return deliverableApprovalTone[d.approval_status];
  return deliverableLegacyTone[d.status];
}

// ---------- §7 Contenido ----------
export const contentTone: Record<ContentStatus, Tone> = {
  borrador: "neutral",
  propuesta: "wait",
  cambios_solicitados: "wait",
  aprobada_cliente: "ok",
  aprobada: "ok",
  rechazada: "bad",
};

// ---------- §8a Cuotas ----------
export const installmentTone: Record<InstallmentStatus, Tone> = {
  proyectada: "neutral",
  facturada: "wait",
  pagada: "ok",
  vencida: "bad",
  anulada: "neutral",
};

// ---------- §8b Cobros mensuales (legacy `billings`, sigue vivo) ----------
export const billingTone: Record<string, Tone> = {
  pendiente: "wait",
  pagado: "ok",
  vencido: "bad",
  anulado: "neutral",
};

// ---------- Apéndice: objetos menores ----------
export const planItemTone: Record<PlanItemStatus, Tone> = {
  activo: "ok",
  pendiente: "wait",
};

/** Telemetría de correo (no estado de negocio): progresión neutra/verde;
 *  rebotado/fallido en rojo (problema de entrega). */
export const invitationTone: Record<InvitationStatus, Tone> = {
  enviado: "neutral",
  entregado: "ok",
  abierto: "ok",
  rebotado: "bad",
  fallido: "bad",
};
