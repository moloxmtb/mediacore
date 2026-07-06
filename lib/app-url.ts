import "server-only";

let warned = false;

/**
 * URL base de la app para armar links (correos de invitación/notificación y
 * callbacks de Flow). Fuente: APP_URL. Salvaguarda: si en PRODUCCIÓN quedó en
 * localhost (mal configurada en Vercel), lo grita en los logs una vez, para
 * cazar el desajuste antes de que un cliente reciba un link roto.
 */
export function appUrl(): string {
  const url = process.env.APP_URL ?? "http://localhost:3000";
  if (!warned && process.env.VERCEL_ENV === "production" && url.includes("localhost")) {
    warned = true;
    console.error(
      "[config] APP_URL apunta a localhost en PRODUCCIÓN. Los links de correo " +
        "(invitaciones, notificaciones) y los callbacks de Flow quedarán rotos. " +
        "Corrige APP_URL en Vercel al dominio real (https://core.colormedia.cl) y redeploy.",
    );
  }
  return url;
}
