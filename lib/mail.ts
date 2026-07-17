import "server-only";
import { Resend } from "resend";

// ---- Remitente y reply-to: ÚNICA fuente de verdad de todos los correos ----
// notificaciones@ no existe como buzón (solo envía); las respuestas van a
// hola@ vía reply_to. El dominio colormedia.cl ya está verificado en Resend.
// El PIE ya no se anexa acá: vive dentro de emailShell (lib/email/shell.ts),
// única fuente del marco visual.
const FROM = "Color Media <notificaciones@colormedia.cl>";
const REPLY_TO = "hola@colormedia.cl";

export function mailConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return Boolean(k && !k.startsWith("REEMPLAZAR"));
}

/**
 * Sink de correo para DEV: si `DEV_EMAIL_SINK` está definida (p.ej.
 * "delivered@resend.dev"), TODO destinatario se reescribe a esa dirección, de
 * modo que ningún correo pueda llegar a una persona real desde el entorno de
 * desarrollo. En producción la variable no existe → los envíos van a su
 * destinatario normal y esta función es transparente.
 */
export function emailSink(): string | null {
  const s = process.env.DEV_EMAIL_SINK?.trim();
  return s ? s : null;
}

/**
 * Envía un correo con Resend. Best-effort: si falla (o no está configurado),
 * registra en el log y devuelve { ok:false, ... } sin lanzar — nunca rompe la
 * acción que lo disparó. Devuelve el message-id cuando el envío se acepta.
 */
export type SendResult = {
  ok: boolean;
  /** message-id de Resend (para casar con los eventos del webhook); null si no salió. */
  id: string | null;
  error: string | null;
};

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<SendResult> {
  if (!mailConfigured()) {
    console.warn("[mail] RESEND_API_KEY no configurada; correo omitido:", opts.subject);
    return { ok: false, id: null, error: "RESEND_API_KEY no configurada" };
  }
  // DEV: redirige todo destinatario al sink (ninguna persona real recibe correo).
  const sink = emailSink();
  const to = sink ?? opts.to;
  const subject = sink ? `[DEV→sink] ${opts.subject}` : opts.subject;
  if (sink) {
    console.warn(
      `[mail] DEV_EMAIL_SINK activo: destinatario original ${JSON.stringify(opts.to)} redirigido a ${sink} · "${opts.subject}"`,
    );
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      html: opts.html,
    });
    if (error) {
      console.error("[mail] Resend error:", error);
      return { ok: false, id: null, error: error.message ?? "error de Resend" };
    }
    return { ok: true, id: data?.id ?? null, error: null };
  } catch (e) {
    console.error("[mail] excepción al enviar:", e);
    return { ok: false, id: null, error: (e as Error).message };
  }
}
