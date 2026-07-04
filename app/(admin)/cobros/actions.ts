"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chargeCLP } from "@/lib/billing";
import { ensureUfForBilling, refreshUf } from "@/lib/uf";
import type { Contract, Installment } from "@/lib/types";

export type FormState = { error: string | null; ok?: boolean };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

/** Fecha de hoy en zona de Chile (YYYY-MM-DD). */
function todayCL(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

function ymd(y: number, m1: number, d: number): string {
  return `${y}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Vencimiento de la cuota k (0-based) desde start_date, en el billing_day. */
function dueDate(startDate: string, k: number, day: number): string {
  const d = new Date(startDate + "T00:00:00");
  const dt = new Date(d.getFullYear(), d.getMonth() + k, 1);
  return ymd(dt.getFullYear(), dt.getMonth() + 1, Math.min(day, 28));
}

function baseCuota(c: Contract, number: number, k: number) {
  return {
    contract_id: c.id,
    client_id: c.client_id,
    number,
    currency: c.currency,
    net_uf: c.net_uf,
    net_clp_fixed: c.net_clp_fixed,
    has_iva: c.has_iva,
    iva_rate: 0.19,
    due_date: dueDate(c.start_date, k, c.billing_day),
    status: "proyectada" as const,
  };
}

// ============================================================
//  Generación de cuotas
// ============================================================

/** Proyecto / plazo fijo: genera el calendario finito (cuotas faltantes). */
export async function generarCuotas(fd: FormData): Promise<void> {
  const contractId = str(fd, "contract_id");
  if (!contractId) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  const c = data as Contract | null;
  if (!c || c.modality === "retainer") return;

  const count = c.installments_count ?? 1;
  const { data: existing } = await supabase
    .from("installments")
    .select("number")
    .eq("contract_id", contractId);
  const have = new Set((existing ?? []).map((x) => x.number));

  const rows = [];
  for (let k = 0; k < count; k++) {
    const number = k + 1;
    if (have.has(number)) continue;
    rows.push(baseCuota(c, number, k));
  }
  if (rows.length) await supabase.from("installments").insert(rows);

  revalidatePath("/cobros");
  revalidatePath(`/clientes/${c.client_id}`);
}

/** Retainer: materializa la cuota del siguiente mes. */
export async function generarCuotaMes(fd: FormData): Promise<void> {
  const contractId = str(fd, "contract_id");
  if (!contractId) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  const c = data as Contract | null;
  if (!c) return;

  const { data: last } = await supabase
    .from("installments")
    .select("number, due_date")
    .eq("contract_id", contractId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const number = (last?.number ?? 0) + 1;
  let due: string;
  if (last?.due_date) {
    const d = new Date(last.due_date + "T00:00:00");
    const dt = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    due = ymd(dt.getFullYear(), dt.getMonth() + 1, Math.min(c.billing_day, 28));
  } else {
    due = dueDate(c.start_date, 0, c.billing_day);
  }

  await supabase.from("installments").insert({
    ...baseCuota(c, number, 0),
    due_date: due,
  });

  revalidatePath("/cobros");
  revalidatePath(`/clientes/${c.client_id}`);
}

// ============================================================
//  Ciclo de vida de una cuota
// ============================================================

/** Facturar: congela la UF del día y calcula neto/IVA/total en CLP. */
export async function facturarCuota(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const dte = opt(fd, "dte_number");
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("installments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const inst = data as Installment | null;
  if (!inst || inst.status !== "proyectada") return;

  const today = todayCL();
  let uf_value: number | null = null;
  if (inst.currency === "UF") {
    uf_value = await ensureUfForBilling(today);
    if (uf_value == null) return; // sin UF no se puede congelar
  }

  const charge = chargeCLP({
    currency: inst.currency,
    net_uf: inst.net_uf,
    net_clp_fixed: inst.net_clp_fixed,
    has_iva: inst.has_iva,
    iva_rate: inst.iva_rate,
    uf_value,
  });
  if (!charge) return;

  await supabase
    .from("installments")
    .update({
      status: "facturada",
      uf_value,
      net_clp: charge.net_clp,
      iva_clp: charge.iva_clp,
      total_clp: charge.total_clp,
      issued_at: today,
      dte_number: dte ?? inst.dte_number,
    })
    .eq("id", id);

  revalidatePath("/cobros");
  revalidatePath(`/clientes/${inst.client_id}`);
  revalidatePath("/dashboard");
}

export async function marcarPagada(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("installments")
    .update({ status: "pagada", paid_at: todayCL() })
    .eq("id", id);
  revalidatePath("/cobros");
}

export async function anularCuota(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("installments").update({ status: "anulada" }).eq("id", id);
  revalidatePath("/cobros");
}

export async function eliminarCuota(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("installments").delete().eq("id", id);
  revalidatePath("/cobros");
}

/** Editar neto/vencimiento de una cuota proyectada (para escalonar montos). */
export async function actualizarCuota(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = str(fd, "id");
  if (!id) return { error: "Falta la cuota." };
  const supabase = await createClient();
  const { data: inst } = await supabase
    .from("installments")
    .select("currency, status")
    .eq("id", id)
    .maybeSingle();
  if (!inst) return { error: "No existe la cuota." };
  if (inst.status !== "proyectada")
    return { error: "Solo se editan cuotas proyectadas (aún sin facturar)." };

  const net = Number(str(fd, "net_amount").replace(/\./g, "").replace(",", "."));
  const due = str(fd, "due_date");
  if (!Number.isFinite(net) || net <= 0)
    return { error: "El neto debe ser mayor que cero." };
  if (!due) return { error: "La fecha de vencimiento es obligatoria." };

  const { error } = await supabase
    .from("installments")
    .update({
      net_uf: inst.currency === "UF" ? net : null,
      net_clp_fixed: inst.currency === "CLP" ? Math.round(net) : null,
      due_date: due,
    })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar: " + error.message };

  revalidatePath("/cobros");
  return { error: null, ok: true };
}

/** Botón "Actualizar UF": trae la UF del día de mindicador.cl. */
export async function actualizarUf(): Promise<void> {
  await refreshUf();
  revalidatePath("/cobros");
  revalidatePath("/dashboard");
}
