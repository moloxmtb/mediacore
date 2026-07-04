import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la service_role key: SALTA RLS.
 * Vive SOLO en el servidor (nunca se importa en código de cliente).
 * Lo usarán el refresco de UF y la sincronización con Google Calendar.
 * No lo uses para servir datos a un usuario: para eso está el cliente
 * ligado a la sesión (server.ts), que respeta las políticas.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
