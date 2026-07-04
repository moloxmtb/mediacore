import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * En Next.js 16 la convención "middleware" se renombró a "proxy": es el
 * mismo mecanismo (corre antes de cada petición que calce el matcher).
 * Aquí refresca la sesión de Supabase y enruta según el rol del perfil.
 * La lógica vive en lib/supabase/middleware.ts.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Corre en todas las rutas salvo:
     * - _next/static y _next/image (assets del build)
     * - favicon y archivos de imagen estáticos
     * Así refresca la sesión y aplica la separación de roles en cada
     * navegación de página o llamada a la API.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
