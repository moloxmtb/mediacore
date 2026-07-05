"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";

export type FormState = { error: string | null; ok?: boolean };

const URGENCY_LABEL: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta" };

/**
 * El cliente solicita una reunión a Color Media. La RLS de meeting_requests
 * garantiza que solo cree la suya (requested_by = auth.uid(), su cliente). Tras
 * registrarla, avisa al admin por correo (best-effort).
 */
export async function solicitarReunion(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const reason = String(fd.get("reason") ?? "").trim();
  const preferredRaw = String(fd.get("preferred_at") ?? "").trim();
  const urgency = String(fd.get("urgency") ?? "media");
  if (!reason) return { error: "Cuéntanos el motivo de la reunión." };
  if (!["baja", "media", "alta"].includes(urgency)) return { error: "Urgencia inválida." };

  const session = await getSessionProfile();
  if (!session || session.role !== "client" || !session.clientId) {
    return { error: "Sesión inválida." };
  }

  // datetime-local llega como "YYYY-MM-DDTHH:mm" (hora local); lo guardamos tal cual.
  const preferred_at = preferredRaw ? new Date(preferredRaw).toISOString() : null;

  const supabase = await createClient();
  const { error } = await supabase.from("meeting_requests").insert({
    client_id: session.clientId,
    requested_by: session.userId,
    reason,
    preferred_at,
    urgency,
  });
  if (error) return { error: "No se pudo enviar la solicitud: " + error.message };

  // Aviso al admin (correos internos configurados). Best-effort.
  try {
    const admin = createAdminClient();
    const [{ data: cfg }, { data: cli }] = await Promise.all([
      admin.from("notification_config").select("internal_emails").eq("id", 1).maybeSingle(),
      admin.from("clients").select("name").eq("id", session.clientId).maybeSingle(),
    ]);
    const to = String(cfg?.internal_emails ?? "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    if (to.length) {
      const when = preferred_at
        ? new Date(preferred_at).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" })
        : "sin preferencia";
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      await sendEmail({
        to,
        subject: `Solicitud de reunión · ${cli?.name ?? "Cliente"} (urgencia ${URGENCY_LABEL[urgency]})`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1d23">
          <div style="border-left:4px solid #3dbdcb;padding:16px 20px;background:#f6f8f9;border-radius:8px">
            <h2 style="margin:0 0 8px;font-size:17px">Nueva solicitud de reunión</h2>
            <div style="font-size:14px;color:#444;line-height:1.6">
              <b>Cliente:</b> ${cli?.name ?? "—"}<br/>
              <b>Solicitó:</b> ${session.email ?? "—"}<br/>
              <b>Urgencia:</b> ${URGENCY_LABEL[urgency]}<br/>
              <b>Preferida:</b> ${when}<br/>
              <b>Motivo:</b> ${reason.replace(/</g, "&lt;")}
            </div>
            <a href="${appUrl}/clientes/${session.clientId}" style="display:inline-block;margin-top:16px;background:#3dbdcb;color:#0c1013;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px">Ver en el panel</a>
          </div>
          <p style="font-size:11px;color:#999;margin-top:14px">Color Media · aviso automático</p>
        </div>`,
      });
    }
  } catch {
    // el correo es best-effort; la solicitud ya quedó registrada
  }

  revalidatePath("/portal/calendario");
  return { error: null, ok: true };
}

// ---------- Gestión desde el panel (solo admin, por RLS) ----------
export async function agendarSolicitud(fd: FormData): Promise<void> {
  await setEstadoSolicitud(fd, "agendada");
}
export async function descartarSolicitud(fd: FormData): Promise<void> {
  await setEstadoSolicitud(fd, "descartada");
}
async function setEstadoSolicitud(fd: FormData, status: "agendada" | "descartada") {
  const id = String(fd.get("id") ?? "").trim();
  const client_id = String(fd.get("client_id") ?? "").trim();
  const admin_note = String(fd.get("admin_note") ?? "").trim() || null;
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("meeting_requests")
    .update({ status, admin_note, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (client_id) revalidatePath(`/clientes/${client_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/calendario");
}
