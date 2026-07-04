import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthUrl, isConfigured } from "@/lib/google";

/**
 * Inicia el flujo OAuth de Google Calendar. Solo el admin llega aquí
 * (el middleware bloquea a los demás). Guarda un `state` en cookie httpOnly
 * para verificarlo en el callback (protección CSRF).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  if (!isConfigured()) {
    return NextResponse.redirect(`${origin}/integraciones?error=config`);
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(getAuthUrl(state));
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
