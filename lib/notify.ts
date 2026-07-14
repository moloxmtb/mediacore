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

// ============================================================
//  MOTOR DE NOTIFICACIONES POR PERMISO (nace con Fase 4 de entregables)
//
//  A diferencia de notifyEvent (arriba), que resuelve los internos desde una
//  LISTA GLOBAL, este motor calcula destinatarios por PERMISO REAL: solo quien
//  puede ver al cliente. Es el equivalente server-side y por-conjunto de
//  staff_sees_client(cid) = is_owner() OR asignado en admin_assignments.
//  Reutiliza el transporte (sendEmail), la plantilla (wrap) y appUrl.
// ============================================================

/**
 * Staff interno que PUEDE VER a un cliente = owners (admin_role='owner', ven a
 * todos) ∪ asignados a ese cliente (admin_assignments). Resuelto a {email,name}.
 * Reutilizable para cualquier notificación interna client-scoped, no cableado a
 * entregables. Nunca incluye al cliente ni a staff sin permiso sobre ese cliente.
 */
export async function resolveClientStaff(
  clientId: string,
): Promise<{ email: string; name: string | null }[]> {
  const admin = createAdminClient();
  const [{ data: owners }, { data: assigned }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "admin").eq("admin_role", "owner"),
    admin.from("admin_assignments").select("member_id").eq("client_id", clientId),
  ]);
  const ids = new Set<string>([
    ...(owners ?? []).map((o) => o.id as string),
    ...(assigned ?? []).map((a) => a.member_id as string),
  ]);
  if (!ids.size) return [];

  const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", [...ids]);
  const nameById = new Map((profs ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]));

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email]));

  const seen = new Set<string>();
  const out: { email: string; name: string | null }[] = [];
  for (const id of ids) {
    const email = emailById.get(id)?.toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push({ email, name: nameById.get(id) ?? null });
    }
  }
  return out;
}

const DELIV_DECISION_LABEL: Record<string, string> = {
  aprobado: "Aprobado",
  cambios_solicitados: "Pidió cambios",
  rechazado: "Rechazado",
};

/**
 * Primer caso automático del motor: el cliente respondió un entregable.
 * Avisa por correo SOLO al staff que puede ver ese cliente (resolveClientStaff).
 * Best-effort. Se dispara desde la acción del portal recién cuando la RPC
 * confirmó el cambio. Lee el entregable fresco (única fuente de verdad).
 */
export async function notifyDeliverableResponse(opts: {
  deliverableId: string;
}): Promise<{ sent: number; recipients: number }> {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("deliverables")
    .select("title, approval_status, client_comment, responded_by, projects(name, client_id, clients(name))")
    .eq("id", opts.deliverableId)
    .maybeSingle();
  if (!d) return { sent: 0, recipients: 0 };

  const project = d.projects as unknown as { name: string | null; client_id: string; clients: { name: string | null } | null } | null;
  const clientId = project?.client_id;
  if (!clientId) return { sent: 0, recipients: 0 };

  const decision = d.approval_status as string;
  const decisionLabel = DELIV_DECISION_LABEL[decision] ?? decision;
  const clientName = project?.clients?.name ?? null;

  let responder = "El cliente";
  if (d.responded_by) {
    const { data: p } = await admin.from("profiles").select("full_name").eq("id", d.responded_by as string).maybeSingle();
    if (p?.full_name) responder = p.full_name as string;
  }

  const staff = await resolveClientStaff(clientId);
  if (!staff.length) return { sent: 0, recipients: 0 };

  const subject = `Respuesta del cliente${clientName ? " · " + clientName : ""}: ${d.title} — ${decisionLabel}`;
  const comment = (d.client_comment ?? "").trim();
  const body = [
    `<strong>${responder}</strong>${clientName ? " (" + clientName + ")" : ""} respondió el entregable <strong>&laquo;${d.title}&raquo;</strong>.`,
    `Decisión: <strong>${decisionLabel}</strong>.`,
    comment ? `Comentario: <em>&ldquo;${comment}&rdquo;</em>` : "",
    project?.name ? `Proyecto: ${project.name}.` : "",
  ].filter(Boolean).join("<br>");
  const html = wrap(subject, body, { href: appUrl() + `/entregables/${opts.deliverableId}`, label: "Ver el entregable" });

  let sent = 0;
  for (const r of staff) {
    const res = await sendEmail({ to: r.email, subject, html });
    if (res.ok) sent++;
  }
  return { sent, recipients: staff.length };
}
