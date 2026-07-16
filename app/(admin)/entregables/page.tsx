import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NuevoEntregableForm from "@/components/admin/NuevoEntregableForm";
import SlideOver from "@/components/admin/SlideOver";
import StateChip from "@/components/admin/StateChip";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { deliverableApprovalLabel, formatDate } from "@/lib/format";
import { stStyle as st, deliverableApprovalTone } from "@/lib/estado";
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

const SEC = "var(--sec-entregables)";

const IcoPackage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
  </svg>
);
const IcoView = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

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

  const nuevo = (
    <SlideOver title="Nuevo entregable (borrador)" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Nuevo entregable</>}>
      <NuevoEntregableForm projects={projects} />
    </SlideOver>
  );

  return (
    <>
      <PageHeader title="Entregables" subtitle="Piezas, manuales y reportes — con aprobación del cliente" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div className="dbox">
          <div className="dbox-head">
            <span className="dh-ico"><IcoPackage /></span>
            <h3>Todos los entregables</h3>
            <span className="dcount">{rows.length}</span>
            <div className="dhead-actions">{nuevo}</div>
          </div>

          {rows.length ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Entregable</th>
                  <th>Proyecto</th>
                  <th>Estado</th>
                  <th>Enviado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  // Lista del flujo de aprobación: manda approval_status (MAPA §6a).
                  const tone = deliverableApprovalTone[d.approval_status];
                  return (
                    <tr key={d.id} className="drow" style={st(tone)}>
                      <td>
                        <Link href={`/entregables/${d.id}`} className="row-link">{d.title}</Link>
                      </td>
                      <td className="mut">
                        {d.projects?.name ?? "—"}
                        {d.projects?.clients?.name ? (
                          <div style={{ fontSize: "12px", color: "var(--tx-3)" }}>{d.projects.clients.name}</div>
                        ) : null}
                      </td>
                      <td>
                        <StateChip tone={tone} label={deliverableApprovalLabel(d.approval_status, d.responded_at)} />
                      </td>
                      <td className="mono mut">{d.sent_at ? formatDate(d.sent_at.slice(0, 10)) : "—"}</td>
                      <td className="num">
                        <div className="dacts">
                          <Link href={`/entregables/${d.id}`} className="dact" data-tip="Abrir" aria-label="Abrir">
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
              <span>Aún no hay entregables.</span>
              {nuevo}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
