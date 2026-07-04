// Datos de ejemplo para ver el panel poblado (Fase 2).
// Uso:  node scripts/seed-datos-ejemplo.mjs
// Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// Es idempotente: si un cliente ya existe (por nombre), lo salta.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SEC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SEC) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(URL, SEC, { auth: { persistSession: false } });

// UF de referencia (la fuente y el cron llegan en la Fase 5).
{
  const { error } = await admin
    .from("uf_values")
    .upsert({ date: "2026-07-03", value: 39847 });
  console.log(error ? "❌ UF: " + error.message : "✅ UF 2026-07-03 = 39.847");
}

const CLIENTS = [
  {
    name: "Novamed",
    segment: "corporativo",
    status: "activo",
    accent_color: "#3dbdcb",
    contact_email: "comunicaciones@novamed.cl",
    contract: { currency: "UF", base_amount: 45, start_date: "2025-03-01", billing_day: 5 },
    projects: [
      { name: "Relanzamiento Q3", status: "activo", start_date: "2026-07-01", end_date: "2026-09-30", description: "Diagnóstico, identidad, producción audiovisual y lanzamiento." },
    ],
  },
  {
    name: "Consejo del Litio",
    segment: "asuntos_publicos",
    status: "activo",
    accent_color: "#c957b8",
    contact_email: "prensa@consejolitio.cl",
    contract: { currency: "UF", base_amount: 60, start_date: "2026-01-01", billing_day: 10 },
    projects: [
      { name: "Vocería y asuntos públicos", status: "activo", start_date: "2026-01-15", end_date: null, description: "Minutas de vocería, puntos de mensaje y relación con prensa." },
    ],
  },
  {
    name: "DVO Suspension Chile",
    segment: "corporativo",
    status: "activo",
    accent_color: "#4fbf7b",
    contact_email: "marketing@dvochile.cl",
    contract: { currency: "UF", base_amount: 22, start_date: "2024-08-01", billing_day: 5 },
    projects: [
      { name: "Campaña de temporada", status: "activo", start_date: "2026-07-01", end_date: "2026-08-31", description: "Concepto, rodaje de producto, edición y pauta." },
    ],
  },
  {
    name: "Café Nocciola",
    segment: "pyme",
    status: "activo",
    accent_color: "#d9cf3f",
    contact_email: "hola@nocciola.cl",
    contract: { currency: "CLP", base_amount: 650000, start_date: "2025-05-01", billing_day: 5 },
    projects: [
      { name: "Contenido mensual", status: "activo", start_date: "2026-07-01", end_date: "2026-07-31", description: "Parrilla, producción de piezas, cápsulas y reporte." },
    ],
  },
  {
    name: "Condor Cycles",
    segment: "pyme",
    status: "activo",
    accent_color: "#d95757",
    contact_email: "info@condorcycles.cl",
    contract: { currency: "CLP", base_amount: 480000, start_date: "2025-02-01", billing_day: 1 },
    projects: [
      { name: "Identidad v2", status: "cerrado", start_date: "2026-06-01", end_date: "2026-06-28", description: "Manual de marca y set de piezas base." },
    ],
  },
  {
    name: "F. Sánchez — Boutique automotriz",
    segment: "personal_brand",
    status: "propuesta",
    accent_color: "#5b626d",
    contact_email: "f.sanchez@boutiqueauto.cl",
    contract: null,
    projects: [],
  },
];

for (const c of CLIENTS) {
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("name", c.name)
    .maybeSingle();

  if (existing) {
    console.log(`↷  ${c.name} ya existe — saltado.`);
    continue;
  }

  const { data: client, error: cErr } = await admin
    .from("clients")
    .insert({
      name: c.name,
      segment: c.segment,
      status: c.status,
      accent_color: c.accent_color,
      contact_email: c.contact_email,
    })
    .select("id")
    .single();
  if (cErr) {
    console.log(`❌ ${c.name}: ${cErr.message}`);
    continue;
  }

  if (c.contract) {
    const { error } = await admin.from("contracts").insert({
      client_id: client.id,
      currency: c.contract.currency,
      base_amount: c.contract.base_amount,
      indexed_uf: c.contract.currency === "UF",
      billing_day: c.contract.billing_day,
      start_date: c.contract.start_date,
      status: "activo",
    });
    if (error) console.log(`   ⚠️ contrato: ${error.message}`);
  }

  for (const p of c.projects) {
    const { error } = await admin.from("projects").insert({
      client_id: client.id,
      name: p.name,
      status: p.status,
      start_date: p.start_date,
      end_date: p.end_date,
      description: p.description,
    });
    if (error) console.log(`   ⚠️ proyecto ${p.name}: ${error.message}`);
  }

  console.log(
    `✅ ${c.name} — ${c.contract ? "1 contrato" : "sin contrato"}, ${c.projects.length} proyecto(s)`,
  );
}

console.log("\nListo. Abre /dashboard y /clientes para ver el panel poblado.");
