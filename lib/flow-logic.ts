// Lógica PURA de conciliación de pagos Flow. Sin red, sin base, sin imports:
// así se testea el corazón (marcar pagada solo con confirmación real, triple
// validación, idempotencia) directamente y sin mocks.

/** Códigos de estado de Flow (payment/getStatus). */
export const FLOW_STATUS = {
  PENDING: 1,
  PAID: 2,
  REJECTED: 3,
  CANCELED: 4,
} as const;

export type FlowStatusPayload = {
  status: number; // 1..4
  commerceOrder: string;
  amount: number; // CLP que Flow reporta como cobrado
};

export type PaymentSnapshot = {
  commerce_order: string;
  amount: number; // lo que registramos al crear la orden
  status: string; // estado actual de nuestra fila de pago
};

export type InstallmentSnapshot = {
  status: string; // estado actual de la cuota
  total_clp: number | null; // monto congelado de la cuota facturada
};

export type PaymentAction =
  | "paid" // Flow confirmó: registrar pago pagado
  | "rejected" // Flow rechazó
  | "canceled" // Flow canceló
  | "pending" // sigue en proceso
  | "error" // inconsistencia (no tocar la cuota)
  | "noop"; // ya procesado / nada que hacer

export type Outcome = {
  paymentAction: PaymentAction;
  /** Solo true cuando hay que marcar la cuota como 'pagada' (idempotente). */
  markInstallmentPaid: boolean;
  reason: string;
};

/**
 * Decide qué hacer con un pago dado el estado que Flow devolvió por getStatus,
 * el estado de nuestra fila de pago y el de la cuota.
 *
 * Reglas duras (dinero real):
 *  - La cuota se marca 'pagada' SOLO con FLOW_STATUS.PAID.
 *  - Triple validación antes de marcar: commerceOrder coincide, y el monto que
 *    Flow reporta == monto registrado == total congelado de la cuota.
 *  - Idempotente: si el pago ya está 'paid', no se vuelve a marcar; si la cuota
 *    ya está 'pagada', markInstallmentPaid=false.
 *  - Rechazado/cancelado/pendiente: NUNCA tocan la cuota.
 */
export function decidePaymentOutcome(
  flow: FlowStatusPayload,
  payment: PaymentSnapshot,
  inst: InstallmentSnapshot,
): Outcome {
  // Guardas de identidad: el token nos llevó a una fila; el commerceOrder debe calzar.
  if (flow.commerceOrder !== payment.commerce_order) {
    return {
      paymentAction: "error",
      markInstallmentPaid: false,
      reason: `commerceOrder no coincide (flow=${flow.commerceOrder} vs fila=${payment.commerce_order})`,
    };
  }

  // Idempotencia dura: si ya cerramos este pago como pagado, no hacemos nada.
  if (payment.status === "paid") {
    return { paymentAction: "noop", markInstallmentPaid: false, reason: "pago ya estaba pagado" };
  }

  switch (flow.status) {
    case FLOW_STATUS.PAID: {
      // Triple validación de monto: Flow == registrado == congelado en la cuota.
      const montoOk =
        flow.amount === payment.amount &&
        inst.total_clp != null &&
        payment.amount === inst.total_clp;
      if (!montoOk) {
        return {
          paymentAction: "error",
          markInstallmentPaid: false,
          reason: `monto no calza (flow=${flow.amount}, registrado=${payment.amount}, cuota=${inst.total_clp}) — NO se marca pagada`,
        };
      }
      // Confirmado. Marcar cuota solo si aún no está pagada (idempotente).
      return {
        paymentAction: "paid",
        markInstallmentPaid: inst.status !== "pagada",
        reason: "Flow confirmó el pago (getStatus=2)",
      };
    }
    case FLOW_STATUS.REJECTED:
      return { paymentAction: "rejected", markInstallmentPaid: false, reason: "Flow rechazó el pago (3)" };
    case FLOW_STATUS.CANCELED:
      return { paymentAction: "canceled", markInstallmentPaid: false, reason: "Flow canceló el pago (4)" };
    case FLOW_STATUS.PENDING:
      return { paymentAction: "pending", markInstallmentPaid: false, reason: "pago aún en proceso (1)" };
    default:
      return {
        paymentAction: "error",
        markInstallmentPaid: false,
        reason: `estado de Flow desconocido: ${flow.status}`,
      };
  }
}
