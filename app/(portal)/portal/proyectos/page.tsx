import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PROJECT_STATUS_LABELS,
  formatDate,
  projectStatusBadge,
} from "@/lib/format";
import type { Project } from "@/lib/types";

export default async function PortalProyectosPage() {
  await requirePortalWorld("content");
  const supabase = await createClient();
  // RLS: el cliente solo ve sus propios proyectos.
  const { data } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];

  return (
    <>
      <PageHeader title="Proyectos" subtitle="El trabajo que tenemos contigo" />
      <div className="app-content">
        <div className="card">
          <div className="card-head">
            <h3>Tus proyectos</h3>
            <span className="tag">{projects.length}</span>
          </div>
          {projects.length ? (
            <table>
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Estado</th>
                  <th>Inicio</th>
                  <th>Término</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/portal/proyectos/${p.id}`} className="row-link">
                        {p.name}
                      </Link>
                      {p.description && (
                        <div className="meta" style={{ marginTop: "3px" }}>
                          {p.description}
                        </div>
                      )}
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
            <div className="empty">Aún no hay proyectos que mostrar.</div>
          )}
        </div>
      </div>
    </>
  );
}
