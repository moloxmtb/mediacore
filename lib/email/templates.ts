/**
 * Los 6 correos del sistema, como funciones PURAS (sin dependencias de servidor):
 * cada una arma su contenido y lo pasa por emailShell. Devuelven { subject, html }.
 * Los call sites (invite.ts, notify.ts, reunion-actions.ts) solo juntan las
 * variables y llaman acá. Copy del brief de rediseño (identidad Color Media).
 */
import { emailShell, esc, dataRows } from "./shell";

export type BuiltEmail = { subject: string; html: string };

// ============================================================
//  GRUPO A — a CLIENTES (invitación portal, recuperación) + T3 equipo
//  Comparten estructura: prosa breve + CTA de fijar clave + nota de vencimiento.
// ============================================================
const INVITE_COPY = {
  portal: {
    subject: "Tu portal en Color Media está listo",
    label: "INVITACIÓN A TU PORTAL",
    title: "Te damos la bienvenida a tu portal.",
    body: "Creamos un espacio para que sigas tus proyectos, revises y apruebes contenido, y tengas todo tu trabajo con nosotros en un solo lugar. Para entrar, solo crea tu contraseña.",
    cta: "Crear mi contraseña",
    footerNote: "El enlace vence pronto. Si no esperabas esta invitación, puedes ignorar este correo.",
  },
  recovery: {
    subject: "Restablece tu contraseña de Color Media",
    label: "RECUPERAR ACCESO",
    title: "Restablece tu contraseña.",
    body: "Recibimos una solicitud para restablecer tu contraseña. Crea una nueva y vuelves a entrar a tu portal enseguida.",
    cta: "Crear nueva contraseña",
    footerNote: "El enlace vence pronto por seguridad. Si no pediste esto, ignora el correo — tu contraseña actual sigue funcionando.",
  },
  internal: {
    subject: "Te sumaron al equipo de Color Media",
    label: "ACCESO AL EQUIPO",
    title: "Te sumamos al equipo.",
    body: "Crea tu contraseña para entrar al panel interno y empezar a trabajar.",
    cta: "Crear mi contraseña",
    footerNote: "El enlace vence pronto. Si crees que es un error, avísanos a hola@colormedia.cl.",
  },
} as const;

/** C1 (portal), C2 (recovery) y T3 (internal): correo de fijar contraseña. */
export function inviteEmail(variant: "portal" | "recovery" | "internal", link: string): BuiltEmail {
  const c = INVITE_COPY[variant];
  return {
    subject: c.subject,
    html: emailShell({
      label: c.label,
      title: c.title,
      bodyHtml: c.body,
      cta: { text: c.cta, url: link },
      footerNote: c.footerNote,
    }),
  };
}

// ============================================================
//  GRUPO B — a EQUIPO (datos escaneables)
// ============================================================

/** T1 · Respuesta de entregable (Fase 4). */
export function deliverableResponseEmail(v: {
  clientName: string | null;
  title: string;
  decisionLabel: string;
  comment: string | null;
  projectName: string | null;
  responder: string;
  url: string;
}): BuiltEmail {
  const cliente = v.clientName ?? "Un cliente";
  const rows: Array<{ label: string; value: string }> = [
    { label: "Decisión", value: esc(v.decisionLabel) },
  ];
  const comment = (v.comment ?? "").trim();
  if (comment) rows.push({ label: "Comentario", value: `&ldquo;${esc(comment)}&rdquo;` });
  if (v.projectName) rows.push({ label: "Proyecto", value: esc(v.projectName) });

  const quien = `<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#8A877F;">Respondió ${esc(v.responder)} de ${esc(cliente)}.</p>`;

  return {
    subject: `${cliente} respondió un entregable — ${v.decisionLabel}`,
    html: emailShell({
      label: "RESPUESTA DEL CLIENTE",
      title: `${esc(cliente)} respondió &laquo;${esc(v.title)}&raquo;`,
      bodyHtml: dataRows(rows) + quien,
      cta: { text: "Ver el entregable", url: v.url },
    }),
  };
}

const EVENT_COPY = {
  accion: { subjectLabel: "Nueva acción", label: "ACCIÓN", articulo: "una acción" },
  hito: { subjectLabel: "Nuevo hito", label: "HITO", articulo: "un hito" },
  reunion: { subjectLabel: "Nueva reunión", label: "REUNIÓN", articulo: "una reunión" },
} as const;

/** T2 · Eventos de bitácora (acción / hito / reunión). audience elige el CTA. */
export function eventEmail(v: {
  type: "accion" | "hito" | "reunion";
  clientName: string | null;
  title: string;
  detail: string | null;
  audience: "internal" | "client";
  url: string;
}): BuiltEmail {
  const c = EVENT_COPY[v.type];
  const cliente = v.clientName ?? "un cliente";
  const detail = (v.detail ?? "").trim();
  const detailHtml = detail && detail !== v.title
    ? `<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3d3a35;">${esc(detail)}</p>`
    : "";
  const body = `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#131313;"><strong>${esc(v.title)}</strong></p>${detailHtml}`;

  return {
    subject: `${c.subjectLabel} · ${cliente}`,
    html: emailShell({
      label: c.label,
      title: `Se registró ${c.articulo} en ${esc(cliente)}`,
      bodyHtml: body,
      cta:
        v.audience === "internal"
          ? { text: "Ver en el panel", url: v.url }
          : { text: "Ver en tu portal", url: v.url },
    }),
  };
}

/**
 * Notificación MANUAL contextual (botón "notificar" dentro de un objeto).
 * `objectLabel` es la etiqueta en mayúsculas (TAREA, COBRO, …). El `message`
 * del admin es OPCIONAL y va SIEMPRE por `esc()` (dato de usuario). `audience`
 * elige el CTA (panel para equipo, portal para cliente).
 */
export function manualNotifyEmail(v: {
  objectLabel: string;
  title: string;
  message: string | null;
  url: string;
  audience: "equipo" | "cliente";
}): BuiltEmail {
  const msg = (v.message ?? "").trim();
  const line =
    msg !== ""
      ? `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3d3a35;">${esc(msg)}</p>`
      : `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3d3a35;">${v.audience === "cliente" ? "Tienes una novedad de Color Media." : "Aviso interno sobre este objeto."}</p>`;
  return {
    subject: `${v.audience === "cliente" ? "Color Media" : "Aviso interno"} · ${v.title}`,
    html: emailShell({
      label: v.objectLabel,
      title: esc(v.title),
      bodyHtml: line,
      cta: { text: v.audience === "equipo" ? "Ver en el panel" : "Ver en tu portal", url: v.url },
    }),
  };
}

/** T4 · Solicitud de reunión (cliente → equipo). */
export function meetingRequestEmail(v: {
  clientName: string | null;
  requester: string;
  urgencyLabel: string;
  when: string;
  reason: string;
  url: string;
}): BuiltEmail {
  const cliente = v.clientName ?? "un cliente";
  return {
    subject: `Solicitud de reunión · ${cliente} (urgencia ${v.urgencyLabel.toLowerCase()})`,
    html: emailShell({
      label: "SOLICITUD DE REUNIÓN",
      title: `${esc(v.requester)} de ${esc(cliente)} solicitó una reunión`,
      bodyHtml: dataRows([
        { label: "Urgencia", value: esc(v.urgencyLabel) },
        { label: "Fecha preferida", value: esc(v.when) },
        { label: "Motivo", value: esc(v.reason) },
      ]),
      cta: { text: "Ver en el panel", url: v.url },
    }),
  };
}
