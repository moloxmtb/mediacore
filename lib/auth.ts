import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientRole } from "@/lib/types";

export type Role = "admin" | "client";

export type SessionProfile = {
  userId: string;
  email: string | null;
  role: Role;
  clientRole: ClientRole | null; // solo para role === "client"
  fullName: string | null;
  clientId: string | null;
};

/**
 * Devuelve el usuario autenticado y su perfil, o null si no hay sesión.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_role, full_name, client_id")
    .eq("id", user.id)
    .single();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile?.role === "admin" ? "admin" : "client",
    clientRole: (profile?.client_role as ClientRole | null) ?? null,
    fullName: profile?.full_name ?? null,
    clientId: profile?.client_id ?? null,
  };
}

// ---- Mundos del portal según el sub-rol del cliente ----
export function canSeeContent(role: ClientRole | null): boolean {
  return role === "owner" || role === "content";
}
export function canSeeFinance(role: ClientRole | null): boolean {
  return role === "owner" || role === "finance";
}

/** Home del portal según el rol (finanzas puro no tiene mundo de contenido). */
export function portalHome(role: ClientRole | null): string {
  return canSeeContent(role) ? "/portal/que-viene" : "/portal/finanzas";
}

/**
 * Gatea una página del portal a un mundo. Si el rol no puede verlo, redirige a
 * su home. Es defensa sobre RLS (que ya devuelve vacío), para no mostrar
 * cascarones vacíos.
 */
export async function requirePortalWorld(
  world: "content" | "finance",
): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session || session.role !== "client") redirect("/login");
  const ok =
    world === "content"
      ? canSeeContent(session!.clientRole)
      : canSeeFinance(session!.clientRole);
  if (!ok) redirect(portalHome(session!.clientRole));
  return session!;
}
