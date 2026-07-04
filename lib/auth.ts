import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "client";

export type SessionProfile = {
  userId: string;
  email: string | null;
  role: Role;
  fullName: string | null;
  clientId: string | null;
};

/**
 * Devuelve el usuario autenticado y su perfil, o null si no hay sesión.
 * Pensado para los layouts: el middleware ya garantizó sesión y área,
 * esto solo lee el perfil para pintar nombre y rol.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, client_id")
    .eq("id", user.id)
    .single();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile?.role === "admin" ? "admin" : "client",
    fullName: profile?.full_name ?? null,
    clientId: profile?.client_id ?? null,
  };
}
