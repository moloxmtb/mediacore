import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isConfigured, syncAllCalendars } from "@/lib/google";

/**
 * Sincroniza Google → panel para todos los clientes con calendario mapeado.
 * Autorizado por:
 *  - header `x-cron-secret` == CRON_SECRET  (cron de Vercel / externo), o
 *  - sesión de admin  (botón "Sincronizar ahora" del panel).
 * Esta ruta está exenta del gate del middleware; la autorización se hace aquí.
 */
async function authorized(request: Request): Promise<boolean> {
  const secret = request.headers.get("x-cron-secret");
  if (secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET) {
    return true;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin";
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Google no configurado" }, { status: 400 });
  }
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const results = await syncAllCalendars();
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// El cron de Vercel llama por GET; reutilizamos la misma lógica.
export const GET = POST;
