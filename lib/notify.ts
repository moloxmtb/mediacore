import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/mail";
import { appUrl } from "@/lib/app-url";
import { eventEmail, deliverableResponseEmail, manualNotifyEmail } from "@/lib/email/templates";

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

/**
 * Notifica un evento por correo (best-effort). Un correo por destinatario, con
 * enlace al panel (interno) o al portal (cliente). El marco/copy viven en
 * lib/email (plantilla T2), acá solo se resuelven destinatarios y enlaces.
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

  const base = appUrl();
  const panelHref = base + (opts.panelPath ?? "/");
  const portalHref = base + (opts.portalPath ?? "/portal");

  if (internal.length) {
    const { subject, html } = eventEmail({
      type: opts.type,
      clientName: opts.clientName ?? null,
      title: opts.title,
      detail: opts.detail,
      audience: "internal",
      url: panelHref,
    });
    for (const to of internal) await sendEmail({ to, subject, html });
  }
  if (client.length) {
    const { subject, html } = eventEmail({
      type: opts.type,
      clientName: opts.clientName ?? null,
      title: opts.title,
      detail: opts.detail,
      audience: "client",
      url: portalHref,
    });
    for (const to of client) await sendEmail({ to, subject, html });
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
//  Reutiliza el transporte (sendEmail) y la plantilla de marca (lib/email).
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

/** Mapea filas {id, full_name} a {email, name} vía listUsers, dedup por correo. */
async function emailsForProfiles(
  admin: ReturnType<typeof createAdminClient>,
  rows: { id: string; full_name: string | null }[],
): Promise<{ email: string; name: string | null }[]> {
  if (!rows.length) return [];
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email]));
  const seen = new Set<string>();
  const out: { email: string; name: string | null }[] = [];
  for (const r of rows) {
    const email = emailById.get(r.id)?.toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push({ email, name: r.full_name ?? null });
    }
  }
  return out;
}

/**
 * Staff que puede ver FINANZAS de un cliente = SOLO owners (`is_owner`,
 * admin_role='owner'). NO usa resolveClientStaff: los ejecutivos/productores
 * ASIGNADOS igual NO ven cobros — la RLS de contracts/installments quedó
 * owner-only en el flip. Usar resolveClientStaff acá filtraría finanzas a quien
 * la RLS le niega; por eso cobros tiene su propio resolutor.
 *
 * ⚠️ `clientId` se IGNORA A PROPÓSITO. El modelo asume un ÚNICO owner global
 * (is_owner) que ve TODOS los clientes y TODOS los mundos, incluido finanzas —
 * así que los owners son los mismos para cualquier cliente. Se recibe por
 * simetría de firma con los otros resolutores y para no cambiar los llamadores
 * si algún día hubiera owners scoped por cliente.
 */
export async function resolveOwnerOnly(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se ignora a propósito (owner global); se recibe por simetría de firma
  _clientId: string,
): Promise<{ email: string; name: string | null }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "admin")
    .eq("admin_role", "owner");
  return emailsForProfiles(admin, (data ?? []) as { id: string; full_name: string | null }[]);
}

/**
 * Destinatarios del lado CLIENTE, según el "mundo" del objeto (calca el branch
 * cliente de la RLS): world='content' → owner + content; world='finance' →
 * owner + finance. Nunca cruza mundos (finanzas jamás a content, y viceversa).
 */
export async function resolveClientRecipients(
  clientId: string,
  world: "content" | "finance",
): Promise<{ email: string; name: string | null }[]> {
  const roles = world === "finance" ? ["owner", "finance"] : ["owner", "content"];
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("client_id", clientId)
    .eq("role", "client")
    .in("client_role", roles);
  return emailsForProfiles(admin, (data ?? []) as { id: string; full_name: string | null }[]);
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

  let responder = "El cliente";
  if (d.responded_by) {
    const { data: p } = await admin.from("profiles").select("full_name").eq("id", d.responded_by as string).maybeSingle();
    if (p?.full_name) responder = p.full_name as string;
  }

  const staff = await resolveClientStaff(clientId);
  if (!staff.length) return { sent: 0, recipients: 0 };

  const { subject, html } = deliverableResponseEmail({
    clientName: project?.clients?.name ?? null,
    title: d.title as string,
    decisionLabel,
    comment: d.client_comment as string | null,
    projectName: project?.name ?? null,
    responder,
    url: appUrl() + `/entregables/${opts.deliverableId}`,
  });

  let sent = 0;
  for (const r of staff) {
    const res = await sendEmail({ to: r.email, subject, html });
    if (res.ok) sent++;
  }
  return { sent, recipients: staff.length };
}

/**
 * Entregables v2 — dirección ADMIN → CLIENTE (no existía: hasta ahora el staff
 * tenía que apretar la campanita a mano después de cada corrección, y olvidarlo
 * dejaba al cliente esperando sin saber que había algo nuevo).
 *
 * Destinatarios por el motor de v1.15: resolveClientRecipients(clientId,
 * 'content') = owner + content de esa empresa. GATE DE VISIBILIDAD: no se avisa
 * de un entregable que el cliente no puede ver (invisible o en borrador), que es
 * el mismo predicado de `deliverable_sent_visible` en la RLS. Notificar sobre
 * algo = revelar que existe.
 */
export async function notifyDeliverableToClient(opts: {
  deliverableId: string;
  kind: "version" | "comentario";
  message?: string | null;
}): Promise<{ sent: number; recipients: number }> {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("deliverables")
    .select("title, approval_status, visible_to_client, projects(client_id)")
    .eq("id", opts.deliverableId)
    .maybeSingle();
  if (!d) return { sent: 0, recipients: 0 };

  // Gate: calca deliverable_sent_visible (visible + fuera de borrador).
  if (!d.visible_to_client || d.approval_status === "borrador") {
    return { sent: 0, recipients: 0 };
  }
  const clientId = (d.projects as unknown as { client_id: string } | null)?.client_id;
  if (!clientId) return { sent: 0, recipients: 0 };

  const recipients = await resolveClientRecipients(clientId, "content");
  if (!recipients.length) return { sent: 0, recipients: 0 };

  const fallback =
    opts.kind === "version"
      ? "Subimos una versión nueva para tu revisión."
      : "Te respondimos en este entregable.";
  const { subject, html } = manualNotifyEmail({
    objectLabel: "Entregable",
    title: d.title as string,
    message: (opts.message ?? "").trim() || fallback,
    url: appUrl() + "/portal/aprobaciones",
    audience: "cliente",
  });

  let sent = 0;
  for (const r of recipients) {
    const res = await sendEmail({ to: r.email, subject, html });
    if (res.ok) sent++;
  }
  return { sent, recipients: recipients.length };
}
