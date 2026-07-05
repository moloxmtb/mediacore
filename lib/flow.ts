import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decidePaymentOutcome,
  type FlowStatusPayload,
} from "@/lib/flow-logic";

// ============================================================
//  Cliente de Flow (SOLO SANDBOX por ahora).
//  Env: FLOW_API_KEY, FLOW_SECRET_KEY (server-only), FLOW_API_URL.
//  Sandbox:    FLOW_API_URL=https://sandbox.flow.cl/api
//  Producción: FLOW_API_URL=https://www.flow.cl/api  (solo cambiar env)
// ============================================================

const API_URL = process.env.FLOW_API_URL ?? "https://sandbox.flow.cl/api";
const API_KEY = process.env.FLOW_API_KEY ?? "";
const SECRET = process.env.FLOW_SECRET_KEY ?? "";

export function flowConfigured(): boolean {
  return !!API_KEY && !!SECRET;
}

export function flowIsSandbox(): boolean {
  return API_URL.includes("sandbox.flow.cl");
}

/**
 * Firma de Flow: parámetros ordenados alfabéticamente por nombre, concatenados
 * como nombre+valor (sin separadores), HMAC-SHA256 hex con la secret key.
 */
function sign(params: Record<string, string>): string {
  const concat = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return crypto.createHmac("sha256", SECRET).update(concat).digest("hex");
}

/** payment/create — POST form-urlencoded. Devuelve { url, token, flowOrder }. */
export async function createPayment(input: {
  commerceOrder: string;
  subject: string;
  amount: number; // CLP entero
  email: string;
  urlConfirmation: string;
  urlReturn: string;
}): Promise<{ url: string; token: string; flowOrder: string }> {
  const params: Record<string, string> = {
    apiKey: API_KEY,
    commerceOrder: input.commerceOrder,
    subject: input.subject,
    currency: "CLP",
    amount: String(input.amount),
    email: input.email,
    urlConfirmation: input.urlConfirmation,
    urlReturn: input.urlReturn,
    paymentMethod: "9", // todos los medios
  };
  params.s = sign(params);

  const res = await fetch(`${API_URL}/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Flow payment/create ${res.status}: ${t}`);
  }
  const data = (await res.json()) as { url: string; token: string; flowOrder: number };
  return { url: data.url, token: data.token, flowOrder: String(data.flowOrder) };
}

/** payment/getStatus — GET firmado. Fuente de verdad del estado del pago. */
export async function getPaymentStatus(token: string): Promise<FlowStatusPayload & {
  flowOrder?: string;
}> {
  const params: Record<string, string> = { apiKey: API_KEY, token };
  params.s = sign(params);
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}/payment/getStatus?${qs}`, { method: "GET" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Flow getStatus ${res.status}: ${t}`);
  }
  const d = (await res.json()) as {
    status: number;
    commerceOrder: string;
    amount: number | string;
    flowOrder?: number;
  };
  return {
    status: Number(d.status),
    commerceOrder: d.commerceOrder,
    amount: Number(d.amount),
    flowOrder: d.flowOrder != null ? String(d.flowOrder) : undefined,
  };
}

export type ApplyResult = {
  ok: boolean;
  action: string;
  reason: string;
  installmentPaid: boolean;
};

/**
 * Concilia un token con Flow y aplica el resultado de forma idempotente.
 * La ÚNICA vía por la que una cuota pasa a 'pagada'. Llamada por los callbacks
 * /api/flow/confirm y /api/flow/return. Usa service_role (los callbacks de Flow
 * no traen sesión), pero solo toca la fila de pago identificada por el token y
 * su cuota, validando todo contra la respuesta firmada de Flow.
 */
export async function applyFlowOutcome(token: string): Promise<ApplyResult> {
  const admin = createAdminClient();

  // 1. Estado autoritativo desde Flow (servidor↔servidor, firmado).
  const flow = await getPaymentStatus(token);

  // 2. Nuestra fila de pago por token.
  const { data: pay } = await admin
    .from("installment_payments")
    .select("id, installment_id, commerce_order, amount, status")
    .eq("flow_token", token)
    .maybeSingle();
  if (!pay) {
    return { ok: false, action: "error", reason: "no existe el pago para ese token", installmentPaid: false };
  }

  // 3. Cuota asociada (para el total congelado y su estado).
  const { data: inst } = await admin
    .from("installments")
    .select("id, status, total_clp")
    .eq("id", pay.installment_id)
    .maybeSingle();
  if (!inst) {
    return { ok: false, action: "error", reason: "no existe la cuota del pago", installmentPaid: false };
  }

  // 4. Decisión pura (triple validación + idempotencia).
  const outcome = decidePaymentOutcome(
    { status: flow.status, commerceOrder: flow.commerceOrder, amount: flow.amount },
    { commerce_order: pay.commerce_order, amount: pay.amount, status: pay.status },
    { status: inst.status, total_clp: inst.total_clp },
  );

  if (outcome.paymentAction === "noop") {
    return { ok: true, action: "noop", reason: outcome.reason, installmentPaid: false };
  }

  const now = new Date().toISOString();

  // 5a. Actualiza la fila de pago (no pisa un 'paid' previo).
  const payStatus =
    outcome.paymentAction === "paid"
      ? "paid"
      : outcome.paymentAction === "rejected"
        ? "rejected"
        : outcome.paymentAction === "canceled"
          ? "canceled"
          : outcome.paymentAction === "pending"
            ? "pending"
            : "error";
  await admin
    .from("installment_payments")
    .update({
      status: payStatus,
      flow_order: flow.flowOrder ?? null,
      paid_at: outcome.paymentAction === "paid" ? now : null,
      updated_at: now,
    })
    .eq("id", pay.id)
    .neq("status", "paid");

  // 5b. Marca la cuota 'pagada' SOLO si la decisión lo indica, e idempotente
  //     (where status <> 'pagada'): un segundo callback no vuelve a marcar.
  if (outcome.markInstallmentPaid) {
    await admin
      .from("installments")
      .update({ status: "pagada", paid_at: now })
      .eq("id", inst.id)
      .neq("status", "pagada");
  }

  return {
    ok: outcome.paymentAction !== "error",
    action: outcome.paymentAction,
    reason: outcome.reason,
    installmentPaid: outcome.markInstallmentPaid,
  };
}
