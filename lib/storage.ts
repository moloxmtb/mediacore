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

const MINUTAS_BUCKET = "minutas";

/**
 * Firma URLs (cortas) del bucket privado 'minutas' (PDF de acta de reunión).
 * Igual que signInvoices: los llamadores solo pasan rutas de minutas que ya
 * pasaron RLS (SELECT de meeting_minutes limitado a staff o cliente owner/
 * content con reunión visible), así que un cliente nunca recibe la URL de una
 * minuta ajena ni de una reunión interna.
 */
export async function signMinutas(
  paths: string[],
  expiresIn = 120,
): Promise<Record<string, string>> {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(MINUTAS_BUCKET)
    .createSignedUrls(clean, expiresIn);
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

export async function signMinuta(
  path: string | null,
  expiresIn = 120,
): Promise<string | null> {
  if (!path) return null;
  const map = await signMinutas([path], expiresIn);
  return map[path] ?? null;
}

const ENTREGABLES_BUCKET = "entregables";

/**
 * Firma una URL (corta) del bucket privado 'entregables'. Los llamadores solo
 * pasan rutas que ya pasaron RLS (SELECT de deliverable_files limitado a staff o
 * cliente con entregable enviado). `download` fuerza el nombre de descarga.
 */
export async function signEntregable(
  path: string | null,
  downloadName?: string | null,
  expiresIn = 120,
): Promise<string | null> {
  if (!path) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(ENTREGABLES_BUCKET)
    .createSignedUrl(path, expiresIn, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}

export { BUCKET as CONTENT_BUCKET, FACTURAS_BUCKET, MINUTAS_BUCKET, ENTREGABLES_BUCKET };
