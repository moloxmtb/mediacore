"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientSegment, ClientStatus, CurrencyKind } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };

const SEGMENTS: ClientSegment[] = [
  "corporativo",
  "asuntos_publicos",
  "pyme",
  "personal_brand",
];
const STATUSES: ClientStatus[] = ["activo", "propuesta", "inactivo"];

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

// ============================================================
//  CLIENTES
// ============================================================
export async function crearCliente(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const name = str(fd, "name");
  const segment = str(fd, "segment") as ClientSegment;
  const status = str(fd, "status") as ClientStatus;

  if (!name) return { error: "El nombre del cliente es obligatorio." };
  if (!SEGMENTS.includes(segment)) return { error: "Segmento inválido." };
  if (!STATUSES.includes(status)) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      segment,
      status,
      rut: opt(fd, "rut"),
      contact_email: opt(fd, "contact_email"),
      accent_color: opt(fd, "accent_color") ?? "#3DBDCB",
    })
    .select("id")
    .single();

  if (error) return { error: "No se pudo crear el cliente: " + error.message };

  revalidatePath("/clientes");
  revalidatePath("/dashboard");
  redirect(`/clientes/${data.id}`);
}

export async function actualizarCliente(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const name = str(fd, "name");
  const segment = str(fd, "segment") as ClientSegment;
  const status = str(fd, "status") as ClientStatus;

  if (!id) return { error: "Falta el identificador del cliente." };
  if (!name) return { error: "El nombre del cliente es obligatorio." };
  if (!SEGMENTS.includes(segment)) return { error: "Segmento inválido." };
  if (!STATUSES.includes(status)) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name,
      segment,
      status,
      rut: opt(fd, "rut"),
      contact_email: opt(fd, "contact_email"),
      accent_color: opt(fd, "accent_color") ?? "#3DBDCB",
    })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar: " + error.message };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

export async function eliminarCliente(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("clients").delete().eq("id", id);
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
  redirect("/clientes");
}

// ============================================================
//  CONTRATOS (viven dentro de la ficha del cliente)
// ============================================================
function parseContract(fd: FormData) {
  const currency = str(fd, "currency") as CurrencyKind;
  const base = Number(str(fd, "base_amount").replace(/\./g, "").replace(",", "."));
  const billingDay = parseInt(str(fd, "billing_day") || "1", 10);
  return {
    currency,
    base_amount: base,
    indexed_uf: fd.get("indexed_uf") != null || currency === "UF",
    billing_day: Number.isFinite(billingDay)
      ? Math.min(Math.max(billingDay, 1), 28)
      : 1,
    start_date: str(fd, "start_date"),
    end_date: opt(fd, "end_date"),
    status: str(fd, "status") || "activo",
    notes: opt(fd, "notes"),
  };
}

export async function crearContrato(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const clientId = str(fd, "client_id");
  const c = parseContract(fd);

  if (!clientId) return { error: "Falta el cliente." };
  if (c.currency !== "UF" && c.currency !== "CLP")
    return { error: "Moneda inválida." };
  if (!Number.isFinite(c.base_amount) || c.base_amount <= 0)
    return { error: "El monto base debe ser un número mayor que cero." };
  if (!c.start_date) return { error: "La fecha de inicio es obligatoria." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .insert({ client_id: clientId, ...c });

  if (error) return { error: "No se pudo crear el contrato: " + error.message };

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

export async function actualizarContrato(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const clientId = str(fd, "client_id");
  const c = parseContract(fd);

  if (!id) return { error: "Falta el identificador del contrato." };
  if (!Number.isFinite(c.base_amount) || c.base_amount <= 0)
    return { error: "El monto base debe ser un número mayor que cero." };
  if (!c.start_date) return { error: "La fecha de inicio es obligatoria." };

  const supabase = await createClient();
  const { error } = await supabase.from("contracts").update(c).eq("id", id);

  if (error) return { error: "No se pudo actualizar el contrato: " + error.message };

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

export async function eliminarContrato(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const clientId = str(fd, "client_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("contracts").delete().eq("id", id);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/dashboard");
}
