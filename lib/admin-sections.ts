import type { AdminRole } from "@/lib/types";

/**
 * Lógica PURA de secciones/roles internos del admin. Sin imports de servidor
 * (no toca supabase/server ni next/headers), para poder usarse tanto en
 * componentes de servidor (lib/auth → requireAdminRole) como de cliente
 * (AdminNav). El gating de UI que vive acá es conveniencia; la seguridad real
 * es la RLS (staff_sees_client).
 */

/** Secciones del admin y qué sub-roles internos las ven. Fuente única para el
 *  nav y para requireAdminRole. Coincide con la matriz del PLAN. */
export const ADMIN_SECTIONS = {
  dashboard: ["owner", "ejecutivo"],
  clientes: ["owner"],
  proyectos: ["owner", "ejecutivo", "productor"],
  gantt: ["owner", "ejecutivo", "productor"],
  calendario: ["owner", "ejecutivo", "productor"],
  entregables: ["owner", "ejecutivo", "productor"],
  contenido: ["owner", "ejecutivo", "productor"],
  cobros: ["owner"],
  acciones: ["owner", "ejecutivo"],
  integraciones: ["owner"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminSection = keyof typeof ADMIN_SECTIONS;

export function canSeeAdminSection(role: AdminRole | null, section: AdminSection): boolean {
  return !!role && (ADMIN_SECTIONS[section] as readonly AdminRole[]).includes(role);
}

/** Home del panel según el sub-rol: productor no tiene Resumen → cae en Proyectos.
 *  Lo usan el logo del sidebar, el middleware y requireAdminRole. */
export function adminHome(role: AdminRole | null): string {
  return role === "productor" ? "/proyectos" : "/dashboard";
}
