"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null };

export async function fijarClave(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo fijar la contraseña: " + error.message };

  redirect("/portal"); // la landing enruta al mundo del rol
}
