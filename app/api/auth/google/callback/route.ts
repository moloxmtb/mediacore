import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, saveCredentials } from "@/lib/google";

/**
 * Callback de OAuth. Verifica el `state`, intercambia el código por tokens y
 * guarda el refresh token (cifrado) server-side. Nunca expone tokens al
 * navegador: solo redirige a /integraciones con el resultado.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("g_oauth_state")?.value;

  const back = (query: string) => {
    const res = NextResponse.redirect(`${origin}/integraciones?${query}`);
    res.cookies.delete("g_oauth_state");
    return res;
  };

  if (oauthError) return back(`error=${encodeURIComponent(oauthError)}`);
  if (!code || !state || !savedState || state !== savedState) {
    return back("error=state");
  }

  try {
    const tokens = await exchangeCode(code);
    await saveCredentials(tokens);
    // Si Google no devolvió refresh_token (consentimiento previo), avisamos.
    return back(tokens.refresh_token ? "connected=1" : "connected=norefresh");
  } catch {
    return back("error=exchange");
  }
}
