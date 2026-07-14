/**
 * Plantilla base ÚNICA de todos los correos del sistema (identidad Color Media).
 * Reemplaza los 3 builders duplicados de antes (wrap, inviteHtml, HTML inline).
 * Los 6 correos solo pasan su contenido; el marco (header con logo, franja de
 * acento coral, cuerpo, pie) vive acá y en un solo lugar.
 *
 * HTML de correo: tablas para layout, estilos inline, ghost-table de Outlook,
 * ancho fluido (max-width 520). Paleta de marca: Tinta #131313 / Hueso #F1EDE6 /
 * Coral #FF4A2E (señal, no fondo). El pie legal va DENTRO del shell (única fuente;
 * por eso sendEmail ya no anexa pie).
 */

const LOGO = "https://colormedia.cl/wp-content/uploads/2026/07/Color-Media-2026-02.png";

/** Escapa texto variable para interpolar seguro en el HTML del correo. */
export function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Filas de datos escaneables (label en negro + valor). Los valores deben venir
 *  ya escapados por el llamador si son variables de usuario. */
export function dataRows(rows: Array<{ label: string; value: string }>): string {
  return rows
    .map(
      (r) =>
        `<p style="margin:0 0 9px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#3d3a35;"><strong style="color:#131313;">${r.label}:</strong> ${r.value}</p>`,
    )
    .join("");
}

export function emailShell(opts: {
  label: string;
  title: string;
  bodyHtml: string;
  cta?: { text: string; url: string };
  footerNote?: string;
}): string {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
                <tr><td align="center" bgcolor="#FF4A2E" style="border-radius:6px;">
                  <a href="${opts.cta.url}" style="display:inline-block;padding:13px 28px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#F1EDE6;border-radius:6px;">${opts.cta.text}</a>
                </td></tr>
              </table>`
    : "";
  const note = opts.footerNote
    ? `<p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#8A877F;">${opts.footerNote}</p>`
    : "";

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>body{margin:0;padding:0;background:#ebe7df;-webkit-text-size-adjust:100%}a{text-decoration:none}img{border:0;line-height:100%;outline:none}</style>
</head><body style="margin:0;padding:0;background:#ebe7df;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ebe7df;">
  <tr><td align="center" style="padding:28px 12px;">
    <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background:#F1EDE6;border-radius:10px;overflow:hidden;border:1px solid #C9C5BC;">
      <tr><td align="center" style="background:#F1EDE6;padding:16px 22px;">
        <img src="${LOGO}" alt="Color Media" width="268" style="display:block;width:268px;max-width:68%;height:auto;"></td></tr>
      <tr><td style="background:#FF4A2E;font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>
      <tr><td style="background:#F1EDE6;padding:32px 28px 28px;">
        <p style="margin:0 0 14px;font-family:'Space Mono',Courier,monospace;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#8A877F;">${opts.label}</p>
        <h1 style="margin:0 0 16px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:23px;line-height:1.25;font-weight:700;color:#131313;">${opts.title}</h1>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3d3a35;">${opts.bodyHtml}</div>
        ${cta}${note}
      </td></tr>
      <tr><td style="background:#ebe7df;border-top:1px solid #C9C5BC;padding:16px 28px;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8A877F;">Correo automático. Consultas: <a href="mailto:hola@colormedia.cl" style="color:#FF4A2E;font-weight:600;">hola@colormedia.cl</a></p>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body></html>`;
}
