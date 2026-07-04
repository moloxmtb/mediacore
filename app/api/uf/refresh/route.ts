import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshUf } from "@/lib/uf";

/**
 * Refresca la UF del día en uf_values (fuente: mindicador.cl).
 * Autorizado por header `x-cron-secret` == CRON_SECRET (cron) o por sesión de
 * admin (botón manual). Exento del gate del middleware.
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
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const uf = await refreshUf();
  if (!uf) {
    return NextResponse.json(
      { error: "No se pudo obtener la UF de mindicador.cl" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, ...uf });
}

// El cron de Vercel llama por GET.
export const GET = POST;
