"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClientRole } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };
const ROLES: ClientRole[] = ["owner", "finance", "content"];

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

/** Doble chequeo server-side de que quien llama es admin. */
async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin";
}

export async function crearUsuario(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  if (!(await isAdmin())) return { error: "No autorizado." };
  const clientId = str(fd, "client_id");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const clientRole = str(fd, "client_role") as ClientRole;

  if (!clientId) return { error: "Falta el cliente." };
  if (!email) return { error: "El correo es obligatorio." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (!ROLES.includes(clientRole)) return { error: "Rol inválido." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return { error: "No se pudo crear el usuario: " + error.message };

  const { error: pErr } = await admin.from("profiles").upsert({
    id: data.user.id,
    role: "client",
    client_id: clientId,
    client_role: clientRole,
    full_name: email,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id); // revertir para no dejar huérfano
    return { error: "No se pudo asignar el perfil: " + pErr.message };
  }

  revalidatePath(`/clientes/${clientId}`);
  return { error: null, ok: true };
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
  await admin.auth.admin.deleteUser(userId); // borra también el perfil (cascade)
  revalidatePath(`/clientes/${clientId}`);
}
