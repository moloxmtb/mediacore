import "server-only";
import { appUrl } from "@/lib/app-url";
import { sendEmail, type SendResult } from "@/lib/mail";
import { inviteEmail } from "@/lib/email/templates";

/**
 * Plomería compartida del correo de invitación (fijar contraseña). La usan tanto
 * la invitación de usuarios de PORTAL como la de MIEMBROS INTERNOS del equipo —
 * el mecanismo de correo/Resend es el mismo; solo cambia el copy (en templates).
 * La creación del perfil (client vs admin) vive en cada acción por separado.
 */

export function confirmLink(hashedToken: string, type: "invite" | "recovery"): string {
  return `${appUrl()}/auth/confirm?token_hash=${hashedToken}&type=${type}&next=${encodeURIComponent("/fijar-clave")}`;
}

/**
 * Envía el correo con el enlace de fijar-clave. `variant` elige el copy:
 * 'portal' (invitación de usuario de portal), 'recovery' (reenvío) o 'internal'
 * (miembro del equipo). Devuelve el SendResult (con message-id) para el estado.
 */
export async function sendInviteEmail(opts: {
  to: string;
  hashedToken: string;
  type: "invite" | "recovery";
  variant: "portal" | "recovery" | "internal";
}): Promise<SendResult> {
  const { subject, html } = inviteEmail(opts.variant, confirmLink(opts.hashedToken, opts.type));
  return sendEmail({ to: opts.to, subject, html });
}
