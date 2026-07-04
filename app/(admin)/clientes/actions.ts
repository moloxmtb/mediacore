"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClientSegment,
  ClientStatus,
  ContractModality,
  CurrencyKind,
} from "@/lib/types";

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

// Mapeo calendario de Google ↔ cliente (clients.google_calendar_id).
export async function guardarCalendarioCliente(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  const cal = opt(fd, "google_calendar_id");
  if (!id) return { error: "Falta el cliente." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ google_calendar_id: cal })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar el calendario: " + error.message };

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/integraciones");
  revalidatePath("/gantt");
  return { error: null, ok: true };
}

// ============================================================
//  CONTRATOS (viven dentro de la ficha del cliente)
// ============================================================
const MODALITIES: ContractModality[] = ["proyecto", "plazo_fijo", "retainer"];

function parseContract(fd: FormData) {
  const currency = str(fd, "currency") as CurrencyKind;
  const modality = str(fd, "modality") as ContractModality;
  const net = Number(
    str(fd, "net_amount").replace(/\./g, "").replace(",", "."),
  );
  const billingDay = parseInt(str(fd, "billing_day") || "1", 10);
  const count = parseInt(str(fd, "installments_count") || "", 10);
  return {
    modality,
    currency,
    has_iva: fd.get("has_iva") != null,
    net_uf: currency === "UF" ? net : null,
    net_clp_fixed: currency === "CLP" ? Math.round(net) : null,
    installments_count:
      modality === "retainer" ? null : Number.isFinite(count) ? count : null,
    billing_day: Number.isFinite(billingDay)
      ? Math.min(Math.max(billingDay, 1), 28)
      : 1,
    start_date: str(fd, "start_date"),
    end_date: opt(fd, "end_date"),
    status: str(fd, "status") || "activo",
    notes: opt(fd, "notes"),
  };
}

function validContract(c: ReturnType<typeof parseContract>): string | null {
  if (!MODALITIES.includes(c.modality)) return "Modalidad inválida.";
  if (c.currency !== "UF" && c.currency !== "CLP") return "Moneda inválida.";
  const net = c.currency === "UF" ? c.net_uf : c.net_clp_fixed;
  if (net == null || !Number.isFinite(net) || net <= 0)
    return "El neto por cuota debe ser un número mayor que cero.";
  if (!c.start_date) return "La fecha de inicio es obligatoria.";
  if (c.modality !== "retainer" && (!c.installments_count || c.installments_count < 1))
    return "Indica el número de cuotas (1 o más) para proyecto o plazo fijo.";
  return null;
}

export async function crearContrato(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const clientId = str(fd, "client_id");
  const c = parseContract(fd);
  if (!clientId) return { error: "Falta el cliente." };
  const err = validContract(c);
  if (err) return { error: err };

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
  const err = validContract(c);
  if (err) return { error: err };

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
