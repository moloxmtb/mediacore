import { createClient } from "@/lib/supabase/server";

/**
 * Último valor de UF cacheado en uf_values. El refresco diario (cron) y la
 * fuente (mindicador.cl / CMF) llegan en la Fase 5; por ahora se lee el más
 * reciente disponible para convertir contratos en UF a pesos.
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
