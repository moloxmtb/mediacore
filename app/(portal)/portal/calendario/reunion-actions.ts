"use server";

import { revalidatePath } from "next/cache";
import { chileLocalToISO, TZ_CL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { appUrl } from "@/lib/app-url";
import { meetingRequestEmail } from "@/lib/email/templates";

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
  // El input datetime-local del cliente viene SIN zona: se entiende como
  // hora de Chile y se guarda como el instante UTC correcto.
  const preferred_at = chileLocalToISO(preferredRaw);

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
    const [{ data: cfg }, { data: cli }, { data: prof }] = await Promise.all([
      admin.from("notification_config").select("internal_emails").eq("id", 1).maybeSingle(),
      admin.from("clients").select("name").eq("id", session.clientId).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", session.userId).maybeSingle(),
    ]);
    const to = String(cfg?.internal_emails ?? "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    if (to.length) {
      const when = preferred_at
        ? new Date(preferred_at).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: TZ_CL })
        : "sin preferencia";
      const { subject, html } = meetingRequestEmail({
        clientName: cli?.name ?? null,
        requester: (prof?.full_name as string | null) ?? session.email ?? "Un usuario",
        urgencyLabel: URGENCY_LABEL[urgency],
        when,
        reason,
        url: `${appUrl()}/clientes/${session.clientId}`,
      });
      await sendEmail({ to, subject, html });
    }
  } catch {
    // el correo es best-effort; la solicitud ya quedó registrada
  }

  revalidatePath("/portal/calendario");
  return { error: null, ok: true };
}

// ---------- Gestión desde el panel (solo admin, por RLS) ----------
// "Agendar" (crear el evento sincronizado) vive en calendario/evento-actions.ts
// (agendarYCrearEvento). Aquí queda solo el descarte.
export async function descartarSolicitud(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "").trim();
  const client_id = String(fd.get("client_id") ?? "").trim();
  const admin_note = String(fd.get("admin_note") ?? "").trim() || null;
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("meeting_requests")
    .update({ status: "descartada", admin_note, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (client_id) revalidatePath(`/clientes/${client_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/calendario");
}
