import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rutas accesibles sin sesión. El endpoint de sync se autoriza por dentro
 *  (CRON_SECRET o sesión admin), por eso queda exento del gate. */
const PUBLIC_PATHS = [
  "/login",
  "/auth/confirm",
  "/api/calendar/sync",
  "/api/uf/refresh",
];

/** Home de cada rol tras autenticarse. */
const ADMIN_HOME = "/dashboard";
const CLIENT_HOME = "/portal";

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/** El área del portal (solo cliente) vive bajo /portal. Todo lo demás
 *  protegido es área de administración (solo admin). */
function isPortalArea(pathname: string) {
  return pathname === CLIENT_HOME || pathname.startsWith(CLIENT_HOME + "/");
}

/**
 * Refresca la sesión de Supabase en cada petición Y enruta según el rol
 * del perfil. Es la puerta de la app: el frontend filtra por comodidad,
 * pero la seguridad real es RLS (ver schema.sql).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No metas lógica entre createServerClient y getUser: getUser revalida el
  // token y, sin eso, la sesión puede cerrarse de forma intermitente.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  /** Construye un redirect preservando las cookies de sesión refrescadas. */
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // --- Sin sesión ---
  if (!user) {
    if (isPublic(pathname)) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  // --- Con sesión: obtener rol. Un usuario siempre puede leer su propio
  //     perfil (política "profiles: cada uno ve el suyo"). ---
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role === "admin" ? "admin" : "client";
  const home = role === "admin" ? ADMIN_HOME : CLIENT_HOME;

  // Fijar contraseña: accesible por cualquier usuario autenticado, sin rebote
  // de rol (el recién invitado aún no tiene su "mundo").
  if (pathname === "/fijar-clave") return supabaseResponse;

  // Ya autenticado en /login o en la raíz → a su home.
  if (pathname === "/login" || pathname === "/") {
    return redirectTo(home);
  }

  // Separación de áreas por rol.
  if (role === "admin" && isPortalArea(pathname)) {
    return redirectTo(ADMIN_HOME);
  }
  if (role === "client" && !isPortalArea(pathname)) {
    return redirectTo(CLIENT_HOME);
  }

  // IMPORTANTE: devolver supabaseResponse tal cual, para conservar las
  // cookies de sesión que Supabase pudo haber refrescado.
  return supabaseResponse;
}
