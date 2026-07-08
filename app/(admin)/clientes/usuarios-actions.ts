"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canActOnClient } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invite";
import { recordInvitation } from "@/lib/invitations";
import type { ClientRole } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };
const ROLES: ClientRole[] = ["owner", "finance", "content"];

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

/** Cliente real de un usuario (por su id), vía service_role — para autorizar
 *  sobre el cliente EFECTIVO del usuario, no el que venga en el form (anti-spoof). */
async function clientOfUser(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  if (!userId) return "";
  const { data } = await admin.from("profiles").select("client_id").eq("id", userId).maybeSingle();
  return (data?.client_id as string | null) ?? "";
}

/** Invita a un usuario: lo crea (sin contraseña) y le manda el enlace por Resend. */
export async function invitarUsuario(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const clientId = str(fd, "client_id");
  const email = str(fd, "email").toLowerCase();
  const clientRole = str(fd, "client_role") as ClientRole;

  if (!clientId) return { error: "Falta el cliente." };
  // Guard: owner o staff asignado a ESTE cliente (el nuevo usuario colgará de él).
  if (!(await canActOnClient(clientId))) return { error: "No autorizado." };
  if (!email.includes("@")) return { error: "Correo inválido." };
  if (!ROLES.includes(clientRole)) return { error: "Rol inválido." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (error || !data?.user) {
    const dup = (error?.message ?? "").toLowerCase().includes("already");
    return { error: dup ? "Ya existe un usuario con ese correo." : "No se pudo invitar: " + (error?.message ?? "") };
  }

  const { error: pErr } = await admin.from("profiles").upsert({
    id: data.user.id,
    role: "client",
    client_id: clientId,
    client_role: clientRole,
    full_name: email,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "No se pudo asignar el perfil: " + pErr.message };
  }

  const sent = await sendInviteEmail({
    to: email,
    hashedToken: data.properties.hashed_token,
    type: "invite",
    variant: "portal",
  });

  // Registro de la invitación: aceptada → 'enviado' + message-id; si no salió →
  // 'fallido' + motivo. El webhook luego avanza el estado por su message_id.
  await recordInvitation(admin, {
    client_id: clientId,
    user_id: data.user.id,
    email,
    kind: "invite",
    message_id: sent.id,
    status: sent.ok ? "enviado" : "fallido",
    error: sent.ok ? null : sent.error,
  });

  revalidatePath(`/clientes/${clientId}`);
  return {
    error: null,
    ok: true,
    ...(sent.ok ? {} : { error: "Usuario creado, pero el correo no salió (revisa RESEND_API_KEY)." }),
  };
}

/** Reenvía el enlace para fijar contraseña (usuario ya existente). */
export async function reenviarInvitacion(fd: FormData): Promise<void> {
  const email = str(fd, "email").toLowerCase();
  const clientId = str(fd, "client_id");
  if (!email) return;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data) return;
  // Guard sobre el cliente EFECTIVO del usuario (no el del form) antes de enviar.
  if (!(await canActOnClient(await clientOfUser(admin, data.user?.id ?? "")))) return;
  const sent = await sendInviteEmail({
    to: email,
    hashedToken: data.properties.hashed_token,
    type: "recovery",
    variant: "recovery",
  });
  // Cada reenvío es un registro nuevo (historial completo, no se pisa).
  await recordInvitation(admin, {
    client_id: clientId,
    user_id: data.user?.id ?? null,
    email,
    kind: "recovery",
    message_id: sent.id,
    status: sent.ok ? "enviado" : "fallido",
    error: sent.ok ? null : sent.error,
  });
  revalidatePath(`/clientes/${clientId}`);
}

export async function cambiarRolUsuario(fd: FormData): Promise<void> {
  const userId = str(fd, "user_id");
  const clientId = str(fd, "client_id");
  const clientRole = str(fd, "client_role") as ClientRole;
  if (!userId || !ROLES.includes(clientRole)) return;
  const admin = createAdminClient();
  // Guard sobre el cliente EFECTIVO del usuario objetivo (no el del form).
  if (!(await canActOnClient(await clientOfUser(admin, userId)))) return;
  await admin.from("profiles").update({ client_role: clientRole }).eq("id", userId);
  revalidatePath(`/clientes/${clientId}`);
}

export async function eliminarUsuario(fd: FormData): Promise<void> {
  const userId = str(fd, "user_id");
  const clientId = str(fd, "client_id");
  if (!userId) return;
  const admin = createAdminClient();
  // Guard sobre el cliente EFECTIVO del usuario objetivo (no el del form).
  if (!(await canActOnClient(await clientOfUser(admin, userId)))) return;
  await admin.auth.admin.deleteUser(userId);
  revalidatePath(`/clientes/${clientId}`);
}
