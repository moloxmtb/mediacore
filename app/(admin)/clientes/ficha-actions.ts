"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const LOGOS_BUCKET = "logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

function ext(name: string): string {
  const e = name.split(".").pop() ?? "";
  return e && e.length <= 5 ? e.toLowerCase() : "png";
}
function opt(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return v === "" ? null : v;
}

function revalidate(clientId: string) {
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/portal/ficha");
}

/** Guarda la ficha (upsert). RLS: admin cualquiera; cliente solo la suya y si
 *  es dueño/finanzas. */
export async function guardarFicha(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const client_id = str(fd, "client_id");
  if (!client_id) return { error: "Falta el cliente." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("client_details").upsert({
    client_id,
    razon_social: opt(fd, "razon_social"),
    rut: opt(fd, "rut"),
    giro: opt(fd, "giro"),
    direccion: opt(fd, "direccion"),
    comuna: opt(fd, "comuna"),
    ciudad: opt(fd, "ciudad"),
    region: opt(fd, "region"),
    horarios: opt(fd, "horarios"),
    notas: opt(fd, "notas"),
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  });
  if (error) return { error: "No se pudo guardar la ficha: " + error.message };

  revalidate(client_id);
  return { error: null, ok: true };
}

/** Crea o edita un contacto del directorio. */
export async function guardarContacto(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = opt(fd, "id");
  const client_id = str(fd, "client_id");
  const name = str(fd, "name");
  if (!client_id) return { error: "Falta el cliente." };
  if (!name) return { error: "El nombre del contacto es obligatorio." };

  const row = {
    client_id,
    name,
    role: opt(fd, "role"),
    phone: opt(fd, "phone"),
    email: opt(fd, "email"),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("client_contacts").update(row).eq("id", id)
    : await supabase.from("client_contacts").insert(row);
  if (error) return { error: "No se pudo guardar el contacto: " + error.message };

  revalidate(client_id);
  return { error: null, ok: true };
}

export async function eliminarContacto(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const client_id = str(fd, "client_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("client_contacts").delete().eq("id", id);
  revalidate(client_id);
}

/** Sube (o reemplaza) el logo de la empresa al bucket público 'logos'.
 *  Valida que sea imagen y ≤ 2MB. Guarda la ruta en client_details.logo_path
 *  y borra el archivo anterior si lo había. RLS: escritura solo admin. */
export async function subirLogo(_p: FormState, fd: FormData): Promise<FormState> {
  const client_id = str(fd, "client_id");
  const file = fd.get("logo") as File | null;
  if (!client_id) return { error: "Falta el cliente." };
  if (!file || file.size === 0) return { error: "Elige un archivo de imagen." };
  if (!file.type.startsWith("image/")) return { error: "El archivo debe ser una imagen." };
  if (file.size > MAX_LOGO_BYTES) return { error: "La imagen supera los 2 MB. Sube una más liviana." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Ruta anterior (para borrarla tras subir la nueva).
  const { data: prev } = await supabase
    .from("client_details")
    .select("logo_path")
    .eq("client_id", client_id)
    .maybeSingle();

  const path = `${client_id}/${randomUUID()}.${ext(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(LOGOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { error: "No se pudo subir el logo: " + upErr.message };

  const { error } = await supabase.from("client_details").upsert({
    client_id,
    logo_path: path,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  });
  if (error) {
    await supabase.storage.from(LOGOS_BUCKET).remove([path]); // no dejar huérfano
    return { error: "No se pudo guardar el logo: " + error.message };
  }

  const oldPath = prev?.logo_path as string | null;
  if (oldPath && oldPath !== path) await supabase.storage.from(LOGOS_BUCKET).remove([oldPath]);

  revalidate(client_id);
  return { error: null, ok: true };
}

/** Quita el logo: borra el archivo del bucket y pone logo_path = null. */
export async function quitarLogo(fd: FormData): Promise<void> {
  const client_id = str(fd, "client_id");
  if (!client_id) return;
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("client_details")
    .select("logo_path")
    .eq("client_id", client_id)
    .maybeSingle();
  const path = cur?.logo_path as string | null;
  await supabase.from("client_details").update({ logo_path: null }).eq("client_id", client_id);
  if (path) await supabase.storage.from(LOGOS_BUCKET).remove([path]);
  revalidate(client_id);
}
