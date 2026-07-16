import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PeriodForm from "@/components/admin/content/PeriodForm";
import SlideOver from "@/components/admin/SlideOver";
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

const SEC = "var(--sec-contenido)";

const IcoImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);
const IcoView = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default async function ContenidoPage() {
  const supabase = await createClient();
  const [{ data: periods }, { data: pieces }, { data: clients }] = await Promise.all([
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

  const nuevo = (
    <SlideOver title="Nuevo período" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Nuevo período</>}>
      <PeriodForm action={crearPeriodo} clients={clients ?? []} />
    </SlideOver>
  );

  return (
    <>
      <PageHeader title="Contenido" subtitle="Piezas por período para aprobación del cliente" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div className="dbox">
          <div className="dbox-head">
            <span className="dh-ico"><IcoImage /></span>
            <h3>Períodos</h3>
            <span className="dcount">{rows.length}</span>
            <div className="dhead-actions">{nuevo}</div>
          </div>
          {rows.length ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Cliente</th>
                  <th>Cadencia</th>
                  <th className="num">Piezas aprobadas</th>
                  <th>Visibilidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const c = countByPeriod.get(p.id) ?? { total: 0, aprobadas: 0 };
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/contenido/${p.id}`} className="row-link">{p.label}</Link>
                        <div className="mono" style={{ fontSize: "11.5px", color: "var(--tx-3)", marginTop: "2px" }}>
                          {formatDate(p.created_at.slice(0, 10))}
                        </div>
                      </td>
                      <td>
                        {/* Identidad de cliente = cuadradito */}
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <span className="cli-sq" style={{ background: p.clients?.accent_color ?? "var(--tx-3)" }} />
                          {p.clients?.name ?? "—"}
                        </span>
                      </td>
                      <td className="mut">{PERIOD_KIND_LABELS[p.kind]}</td>
                      <td className="num">{c.aprobadas}/{c.total}</td>
                      {/* `published` es VISIBILIDAD del período, no un estado del MAPA:
                          el semáforo de contenido vive en las piezas (MAPA §7). */}
                      <td><span className="dtype">{p.published ? "Publicado" : "Borrador"}</span></td>
                      <td className="num">
                        <div className="dacts">
                          <Link href={`/contenido/${p.id}`} className="dact" data-tip="Abrir" aria-label="Abrir">
                            <IcoView />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="dempty">
              <span>Aún no hay períodos.</span>
              {nuevo}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
