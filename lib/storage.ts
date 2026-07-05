import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "contenido";

/**
 * Genera signed URLs (cortas) para rutas del bucket privado 'contenido'.
 * Se firma server-side; los llamadores solo pasan rutas de piezas que ya
 * pasaron por RLS en la base, así que el cliente nunca recibe una URL de
 * contenido ajeno.
 */
export async function signImages(
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(clean, expiresIn);
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

export async function signImage(
  path: string | null,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null;
  const map = await signImages([path], expiresIn);
  return map[path] ?? null;
}

const FACTURAS_BUCKET = "facturas";

/**
 * Firma URLs (cortas) del bucket privado 'facturas'. Igual que signImages:
 * los llamadores solo pasan rutas de cuotas que ya pasaron RLS (SELECT de
 * installments limitado a admin o dueño/finanzas del propio cliente), así que
 * un cliente nunca recibe la URL de una factura ajena.
 */
export async function signInvoices(
  paths: string[],
  expiresIn = 120,
): Promise<Record<string, string>> {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(FACTURAS_BUCKET)
    .createSignedUrls(clean, expiresIn);
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

export { BUCKET as CONTENT_BUCKET, FACTURAS_BUCKET };
