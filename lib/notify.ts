import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/mail";
import { appUrl } from "@/lib/app-url";

export type NotifType = "accion" | "hito" | "reunion";

function parseEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

/**
 * Calcula a quién le llega un evento, según la config por tipo y el ROL del
 * cliente. Cliente = solo usuarios de esa empresa con rol dueño/contenido
 * (finanzas NO recibe avisos de contenido). Se expone para poder verificarlo.
 */
export async function computeRecipients(
  type: NotifType,
  clientId: string,
): Promise<{ internal: string[]; client: string[] }> {
  const admin = createAdminClient();

  const [{ data: setting }, { data: config }] = await Promise.all([
    admin.from("notification_settings").select("to_internal, to_client").eq("event_type", type).maybeSingle(),
    admin.from("notification_config").select("internal_emails").eq("id", 1).maybeSingle(),
  ]);

  const internal = setting?.to_internal ? parseEmails(config?.internal_emails) : [];

  let client: string[] = [];
  if (setting?.to_client) {
    const { data: members } = await admin
      .from("profiles")
      .select("id")
      .eq("client_id", clientId)
      .eq("role", "client")
      .in("client_role", ["owner", "content"]);
    const ids = new Set((members ?? []).map((m) => m.id));
    if (ids.size) {
      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
      client = (users?.users ?? [])
        .filter((u) => ids.has(u.id) && u.email)
        .map((u) => u.email!.toLowerCase());
    }
  }
  return { internal, client };
}

function wrap(title: string, body: string, cta: { href: string; label: string }): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1d23">
    <div style="border-left:4px solid #3dbdcb;padding:16px 20px;background:#f6f8f9;border-radius:8px">
      <h2 style="margin:0 0 8px;font-size:17px">${title}</h2>
      <div style="font-size:14px;color:#444;line-height:1.5">${body}</div>
      <a href="${cta.href}" style="display:inline-block;margin-top:16px;background:#3dbdcb;color:#0c1013;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px">${cta.label}</a>
    </div>
  </div>`;
  // El pie automático lo agrega sendEmail (lib/mail.ts), centralizado.
}

/**
 * Notifica un evento por correo (best-effort). Un correo por destinatario, con
 * enlace al panel (interno) o al portal (cliente).
 */
export async function notifyEvent(opts: {
  type: NotifType;
  clientId: string;
  clientName?: string | null;
  title: string;
  detail: string;
  panelPath?: string;
  portalPath?: string;
}): Promise<{ internal: number; client: number }> {
  const { internal, client } = await computeRecipients(opts.type, opts.clientId);
  const label = opts.type === "accion" ? "Nueva acción" : opts.type === "reunion" ? "Nueva reunión" : "Nuevo hito";
  const subject = `${label}${opts.clientName ? " · " + opts.clientName : ""}: ${opts.title}`;

  const base = appUrl();
  const panelHref = base + (opts.panelPath ?? "/");
  const portalHref = base + (opts.portalPath ?? "/portal");

  for (const to of internal) {
    await sendEmail({ to, subject, html: wrap(subject, opts.detail, { href: panelHref, label: "Ver en el panel" }) });
  }
  for (const to of client) {
    await sendEmail({ to, subject, html: wrap(subject, opts.detail, { href: portalHref, label: "Ver en tu portal" }) });
  }
  return { internal: internal.length, client: client.length };
}
