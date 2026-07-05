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

// ---------- Estrategia (por cliente, solo admin) ----------
export async function guardarEstrategia(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const client_id = str(fd, "client_id");
  if (!client_id) return { error: "Falta el cliente." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("client_strategy").upsert({
    client_id,
    objetivo: opt(fd, "objetivo"),
    publico: opt(fd, "publico"),
    mensajes_clave: opt(fd, "mensajes_clave"),
    cuerpo: opt(fd, "cuerpo"),
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  });
  if (error) return { error: "No se pudo guardar la estrategia: " + error.message };

  revalidatePath(`/clientes/${client_id}`);
  revalidatePath("/portal/estrategia");
  return { error: null, ok: true };
}

// ---------- Plan contratado por alcance (por cliente, solo admin) ----------
export async function guardarPlanItem(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = opt(fd, "id");
  const client_id = str(fd, "client_id");
  const name = str(fd, "name");
  const status = str(fd, "status") === "activo" ? "activo" : "pendiente";
  if (!client_id) return { error: "Falta el cliente." };
  if (!name) return { error: "El nombre del ítem es obligatorio." };

  const row = { client_id, name, description: opt(fd, "description"), status };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("client_plan_items").update(row).eq("id", id)
    : await supabase.from("client_plan_items").insert(row);
  if (error) return { error: "No se pudo guardar el ítem: " + error.message };

  revalidatePath(`/clientes/${client_id}`);
  revalidatePath("/portal/plan");
  return { error: null, ok: true };
}

export async function eliminarPlanItem(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const client_id = str(fd, "client_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("client_plan_items").delete().eq("id", id);
  revalidatePath(`/clientes/${client_id}`);
  revalidatePath("/portal/plan");
}
