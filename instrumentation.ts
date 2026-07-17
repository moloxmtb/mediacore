/**
 * Salvaguarda de arranque (Next `register()` corre una vez al iniciar el server).
 *
 * En DESARROLLO la app se niega a arrancar si NO está apuntando a su base de
 * datos aislada. Así `next dev` (panel-dev) nunca puede tocar producción por
 * accidente —p.ej. si `.env.local` quedara apuntando a la Supabase de prod.
 *
 * Regla (solo cuando NODE_ENV !== 'production'):
 *   - Debe existir DEV_DB_HOST_ALLOW = host de la Supabase de dev/staging.
 *   - El host de NEXT_PUBLIC_SUPABASE_URL debe coincidir EXACTAMENTE con él.
 *   - Si falta o no coincide → lanza y el server NO arranca (fail-closed).
 *
 * Allowlist positiva: el host permitido vive en `.env.local` (gitignored), así
 * no se commitea ningún identificador de producción. En producción
 * (NODE_ENV === 'production') esta función es un no-op.
 */
export function register() {
  if (process.env.NODE_ENV === "production") return;

  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const allow = process.env.DEV_DB_HOST_ALLOW?.trim();

  let host = "";
  try {
    host = new URL(dbUrl).host;
  } catch {
    host = "";
  }

  const fail = (msg: string): never => {
    throw new Error(
      `\n\n⛔ ARRANQUE BLOQUEADO (dev) — ${msg}\n` +
        `   NEXT_PUBLIC_SUPABASE_URL host = ${host || "(inválida)"}\n` +
        `   DEV_DB_HOST_ALLOW           = ${allow ?? "(no definido)"}\n` +
        `   panel-dev SOLO puede correr contra su DB aislada. Revisa .env.local.\n`,
    );
  };

  if (!allow) {
    fail("falta DEV_DB_HOST_ALLOW: no puedo verificar que la DB sea la de dev.");
  }
  if (!host) {
    fail("NEXT_PUBLIC_SUPABASE_URL ausente o inválida.");
  }
  if (host !== allow) {
    fail("la DB configurada NO es la DB de dev permitida (¿apuntando a producción?).");
  }

  console.log(`[startup-guard] dev OK: DB aislada confirmada (${host}).`);
}
