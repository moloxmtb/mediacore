"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/mail";
import { appUrl } from "@/lib/app-url";
import type { ClientRole } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };
const ROLES: ClientRole[] = ["owner", "finance", "content"];

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin";
}

function confirmLink(hashedToken: string, type: "invite" | "recovery"): string {
  return `${appUrl()}/auth/confirm?token_hash=${hashedToken}&type=${type}&next=${encodeURIComponent("/fijar-clave")}`;
}

function inviteHtml(link: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1d23">
    <div style="border-left:4px solid #3dbdcb;padding:16px 20px;background:#f6f8f9;border-radius:8px">
      <h2 style="margin:0 0 8px;font-size:17px">Te invitaron al portal de Color Media</h2>
      <div style="font-size:14px;color:#444;line-height:1.5">Crea tu contraseña para entrar a tu portal y revisar tus proyectos, contenido y avances.</div>
      <a href="${link}" style="display:inline-block;margin-top:16px;background:#3dbdcb;color:#0c1013;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px">Fijar mi contraseña</a>
      <p style="font-size:12px;color:#888;margin-top:14px">El enlace vence pronto. Si no lo pediste, ignora este correo.</p>
    </div>
  </div>`;
}

/** Invita a un usuario: lo crea (sin contraseña) y le manda el enlace por Resend. */
export async function invitarUsuario(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  if (!(await isAdmin())) return { error: "No autorizado." };
  const clientId = str(fd, "client_id");
  const email = str(fd, "email").toLowerCase();
  const clientRole = str(fd, "client_role") as ClientRole;

  if (!clientId) return { error: "Falta el cliente." };
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

  const sent = await sendEmail({
    to: email,
    subject: "Te invitaron al portal de Color Media",
    html: inviteHtml(confirmLink(data.properties.hashed_token, "invite")),
  });

  revalidatePath(`/clientes/${clientId}`);
  return {
    error: null,
    ok: true,
    ...(sent ? {} : { error: "Usuario creado, pero el correo no salió (revisa RESEND_API_KEY)." }),
  };
}

/** Reenvía el enlace para fijar contraseña (usuario ya existente). */
export async function reenviarInvitacion(fd: FormData): Promise<void> {
  if (!(await isAdmin())) return;
  const email = str(fd, "email").toLowerCase();
  const clientId = str(fd, "client_id");
  if (!email) return;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data) return;
  await sendEmail({
    to: email,
    subject: "Fija tu contraseña — Color Media",
    html: inviteHtml(confirmLink(data.properties.hashed_token, "recovery")),
  });
  revalidatePath(`/clientes/${clientId}`);
}

export async function cambiarRolUsuario(fd: FormData): Promise<void> {
  if (!(await isAdmin())) return;
  const userId = str(fd, "user_id");
  const clientId = str(fd, "client_id");
  const clientRole = str(fd, "client_role") as ClientRole;
  if (!userId || !ROLES.includes(clientRole)) return;
  const admin = createAdminClient();
  await admin.from("profiles").update({ client_role: clientRole }).eq("id", userId);
  revalidatePath(`/clientes/${clientId}`);
}

export async function eliminarUsuario(fd: FormData): Promise<void> {
  if (!(await isAdmin())) return;
  const userId = str(fd, "user_id");
  const clientId = str(fd, "client_id");
  if (!userId) return;
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath(`/clientes/${clientId}`);
}
