// Datos de ejemplo de la Fase 5: cuotas (installments) para los contratos
// activos, con el ciclo pagada → facturada → proyectada, para ver /cobros
// poblado. CORRER DESPUÉS de supabase/fase5.sql.
// Uso:  node scripts/seed-fase5.mjs
// Idempotente: si el contrato ya tiene cuotas, lo salta.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SEC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SEC) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(URL, SEC, { auth: { persistSession: false } });

const IVA = 0.19;
const UF_FREEZE = 39847; // UF de referencia para congelar (misma del seed de la Fase 2)

// Tres meses: mayo (pagada), junio (facturada), julio (proyectada).
const MONTHS = [
  { ym: "2026-05", status: "pagada" },
  { ym: "2026-06", status: "facturada" },
  { ym: "2026-07", status: "proyectada" },
];

function chargeCLP(currency, netUf, netClpFixed, hasIva, uf) {
  const net_clp =
    currency === "UF" ? Math.round(netUf * uf) : Math.round(netClpFixed);
  const iva_clp = hasIva ? Math.round(net_clp * IVA) : 0;
  return { net_clp, iva_clp, total_clp: net_clp + iva_clp };
}

const { data: contracts } = await admin
  .from("contracts")
  .select("id, client_id, modality, currency, has_iva, net_uf, net_clp_fixed, billing_day, status");

if (!contracts) {
  console.error("No pude leer contracts. ¿Corriste supabase/fase5.sql?");
  process.exit(1);
}

for (const c of contracts) {
  if (c.status !== "activo") continue;

  const { count } = await admin
    .from("installments")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", c.id);
  if (count && count > 0) {
    console.log(`↷  contrato ${c.id.slice(0, 8)} ya tiene cuotas — saltado.`);
    continue;
  }

  const day = Math.min(c.billing_day || 1, 28);
  let n = 0;
  for (let i = 0; i < MONTHS.length; i++) {
    const m = MONTHS[i];
    const due = `${m.ym}-${String(day).padStart(2, "0")}`;
    const row = {
      contract_id: c.id,
      client_id: c.client_id,
      number: i + 1,
      currency: c.currency,
      net_uf: c.net_uf,
      net_clp_fixed: c.net_clp_fixed,
      has_iva: c.has_iva,
      iva_rate: IVA,
      due_date: due,
      status: m.status,
    };

    if (m.status !== "proyectada") {
      const uf = c.currency === "UF" ? UF_FREEZE : null;
      const charge = chargeCLP(c.currency, c.net_uf, c.net_clp_fixed, c.has_iva, uf);
      row.uf_value = uf;
      row.net_clp = charge.net_clp;
      row.iva_clp = charge.iva_clp;
      row.total_clp = charge.total_clp;
      row.issued_at = due;
      if (m.status === "pagada") row.paid_at = due;
    }

    const { error } = await admin.from("installments").insert(row);
    if (error) console.log(`   ⚠️ cuota ${i + 1} de ${c.id.slice(0, 8)}: ${error.message}`);
    else n++;
  }
  console.log(`✅ contrato ${c.id.slice(0, 8)} (${c.currency}) — ${n} cuotas`);
}

console.log("\nListo. Abre /cobros para ver las cuotas con neto/IVA/total.");
