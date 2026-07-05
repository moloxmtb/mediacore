import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Markdown from "@/components/Markdown";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClientStrategy } from "@/lib/types";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="kv-row">
      <span className="kv-k">{label}</span>
      <span className="kv-v">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

export default async function PortalEstrategiaPage() {
  const session = await getSessionProfile();
  if (!session || session.role !== "client") redirect("/login");

  const supabase = await createClient();
  // RLS limita a la estrategia del propio cliente.
  const { data } = await supabase.from("client_strategy").select("*").maybeSingle();
  const s = (data as ClientStrategy | null) ?? null;

  const vacio =
    !s ||
    (!s.objetivo?.trim() &&
      !s.publico?.trim() &&
      !s.mensajes_clave?.trim() &&
      !s.cuerpo?.trim());

  return (
    <>
      <PageHeader title="Estrategia" subtitle="El enfoque que definimos para tu marca" />
      <div className="app-content">
        <div className="stack">
          {vacio ? (
            <div className="card">
              <div className="empty">Todavía no publicamos la estrategia. Pronto la verás aquí.</div>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="card-head">
                  <h3>Foco</h3>
                </div>
                <div className="card-body kv">
                  <Row label="Objetivo" value={s.objetivo} />
                  <Row label="Público" value={s.publico} />
                  <Row label="Mensajes clave" value={s.mensajes_clave} />
                </div>
              </div>

              {s.cuerpo?.trim() && (
                <div className="card">
                  <div className="card-head">
                    <h3>Narrativa</h3>
                  </div>
                  <div className="card-body">
                    <Markdown>{s.cuerpo}</Markdown>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
