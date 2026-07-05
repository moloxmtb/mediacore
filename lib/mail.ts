import "server-only";
import { Resend } from "resend";

const FROM = process.env.MAIL_FROM ?? "marketing@colormedia.cl";

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
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
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
