import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PeriodForm from "@/components/admin/content/PeriodForm";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_KIND_LABELS } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { crearPeriodo } from "./actions";
import type { ContentPeriodKind } from "@/lib/types";

type PeriodRow = {
  id: string;
  label: string;
  kind: ContentPeriodKind;
  published: boolean;
  created_at: string;
  client_id: string;
  clients: { name: string; accent_color: string | null } | null;
};

export default async function ContenidoPage() {
  const supabase = await createClient();
  const [{ data: periods }, { data: pieces }, { data: clients }] =
    await Promise.all([
      supabase
        .from("content_periods")
        .select("id, label, kind, published, created_at, client_id, clients(name, accent_color)")
        .order("created_at", { ascending: false }),
      supabase.from("content_pieces").select("period_id, status"),
      supabase.from("clients").select("id, name").order("name"),
    ]);

  const rows = (periods ?? []) as unknown as PeriodRow[];
  const countByPeriod = new Map<string, { total: number; aprobadas: number }>();
  for (const p of pieces ?? []) {
    const c = countByPeriod.get(p.period_id) ?? { total: 0, aprobadas: 0 };
    c.total++;
    if (p.status === "aprobada") c.aprobadas++;
    countByPeriod.set(p.period_id, c);
  }

  return (
    <>
      <PageHeader
        title="Contenido"
        subtitle="Piezas por período para aprobación del cliente"
      />
      <div className="app-content">
        <details style={{ marginBottom: "18px" }}>
          <summary className="btn btn-primary" style={{ width: "fit-content" }}>
            + Nuevo período
          </summary>
          <div className="card" style={{ marginTop: "12px" }}>
            <div className="card-body">
              <PeriodForm action={crearPeriodo} clients={clients ?? []} />
            </div>
          </div>
        </details>

        <div className="card">
          <div className="card-head">
            <h3>Períodos</h3>
            <span className="tag">{rows.length}</span>
          </div>
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Cliente</th>
                  <th>Cadencia</th>
                  <th className="num">Piezas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const c = countByPeriod.get(p.id) ?? { total: 0, aprobadas: 0 };
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/contenido/${p.id}`} className="row-link">
                          {p.label}
                        </Link>
                        <div className="meta">{formatDate(p.created_at.slice(0, 10))}</div>
                      </td>
                      <td>
                        <div className="cli">
                          <span className="dot" style={{ background: p.clients?.accent_color ?? "#3dbdcb" }} />
                          {p.clients?.name ?? "—"}
                        </div>
                      </td>
                      <td>{PERIOD_KIND_LABELS[p.kind]}</td>
                      <td className="num mono">
                        {c.aprobadas}/{c.total}
                      </td>
                      <td>
                        <span className={`badge ${p.published ? "b-accent" : "b-idle"}`}>
                          {p.published ? "Publicado" : "Borrador"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">Aún no hay períodos. Crea el primero.</div>
          )}
        </div>
      </div>
    </>
  );
}
