// Datos de ejemplo de la Fase 3: fases, entregables y acciones por fase.
// Uso:  node scripts/seed-fase3.mjs
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.
// Idempotente: si un proyecto ya tiene fases, lo salta.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SEC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SEC) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(URL, SEC, { auth: { persistSession: false } });

// Estructura: por nombre de proyecto, sus fases; cada fase con sus
// entregables y acciones. Consejo del Litio se deja SIN fases a propósito.
const PLAN = {
  "Relanzamiento Q3": [
    {
      name: "Diagnóstico y estrategia", start: "2026-07-01", end: "2026-07-15", progress: 100,
      deliverables: [{ title: "Diagnóstico comunicacional Q3", status: "aprobado", result: "Lineamientos aprobados por el directorio." }],
      actions: [{ title: "Sesión de estrategia Q3", kind: "reunion", date: "2026-07-02", description: "Diagnóstico y definición de lineamientos comunicacionales.", result: "Se priorizaron tres mensajes clave." }],
    },
    {
      name: "Desarrollo de identidad visual", start: "2026-07-10", end: "2026-07-31", progress: 60,
      deliverables: [{ title: "Manual de marca v2", status: "entregado", result: "Entregado; a la espera de validación final." }],
      actions: [],
    },
    {
      name: "Producción audiovisual (FX3)", start: "2026-07-20", end: "2026-08-20", progress: 25,
      deliverables: [{ title: "Cápsula 01 — La Promesa", status: "en_proceso", result: "Guion técnico listo; rodaje agendado." }],
      actions: [{ title: "Guion técnico cápsula 01", kind: "reporte", date: "2026-07-18", description: "Estructura narrativa y plan de rodaje.", result: "Guion aprobado para producción." }],
    },
    { name: "Plan de contenidos", start: "2026-08-01", end: "2026-08-25", progress: 0, deliverables: [], actions: [] },
    { name: "Lanzamiento y pauta", start: "2026-08-25", end: "2026-09-10", progress: 0, deliverables: [], actions: [] },
  ],
  "Campaña de temporada": [
    {
      name: "Concepto de campaña", start: "2026-07-01", end: "2026-07-11", progress: 100,
      deliverables: [{ title: "Concepto creativo temporada", status: "aprobado", result: "Aprobado por marketing." }],
      actions: [],
    },
    {
      name: "Rodaje de producto", start: "2026-07-09", end: "2026-07-23", progress: 70,
      deliverables: [{ title: "Set fotográfico línea enduro", status: "entregado", result: "120 tomas seleccionadas." }],
      actions: [{ title: "Rodaje de producto", kind: "rodaje", date: "2026-07-15", description: "Sesión FX3, línea suspensiones enduro.", result: "Material listo para edición." }],
    },
    {
      name: "Edición y post", start: "2026-07-21", end: "2026-08-08", progress: 20,
      deliverables: [],
      actions: [{ title: "Carrusel de producto", kind: "contenido", date: "2026-07-28", description: "Publicación IG, línea suspensiones enduro.", result: "Carrusel programado en Metricool." }],
    },
    { name: "Publicación y pauta", start: "2026-08-08", end: "2026-08-31", progress: 0, deliverables: [], actions: [] },
  ],
  "Contenido mensual": [
    {
      name: "Parrilla de contenidos", start: "2026-07-01", end: "2026-07-07", progress: 100,
      deliverables: [{ title: "Parrilla julio (12 piezas)", status: "aprobado", result: "Calendario aprobado por el cliente." }],
      actions: [{ title: "Calendarización de contenidos", kind: "planificacion", date: "2026-07-02", description: "Parrilla de julio, 12 piezas.", result: "12 piezas programadas." }],
    },
    {
      name: "Producción de piezas", start: "2026-07-06", end: "2026-07-25", progress: 55,
      deliverables: [], actions: [],
    },
    {
      name: "Grabación de cápsulas", start: "2026-07-13", end: "2026-07-29", progress: 40,
      deliverables: [{ title: "Cápsula receta — vertical", status: "en_proceso", result: "Rodaje FX3 S-Log3; en edición." }],
      actions: [{ title: "Grabación cápsula receta", kind: "rodaje", date: "2026-07-20", description: "Rodaje FX3 en S-Log3, formato vertical para Reels.", result: "Material grabado; pasa a edición." }],
    },
    { name: "Reporte mensual", start: "2026-07-29", end: "2026-07-31", progress: 0, deliverables: [], actions: [] },
  ],
  "Identidad v2": [
    { name: "Exploración de marca", start: "2026-06-01", end: "2026-06-10", progress: 100, deliverables: [], actions: [] },
    { name: "Sistema visual", start: "2026-06-08", end: "2026-06-22", progress: 100, deliverables: [], actions: [] },
    {
      name: "Manual y piezas", start: "2026-06-18", end: "2026-06-28", progress: 100,
      deliverables: [{ title: "Manual de marca v2", status: "aprobado", result: "Entregado y aprobado." }],
      actions: [{ title: "Entrega identidad v2", kind: "entrega", date: "2026-06-28", description: "Manual de marca y set de piezas base.", result: "Recepción conforme del cliente." }],
    },
  ],
};

for (const [projectName, phases] of Object.entries(PLAN)) {
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
    .from("phases")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  if (count && count > 0) {
    console.log(`↷  "${projectName}" ya tiene fases — saltado.`);
    continue;
  }

  let d = 0, a = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    const { data: phase, error } = await admin
      .from("phases")
      .insert({
        project_id: project.id,
        name: ph.name,
        start_date: ph.start,
        end_date: ph.end,
        progress: ph.progress,
        sort_order: i,
      })
      .select("id")
      .single();
    if (error) {
      console.log(`   ⚠️ fase ${ph.name}: ${error.message}`);
      continue;
    }

    for (const del of ph.deliverables) {
      const { error: de } = await admin.from("deliverables").insert({
        project_id: project.id,
        phase_id: phase.id,
        title: del.title,
        status: del.status,
        result: del.result,
        delivered_at: del.status === "aprobado" ? ph.end : null,
      });
      if (de) console.log(`   ⚠️ entregable ${del.title}: ${de.message}`);
      else d++;
    }

    for (const act of ph.actions) {
      const { error: ae } = await admin.from("actions").insert({
        client_id: project.client_id,
        project_id: project.id,
        phase_id: phase.id,
        action_date: act.date,
        title: act.title,
        kind: act.kind,
        description: act.description,
        result: act.result,
      });
      if (ae) console.log(`   ⚠️ acción ${act.title}: ${ae.message}`);
      else a++;
    }
  }

  console.log(`✅ ${projectName} — ${phases.length} fases, ${d} entregables, ${a} acciones`);
}

console.log("\nListo. Abre /gantt y haz clic en una barra para ver el modal.");
