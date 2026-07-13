import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NuevoEntregableForm from "@/components/admin/NuevoEntregableForm";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { deliverableApprovalLabel, deliverableApprovalBadge, formatDate } from "@/lib/format";
import type { DeliverableApproval } from "@/lib/types";

type Row = {
  id: string;
  title: string;
  approval_status: DeliverableApproval;
  responded_at: string | null;
  sent_at: string | null;
  project_id: string;
  projects: { name: string; client_id: string; clients: { name: string } | null } | null;
};

export default async function EntregablesPage() {
  await requireAdminRole("entregables");
  const supabase = await createClient();

  const [{ data }, { data: projData }] = await Promise.all([
    supabase
      .from("deliverables")
      .select("id, title, approval_status, responded_at, sent_at, project_id, projects(name, client_id, clients(name))")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name, clients(name)").order("created_at", { ascending: false }),
  ]);

  const rows = (data ?? []) as unknown as Row[];
  const projects = ((projData ?? []) as unknown as { id: string; name: string; clients: { name: string } | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.clients?.name ?? "—",
  }));

  return (
    <>
      <PageHeader title="Entregables" subtitle="Piezas, manuales y reportes — con aprobación del cliente" />
      <div className="app-content">
        <div className="stack">
          {/* Nuevo borrador */}
          <div className="card">
            <div className="card-head"><h3>Nuevo entregable (borrador)</h3></div>
            <div className="card-body">
              <NuevoEntregableForm projects={projects} />
            </div>
          </div>

          {/* Lista */}
          <div className="card">
            <div className="card-head">
              <h3>Todos los entregables</h3>
              <span className="tag">{rows.length} registros</span>
            </div>
            {rows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Entregable</th>
                    <th>Proyecto</th>
                    <th>Estado</th>
                    <th>Enviado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/entregables/${d.id}`} className="row-link">{d.title}</Link>
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {d.projects?.name ?? "—"}
                        {d.projects?.clients?.name ? <div className="meta">{d.projects.clients.name}</div> : null}
                      </td>
                      <td>
                        <span className={`badge ${deliverableApprovalBadge(d.approval_status, d.responded_at)}`}>
                          {deliverableApprovalLabel(d.approval_status, d.responded_at)}
                        </span>
                      </td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {d.sent_at ? formatDate(d.sent_at.slice(0, 10)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Aún no hay entregables. Crea el primero arriba.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
