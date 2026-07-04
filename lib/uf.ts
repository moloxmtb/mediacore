import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Último valor de UF cacheado en uf_values. Se usa para convertir contratos
 * en UF a pesos y para estimar cuotas aún no facturadas.
 */
export async function getLatestUf(): Promise<{
  value: number | null;
  date: string | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uf_values")
    .select("date, value")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { value: data?.value ?? null, date: data?.date ?? null };
}

/** Valor de UF para una fecha exacta (null si no está cacheada). */
export async function getUfForDate(date: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uf_values")
    .select("value")
    .eq("date", date)
    .maybeSingle();
  return data?.value ?? null;
}

const MINDICADOR_UF = "https://mindicador.cl/api/uf";

/** Trae la UF más reciente publicada por mindicador.cl (pública, sin key). */
export async function fetchUfLatest(): Promise<{
  date: string;
  value: number;
} | null> {
  try {
    const res = await fetch(MINDICADOR_UF, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const s = data?.serie?.[0];
    if (!s?.fecha || s?.valor == null) return null;
    return { date: String(s.fecha).slice(0, 10), value: Number(s.valor) };
  } catch {
    return null;
  }
}

/** Refresca la UF del día: la trae de mindicador y la hace upsert en uf_values. */
export async function refreshUf(): Promise<{ date: string; value: number } | null> {
  const uf = await fetchUfLatest();
  if (!uf) return null;
  const admin = createAdminClient();
  await admin.from("uf_values").upsert({ date: uf.date, value: uf.value });
  return uf;
}

/**
 * UF a usar para facturar el día `date`: la cacheada de ese día, o si no está,
 * se refresca desde mindicador y se devuelve la más reciente.
 */
export async function ensureUfForBilling(date: string): Promise<number | null> {
  const exact = await getUfForDate(date);
  if (exact != null) return exact;
  const refreshed = await refreshUf();
  if (refreshed?.date === date) return refreshed.value;
  const latest = await getLatestUf();
  return latest.value ?? refreshed?.value ?? null;
}
