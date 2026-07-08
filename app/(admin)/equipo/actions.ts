"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionOwner, getSessionProfile } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invite";
import type { AdminRole } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };

// La UI SOLO crea/mueve ejecutivo↔productor. Crear o promover a owner es un acto
// raro y deliberado que queda por SQL (evita segundos dueños por accidente).
const INTERNAL_ROLES: AdminRole[] = ["ejecutivo", "productor"];

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

/** Crea un MIEMBRO INTERNO (admin con admin_role, sin client_id). Función propia,
 *  separada de invitarUsuario, para que crear-admin y crear-usuario-portal nunca
 *  se crucen. La cuenta nace SIN contraseña → no tiene acceso hasta que acepta. */
export async function invitarMiembroInterno(_p: FormState, fd: FormData): Promise<FormState> {
  if (!(await isSessionOwner())) return { error: "No autorizado." };
  const nombre = str(fd, "nombre");
  const email = str(fd, "email").toLowerCase();
  const rol = str(fd, "admin_role") as AdminRole;

  if (!email.includes("@")) return { error: "Correo inválido." };
  if (!INTERNAL_ROLES.includes(rol)) return { error: "Rol inválido." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (error || !data?.user) {
    const dup = (error?.message ?? "").toLowerCase().includes("already");
    return { error: dup ? "Ya existe una cuenta con ese correo." : "No se pudo invitar: " + (error?.message ?? "") };
  }

  const { error: pErr } = await admin.from("profiles").upsert({
    id: data.user.id,
    role: "admin",
    admin_role: rol,
    client_id: null,
    full_name: nombre || email,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "No se pudo crear el miembro: " + pErr.message };
  }

  const sent = await sendInviteEmail({
    to: email,
    hashedToken: data.properties.hashed_token,
    type: "invite",
    variant: "internal",
  });

  revalidatePath("/equipo");
  return {
    error: null,
    ok: true,
    ...(sent.ok ? {} : { error: "Miembro creado, pero el correo no salió (revisa RESEND_API_KEY)." }),
  };
}

/** Cambia el sub-rol de un miembro (ejecutivo↔productor). Las asignaciones se
 *  mantienen. No toca owners ni al propio usuario (anti-lockout). */
export async function cambiarRolMiembro(fd: FormData): Promise<void> {
  if (!(await isSessionOwner())) return;
  const memberId = str(fd, "member_id");
  const rol = str(fd, "admin_role") as AdminRole;
  if (!memberId || !INTERNAL_ROLES.includes(rol)) return;

  const session = await getSessionProfile();
  if (memberId === session?.userId) return; // no cambiarse a sí mismo

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("admin_role").eq("id", memberId).maybeSingle();
  if (prof?.admin_role === "owner") return; // no degradar a un owner por UI
  await admin.from("profiles").update({ admin_role: rol }).eq("id", memberId);
  revalidatePath("/equipo");
}

/** Elimina un miembro interno. El cascade de auth.users borra su perfil y sus
 *  admin_assignments. No borra owners ni al propio usuario (anti-lockout). */
export async function eliminarMiembro(fd: FormData): Promise<void> {
  if (!(await isSessionOwner())) return;
  const memberId = str(fd, "member_id");
  if (!memberId) return;

  const session = await getSessionProfile();
  if (memberId === session?.userId) return; // no auto-eliminarse

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("admin_role").eq("id", memberId).maybeSingle();
  if (prof?.admin_role === "owner") return; // no borrar a un owner por UI
  await admin.auth.admin.deleteUser(memberId); // cascade: perfil + asignaciones
  revalidatePath("/equipo");
}

/** Asigna un cliente a un miembro. La RLS de admin_assignments ya es owner-only;
 *  el guard isSessionOwner es defensa en profundidad. */
export async function asignarCliente(fd: FormData): Promise<void> {
  if (!(await isSessionOwner())) return;
  const memberId = str(fd, "member_id");
  const clientId = str(fd, "client_id");
  if (!memberId || !clientId) return;
  const session = await getSessionProfile();
  const supabase = await createClient();
  await supabase.from("admin_assignments").upsert({
    member_id: memberId,
    client_id: clientId,
    created_by: session?.userId ?? null,
  });
  revalidatePath("/equipo");
}

/** Quita la asignación de un cliente a un miembro. */
export async function desasignarCliente(fd: FormData): Promise<void> {
  if (!(await isSessionOwner())) return;
  const memberId = str(fd, "member_id");
  const clientId = str(fd, "client_id");
  if (!memberId || !clientId) return;
  const supabase = await createClient();
  await supabase.from("admin_assignments").delete().eq("member_id", memberId).eq("client_id", clientId);
  revalidatePath("/equipo");
}
