import { NextResponse } from "next/server";
import { applyFlowOutcome } from "@/lib/flow";

// urlConfirmation de Flow: llamada servidor↔servidor (sin sesión). Flow envía el
// token por POST. Es la AUTORIDAD: aquí se concilia con getStatus y, solo si el
// pago está confirmado, se marca la cuota. Respondemos 200 cuando procesamos;
// si getStatus falla transitorio, 5xx para que Flow reintente.
export async function POST(req: Request) {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "").trim();
  } catch {
    // Algunos reintentos podrían venir sin form parseable.
  }
  if (!token) {
    const url = new URL(req.url);
    token = url.searchParams.get("token")?.trim() ?? "";
  }
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const result = await applyFlowOutcome(token);
    return NextResponse.json({ ok: result.ok, action: result.action });
  } catch {
    // Error transitorio (p. ej. getStatus caído): pedir reintento a Flow.
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
