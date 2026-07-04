import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import {
  PROJECT_STATUS_LABELS,
  formatDate,
  projectStatusBadge,
} from "@/lib/format";
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
      <div className="app-content">
        <div className="page-actions">
          <Link href="/proyectos/nuevo" className="btn btn-primary">
            + Nuevo proyecto
          </Link>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Todos los proyectos</h3>
            <span className="tag">{rows.length} registros</span>
          </div>

          {rows.length ? (
            <table>
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
                  <tr key={p.id}>
                    <td>
                      <Link href={`/proyectos/${p.id}`} className="row-link">
                        {p.name}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/clientes/${p.client_id}`} className="row-link">
                        <div className="cli">
                          <span
                            className="dot"
                            style={{ background: p.clients?.accent_color ?? "#3dbdcb" }}
                          />
                          {p.clients?.name ?? "—"}
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${projectStatusBadge(p.status)}`}>
                        {PROJECT_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {formatDate(p.start_date)}
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {formatDate(p.end_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              Aún no hay proyectos. Crea el primero con “Nuevo proyecto”.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
