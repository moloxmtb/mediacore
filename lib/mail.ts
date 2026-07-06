import "server-only";
import { Resend } from "resend";

// ---- Remitente, reply-to y pie: ÚNICA fuente de verdad de todos los correos ----
// notificaciones@ no existe como buzón (solo envía); las respuestas van a
// marketing@ vía reply_to. El dominio colormedia.cl ya está verificado en Resend.
const FROM = "Notificaciones Color Media <notificaciones@colormedia.cl>";
const REPLY_TO = "marketing@colormedia.cl";

// Pie automático, estilo secundario (gris, chico), separado del contenido. Se
// agrega a TODOS los correos desde acá, para no repetirlo en cada plantilla.
const FOOTER = `<div style="max-width:520px;margin:16px auto 0;padding-top:14px;border-top:1px solid #e4e1da;font-family:Arial,sans-serif;font-size:11px;color:#999;line-height:1.5">Este es un correo automático de notificaciones. Por favor no respondas a esta dirección. Para cualquier consulta escríbenos a <a href="mailto:marketing@colormedia.cl" style="color:#999;text-decoration:underline">marketing@colormedia.cl</a>.</div>`;

export function mailConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return Boolean(k && !k.startsWith("REEMPLAZAR"));
}

/**
 * Envía un correo con Resend. Best-effort: si falla (o no está configurado),
 * registra en el log y devuelve false, sin lanzar — nunca rompe la acción que
 * lo disparó.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!mailConfigured()) {
    console.warn("[mail] RESEND_API_KEY no configurada; correo omitido:", opts.subject);
    return false;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to: opts.to,
      subject: opts.subject,
      html: opts.html + FOOTER,
    });
    if (error) {
      console.error("[mail] Resend error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mail] excepción al enviar:", e);
    return false;
  }
}
