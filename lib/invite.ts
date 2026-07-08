import "server-only";
import { appUrl } from "@/lib/app-url";
import { sendEmail, type SendResult } from "@/lib/mail";

/**
 * Plomería compartida del correo de invitación (fijar contraseña). La usan tanto
 * la invitación de usuarios de PORTAL como la de MIEMBROS INTERNOS del equipo —
 * el mecanismo de correo/Resend es el mismo; solo cambia el copy. La creación
 * del perfil (client vs admin) vive en cada acción por separado, a propósito.
 */

export function confirmLink(hashedToken: string, type: "invite" | "recovery"): string {
  return `${appUrl()}/auth/confirm?token_hash=${hashedToken}&type=${type}&next=${encodeURIComponent("/fijar-clave")}`;
}

function inviteHtml(link: string, opts: { title: string; body: string; cta: string }): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1d23">
    <div style="border-left:4px solid #3dbdcb;padding:16px 20px;background:#f6f8f9;border-radius:8px">
      <h2 style="margin:0 0 8px;font-size:17px">${opts.title}</h2>
      <div style="font-size:14px;color:#444;line-height:1.5">${opts.body}</div>
      <a href="${link}" style="display:inline-block;margin-top:16px;background:#3dbdcb;color:#0c1013;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px">${opts.cta}</a>
      <p style="font-size:12px;color:#888;margin-top:14px">El enlace vence pronto. Si no lo pediste, ignora este correo.</p>
    </div>
  </div>`;
}

const COPY = {
  portal: {
    subject: "Te invitaron al portal de Color Media",
    title: "Te invitaron al portal de Color Media",
    body: "Crea tu contraseña para entrar a tu portal y revisar tus proyectos, contenido y avances.",
    cta: "Fijar mi contraseña",
  },
  recovery: {
    subject: "Fija tu contraseña — Color Media",
    title: "Fija tu contraseña",
    body: "Usa el enlace para fijar tu contraseña y volver a entrar.",
    cta: "Fijar mi contraseña",
  },
  internal: {
    subject: "Te sumaron al equipo de Color Media",
    title: "Te sumaron al equipo de Color Media",
    body: "Crea tu contraseña para entrar al panel interno de Color Media.",
    cta: "Fijar mi contraseña",
  },
};

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
  const c = COPY[opts.variant];
  return sendEmail({
    to: opts.to,
    subject: c.subject,
    html: inviteHtml(confirmLink(opts.hashedToken, opts.type), c),
  });
}
