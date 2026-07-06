import { NextResponse } from "next/server";
import { flowConfigured, flowIsSandbox, flowRuntimeInfo } from "@/lib/flow";

// Diagnóstico de la config de Flow en el entorno que está corriendo. NO expone
// las llaves: solo el host de la API, si es sandbox, y los últimos 4 caracteres
// del apiKey (para distinguir sandbox vs producción sin revelar el secreto).
// Protegido con CRON_SECRET. Uso:
//   GET /api/flow/health?secret=<CRON_SECRET>
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    ...flowRuntimeInfo(),
    configured: flowConfigured(),
    isSandbox: flowIsSandbox(),
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
