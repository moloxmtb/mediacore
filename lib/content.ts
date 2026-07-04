import type {
  ContentPeriodKind,
  ContentStatus,
  ReviewKind,
} from "./types";

export const PERIOD_KIND_LABELS: Record<ContentPeriodKind, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal",
  semanal: "Semanal",
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  borrador: "Borrador",
  propuesta: "En revisión",
  aprobada_cliente: "Aprobada por el cliente",
  cambios_solicitados: "Cambios solicitados",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export function contentStatusBadge(status: ContentStatus): string {
  switch (status) {
    case "aprobada":
      return "b-ok";
    case "aprobada_cliente":
      return "b-accent";
    case "propuesta":
      return "b-warn";
    case "cambios_solicitados":
      return "b-warn";
    case "rechazada":
      return "b-bad";
    default:
      return "b-idle";
  }
}

export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  aprobacion: "Aprobó",
  cambios: "Pidió cambios",
  comentario: "Comentó",
  confirmacion: "Confirmó (Color Media)",
  devolucion: "Devolvió (Color Media)",
};
