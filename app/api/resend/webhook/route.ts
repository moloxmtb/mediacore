import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyInvitationEvent, statusFromEvent } from "@/lib/invitations";

export const runtime = "nodejs"; // la verificación de firma usa crypto de Node

// Webhook público de Resend: NADA se escribe en la base sin firma válida. Sigue
// el patrón del webhook de Flow (verificar antes de confiar), pero usa el
// verificador oficial del SDK de Resend (Standard Webhooks / Svix: HMAC-SHA256
// sobre `${id}.${timestamp}.${body}`, comparación en tiempo constante y
// tolerancia de timestamp anti-replay). Requiere el body CRUDO (no parseado).
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET no configurada");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const payload = await req.text(); // crudo, imprescindible para la firma
  const headers = {
    id: req.headers.get("svix-id") ?? "",
    timestamp: req.headers.get("svix-timestamp") ?? "",
    signature: req.headers.get("svix-signature") ?? "",
  };

  // ---- Verificación de firma ANTES de tocar la base ----
  let event: { type: string; data?: { email_id?: string } };
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    event = resend.webhooks.verify({ payload, headers, webhookSecret: secret }) as typeof event;
  } catch {
    // Firma inválida / ausente / timestamp fuera de tolerancia → se rechaza.
    return NextResponse.json({ ok: false, error: "firma inválida" }, { status: 401 });
  }

  // ---- Firma OK: recién ahora procesamos ----
  const status = statusFromEvent(event.type);
  if (!status) return NextResponse.json({ ok: true, ignored: event.type }); // evento no seguido
  const emailId = event.data?.email_id;
  if (!emailId) return NextResponse.json({ ok: true, ignored: "sin email_id" });

  const admin = createAdminClient();
  const result = await applyInvitationEvent(admin, emailId, status);
  return NextResponse.json({ ok: true, status, result });
}
