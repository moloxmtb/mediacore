import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminRole, ClientRole } from "@/lib/types";
import { adminHome, canSeeAdminSection, type AdminSection } from "@/lib/admin-sections";

export type Role = "admin" | "client";

export type SessionProfile = {
  userId: string;
  email: string | null;
  role: Role;
  clientRole: ClientRole | null; // solo para role === "client"
  adminRole: AdminRole | null; // solo para role === "admin"
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
    .select("role, client_role, admin_role, full_name, client_id")
    .eq("id", user.id)
    .single();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile?.role === "admin" ? "admin" : "client",
    clientRole: (profile?.client_role as ClientRole | null) ?? null,
    adminRole: (profile?.admin_role as AdminRole | null) ?? null,
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
/** Editar "Mi empresa" (antecedentes + contactos): los tres roles del cliente.
 *  Separado de canSeeFinance a propósito: el mundo financiero NO se abre a
 *  content; solo la ficha de empresa. Coincide con la RLS de client_details /
 *  client_contacts write. */
export function canEditFicha(role: ClientRole | null): boolean {
  return role === "owner" || role === "finance" || role === "content";
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

// ============================================================
//  Roles internos del equipo (admin): owner / ejecutivo / productor.
//  La matriz y los helpers puros viven en lib/admin-sections (client-safe);
//  acá solo el gate de servidor. Es conveniencia (redirige a la home del rol,
//  no 404); la protección REAL de los datos es la RLS (staff_sees_client).
// ============================================================

/**
 * Gatea una página del admin a un conjunto de sub-roles. Si el rol no puede,
 * redirige a la home del rol (conveniencia, no seguridad: la RLS ya frena los
 * datos). Devuelve la sesión para reusarla en la página.
 */
export async function requireAdminRole(section: AdminSection): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session || session.role !== "admin") redirect("/login");
  if (!canSeeAdminSection(session!.adminRole, section)) {
    redirect(adminHome(session!.adminRole));
  }
  return session!;
}
