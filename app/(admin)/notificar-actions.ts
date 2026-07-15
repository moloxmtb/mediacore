"use server";

import { appUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/mail";
import { getSessionProfile, isSessionOwner, canActOnClient } from "@/lib/auth";
import { manualNotifyEmail } from "@/lib/email/templates";
import {
  NOTIFY_REGISTRY,
  loadNotifyObject,
  resolveNotifyRecipients,
  type NotifyKind,
  type NotifyAudience,
} from "@/lib/notify-manual";

export type NotifyState = { error: string | null; ok?: boolean; sent?: number; skipped?: string };

const KINDS: NotifyKind[] = ["tarea", "reunion", "entregable", "cobro", "contenido", "bitacora", "hito"];

/**
 * Botón "notificar" contextual. Manda un correo a quien tiene permiso de ver el
 * objeto, según la audiencia elegida (equipo/cliente, sin preselección). El
 * guard de actor: cobro exige isSessionOwner(); el resto canActOnClient(). El
 * cálculo de destinatarios (gate + resolutor) vive en lib/notify-manual.
 */
export async function notificarObjeto(_prev: NotifyState, fd: FormData): Promise<NotifyState> {
  const kind = String(fd.get("kind") ?? "") as NotifyKind;
  const id = String(fd.get("id") ?? "").trim();
  const audience = String(fd.get("audience") ?? "") as NotifyAudience;
  const message = String(fd.get("message") ?? "").trim() || null;

  if (!KINDS.includes(kind) || !id) return { error: "Datos inválidos." };
  if (audience !== "equipo" && audience !== "cliente") return { error: "Elige a quién notificar." };

  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return { error: "No autorizado." };

  const obj = await loadNotifyObject(kind, id);
  if (!obj) return { error: "No se encontró el objeto." };

  // Guard de actor: cobro = solo owner (finanzas es owner-only); el resto = staff
  // que puede actuar sobre ese cliente (staff_sees_client).
  const d = NOTIFY_REGISTRY[kind];
  const allowed = d.requiresOwner ? await isSessionOwner() : await canActOnClient(obj.clientId);
  if (!allowed) return { error: "No tienes permiso para notificar este objeto." };

  const { recipients, skipped } = await resolveNotifyRecipients(kind, obj, audience);
  if (skipped) return { error: null, ok: true, sent: 0, skipped };
  if (!recipients.length) return { error: null, ok: true, sent: 0 };

  const url = appUrl() + (audience === "equipo" ? obj.panelPath : obj.portalPath);
  const { subject, html } = manualNotifyEmail({ objectLabel: d.objectLabel, title: obj.title, message, url, audience });

  let sent = 0;
  for (const r of recipients) {
    const res = await sendEmail({ to: r.email, subject, html });
    if (res.ok) sent++;
  }
  return { error: null, ok: true, sent };
}
