"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
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
