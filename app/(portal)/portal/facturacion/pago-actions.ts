"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, canSeeFinance } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import {
  createPayment,
  applyFlowOutcome,
  flowConfigured,
  flowApiUrl,
  FlowEnvUnsafeError,
} from "@/lib/flow";

/**
 * Inicia el pago de una cuota con Flow y redirige al cliente a la pasarela.
 * Solo dueño/finanzas (RLS financiera). Solo cuotas FACTURADAS (monto congelado).
 */
export async function iniciarPagoFlow(fd: FormData): Promise<void> {
  const installmentId = String(fd.get("installment_id") ?? "").trim();
  if (!installmentId) redirect("/portal/facturacion?pago=error");

  const session = await getSessionProfile();
  if (!session || session.role !== "client" || !canSeeFinance(session.clientRole)) {
    redirect("/portal/facturacion?pago=error");
  }
  if (!flowConfigured()) redirect("/portal/facturacion?pago=noconfig");

  const supabase = await createClient();
  // RLS: solo carga la cuota si es del propio cliente y el rol puede.
  const { data: cuota } = await supabase
    .from("installments")
    .select("id, client_id, number, status, total_clp")
    .eq("id", installmentId)
    .maybeSingle();
  if (!cuota) redirect("/portal/facturacion?pago=error");
  if (cuota.status !== "facturada" || !cuota.total_clp) {
    // Solo se paga lo facturado (monto congelado). Nunca un estimado.
    redirect("/portal/facturacion?pago=noestado");
  }

  // Orden única por intento. commerce_order corto y trazable.
  const stamp = Date.now().toString(36);
  const commerceOrder = `MC-${cuota.id.slice(0, 8)}-${stamp}`;

  // Inserta el intento (RLS: dueño/finanzas del propio cliente).
  const { data: pay, error: insErr } = await supabase
    .from("installment_payments")
    .insert({
      installment_id: cuota.id,
      client_id: cuota.client_id,
      commerce_order: commerceOrder,
      amount: cuota.total_clp,
      status: "created",
      payer_email: session!.email,
      created_by: session!.userId,
    })
    .select("id")
    .single();
  if (insErr || !pay) redirect("/portal/facturacion?pago=error");

  // Las escrituras de estado/token las hace el servidor (service_role): la RLS
  // solo deja al cliente INSERT/SELECT sus pagos, no UPDATE.
  const admin = createAdminClient();

  const base = appUrl();
  let flow: { url: string; token: string; flowOrder: string };
  try {
    flow = await createPayment({
      commerceOrder,
      subject: `Cuota ${cuota.number} — Color Media`,
      amount: cuota.total_clp,
      email: session!.email ?? "sin-correo@colormedia.cl",
      urlConfirmation: `${base}/api/flow/confirm`,
      urlReturn: `${base}/api/flow/return`,
    });
  } catch (e) {
    await admin
      .from("installment_payments")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", pay.id);
    if (e instanceof FlowEnvUnsafeError) {
      // Salvaguarda: producción apuntando a sandbox. No se creó la orden.
      console.error(
        "[flow] BLOQUEADO: deployment de producción con FLOW_API_URL de sandbox; pago NO creado.",
        { commerceOrder, apiUrl: flowApiUrl() },
      );
      redirect("/portal/facturacion?pago=config");
    }
    redirect("/portal/facturacion?pago=error");
  }

  await admin
    .from("installment_payments")
    .update({
      flow_token: flow.token,
      flow_order: flow.flowOrder,
      flow_env: flowApiUrl(), // host crudo efectivamente usado
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pay.id);

  revalidatePath("/portal/facturacion");
  // A la pasarela de Flow (la tarjeta nunca toca Media Core).
  redirect(`${flow.url}?token=${flow.token}`);
}

/**
 * Reconcilia manualmente el último intento pendiente de una cuota (red de
 * seguridad si el callback no llegó). Vuelve a preguntar a Flow por getStatus.
 */
export async function verificarPagoFlow(fd: FormData): Promise<void> {
  const installmentId = String(fd.get("installment_id") ?? "").trim();
  if (!installmentId) redirect("/portal/facturacion?pago=error");

  const session = await getSessionProfile();
  if (!session || session.role !== "client" || !canSeeFinance(session.clientRole)) {
    redirect("/portal/facturacion?pago=error");
  }

  const supabase = await createClient();
  const { data: pay } = await supabase
    .from("installment_payments")
    .select("flow_token")
    .eq("installment_id", installmentId)
    .in("status", ["pending", "created"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pay?.flow_token) {
    try {
      await applyFlowOutcome(pay.flow_token);
    } catch {
      redirect("/portal/facturacion?pago=error");
    }
  }
  revalidatePath("/portal/facturacion");
  redirect("/portal/facturacion?pago=verificado");
}
