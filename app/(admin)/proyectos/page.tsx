import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_STATUS_LABELS, formatDate } from "@/lib/format";
import { stStyle as st, projectTone } from "@/lib/estado";
import type { ProjectStatus } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  client_id: string;
  clients: { name: string; accent_color: string | null } | null;
};

const SEC = "var(--sec-proyectos)";

const IcoFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export default async function ProyectosPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, status, start_date, end_date, client_id, clients(name, accent_color)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Proyectos" subtitle="Proyectos activos por cliente" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div className="dbox">
          <div className="dbox-head">
            <span className="dh-ico"><IcoFolder /></span>
            <h3>Todos los proyectos</h3>
            <span className="dcount">{rows.length}</span>
            <div className="dhead-actions">
              <Link href="/proyectos/nuevo" className="dbtn dbtn-primary dbtn-sm">+ Nuevo proyecto</Link>
            </div>
          </div>

          {rows.length ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Inicio</th>
                  <th>Término</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="drow" style={st(projectTone[p.status])}>
                    <td>
                      <Link href={`/proyectos/${p.id}`} className="row-link">{p.name}</Link>
                    </td>
                    <td>
                      {/* Identidad de cliente: cuadradito, separado del color de estado */}
                      <Link href={`/clientes/${p.client_id}`} className="row-link" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <span className="cli-sq" style={{ background: p.clients?.accent_color ?? "var(--tx-3)" }} />
                        {p.clients?.name ?? "—"}
                      </Link>
                    </td>
                    <td><StateChip tone={projectTone[p.status]} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                    <td className="mono mut">{formatDate(p.start_date)}</td>
                    <td className="mono mut">{formatDate(p.end_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="dempty">
              <span>Aún no hay proyectos.</span>
              <Link href="/proyectos/nuevo" className="dbtn dbtn-primary dbtn-sm">+ Nuevo proyecto</Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
