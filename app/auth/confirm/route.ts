import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Verifica el token de un enlace de invitación / recuperación y establece la
 * sesión, luego redirige a `next` (típicamente /fijar-clave). Es público (el
 * usuario aún no tiene sesión al llegar).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/portal";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }
  }
  return NextResponse.redirect(`${url.origin}/login?error=invite`);
}
