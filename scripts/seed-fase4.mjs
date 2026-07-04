// Datos de ejemplo de la Fase 4: hitos de calendario creados en el panel
// (source='panel', sin Google todavía) para ver los marcadores en la Gantt.
// Uso:  node scripts/seed-fase4.mjs
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// Idempotente: si el proyecto ya tiene hitos, lo salta.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SEC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SEC) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(URL, SEC, { auth: { persistSession: false } });

const HITOS = {
  "Relanzamiento Q3": [
    { title: "Reunión de kickoff Q3", starts_at: "2026-07-03T10:00:00", kind: "reunion", description: "Alineación de objetivos y calendario del trimestre." },
    { title: "Rodaje cápsula 01 (FX3)", starts_at: "2026-07-28T09:00:00", kind: "rodaje", description: "Jornada de rodaje de 'La Promesa'." },
    { title: "Deadline entrega identidad", starts_at: "2026-07-31T18:00:00", kind: "deadline", description: "Fecha límite de validación del manual de marca." },
  ],
  "Campaña de temporada": [
    { title: "Rodaje de producto", starts_at: "2026-07-15T09:30:00", kind: "rodaje", description: "Sesión FX3 línea enduro." },
    { title: "Publicación campaña", starts_at: "2026-08-12T12:00:00", kind: "hito", description: "Salida de la campaña de temporada." },
  ],
};

for (const [projectName, hitos] of Object.entries(HITOS)) {
  const { data: project } = await admin
    .from("projects")
    .select("id, client_id")
    .eq("name", projectName)
    .maybeSingle();

  if (!project) {
    console.log(`↷  Proyecto "${projectName}" no encontrado — saltado.`);
    continue;
  }

  const { count } = await admin
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  if (count && count > 0) {
    console.log(`↷  "${projectName}" ya tiene hitos — saltado.`);
    continue;
  }

  let n = 0;
  for (const h of hitos) {
    const { error } = await admin.from("calendar_events").insert({
      client_id: project.client_id,
      project_id: project.id,
      title: h.title,
      description: h.description,
      starts_at: h.starts_at,
      kind: h.kind,
      source: "panel",
      visible_to_client: true,
    });
    if (error) console.log(`   ⚠️ hito ${h.title}: ${error.message}`);
    else n++;
  }
  console.log(`✅ ${projectName} — ${n} hitos`);
}

console.log("\nListo. Abre /gantt para ver los marcadores de hitos sobre la línea.");
