// Datos de ejemplo de Aprobación de contenido: un período publicado con piezas
// (imágenes SVG subidas al bucket privado) para Café Nocciola y Real Data.
// Uso: node scripts/seed-contenido.mjs   (CORRER tras fase-contenido.sql)
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function svg(label, color) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="${color}"/><text x="320" y="330" font-family="sans-serif" font-size="40" fill="#0c1013" text-anchor="middle">${label}</text></svg>`,
  );
}

const PLAN = [
  {
    clientName: "Café Nocciola", color: "#d9cf3f",
    pieces: [
      { title: "Reel receta capuccino", body: "Un capuccino perfecto en 30 segundos. #NocciolaEnCasa", status: "propuesta" },
      { title: "Carrusel de origen", body: "De la finca a tu taza: nuestro café de especialidad.", status: "propuesta" },
      { title: "Historia detrás de escena", body: "(borrador interno, aún no publicado)", status: "borrador" },
    ],
  },
  {
    clientName: "Real Data Tasaciones", color: "#3dbdcb",
    pieces: [
      { title: "Post informe mensual", body: "Las tasaciones del mes, en un vistazo.", status: "propuesta" },
    ],
  },
];

for (const grp of PLAN) {
  const { data: client } = await admin.from("clients").select("id").eq("name", grp.clientName).maybeSingle();
  if (!client) { console.log(`↷ ${grp.clientName} no existe — saltado.`); continue; }

  // Evitar duplicar: si ya tiene un período "Julio 2026", saltar.
  const { data: existing } = await admin.from("content_periods").select("id").eq("client_id", client.id).eq("label", "Julio 2026").maybeSingle();
  if (existing) { console.log(`↷ ${grp.clientName} ya tiene el período — saltado.`); continue; }

  const { data: period } = await admin.from("content_periods").insert({ client_id: client.id, kind: "mensual", label: "Julio 2026", published: true }).select("id").single();

  let n = 0;
  for (let i = 0; i < grp.pieces.length; i++) {
    const pc = grp.pieces[i];
    const { data: piece } = await admin.from("content_pieces").insert({ period_id: period.id, client_id: client.id, title: pc.title, sort_order: i, status: pc.status }).select("id").single();
    const path = `${client.id}/${piece.id}/v1.svg`;
    const { error: upErr } = await admin.storage.from("contenido").upload(path, svg(pc.title, grp.color), { upsert: true, contentType: "image/svg+xml" });
    if (upErr) console.log(`   ⚠️ imagen ${pc.title}: ${upErr.message}`);
    const { data: ver } = await admin.from("content_versions").insert({ piece_id: piece.id, version_number: 1, image_path: path, body: pc.body, note: "Versión inicial" }).select("id").single();
    await admin.from("content_pieces").update({ current_version_id: ver.id }).eq("id", piece.id);
    n++;
  }
  console.log(`✅ ${grp.clientName} — período "Julio 2026" con ${n} pieza(s) e imágenes`);
}

console.log("\nListo.");
