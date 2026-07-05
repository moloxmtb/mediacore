import { NextResponse } from "next/server";
import { applyFlowOutcome } from "@/lib/flow";

// urlReturn de Flow: aquí aterriza el NAVEGADOR al volver de la pasarela. Es solo
// UX, pero por defensa vuelve a conciliar con getStatus (idempotente) por si el
// callback server-a-server aún no llegó. Nunca marca pagada sin getStatus=2.
async function handle(req: Request): Promise<Response> {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "").trim();
  } catch {
    // GET o cuerpo no-form.
  }
  if (!token) {
    token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  }

  const base = process.env.APP_URL ?? "http://localhost:3000";
  let outcome = "pendiente";
  if (token) {
    try {
      const r = await applyFlowOutcome(token);
      outcome =
        r.action === "paid"
          ? "ok"
          : r.action === "rejected"
            ? "rechazado"
            : r.action === "canceled"
              ? "cancelado"
              : r.action === "noop"
                ? "ok"
                : "pendiente";
    } catch {
      outcome = "pendiente";
    }
  }
  return NextResponse.redirect(`${base}/portal/finanzas?pago=${outcome}`, { status: 303 });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
