import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestUf } from "@/lib/uf";
import {
  CLIENT_STATUS_LABELS,
  SEGMENT_LABELS,
  clientStatusBadge,
  contractMonthlyNetCLP,
  formatCLP,
  formatDateTime,
  formatUF,
  PROJECT_STATUS_LABELS,
  projectStatusBadge,
} from "@/lib/format";
import AgendarSolicitudForm from "@/components/admin/AgendarSolicitudForm";
import type { Client, Contract, MeetingRequest, Project } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: clients }, { data: contracts }, { data: projects }, uf] =
    await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: true }),
      supabase.from("contracts").select("*"),
      supabase
        .from("projects")
        .select("*, clients(name, accent_color)")
        .order("created_at", { ascending: false }),
      getLatestUf(),
    ]);

  const clientList = (clients ?? []) as Client[];
  const contractList = (contracts ?? []) as Contract[];
  const projectList = (projects ?? []) as (Project & {
    clients: { name: string; accent_color: string | null } | null;
  })[];

  // Contrato activo representativo por cliente.
  const activeByClient = new Map<string, Contract>();
  for (const c of contractList) {
    if (c.status !== "activo") continue;
    if (!activeByClient.has(c.client_id)) activeByClient.set(c.client_id, c);
  }

  // Ingreso recurrente mensual: suma de contratos activos.
  let monthlyTotal = 0;
  let activeUfTotal = 0;
  for (const c of contractList) {
    if (c.status !== "activo") continue;
    const m = contractMonthlyNetCLP(c, uf.value);
    if (m != null) monthlyTotal += m;
    if (c.currency === "UF") activeUfTotal += c.net_uf ?? 0;
  }

  const activeClients = clientList.filter((c) => c.status === "activo").length;
  const proposals = clientList.filter((c) => c.status === "propuesta").length;
  const activeProjects = projectList.filter((p) => p.status === "activo");

  // Bandeja global de solicitudes de reunión pendientes (todas las empresas).
  const { data: reqData } = await supabase
    .from("meeting_requests")
    .select("*")
    .eq("status", "pendiente")
    .order("created_at", { ascending: false })
    .limit(20);
  const pendingReqs = (reqData ?? []) as MeetingRequest[];
  const clientNameById = new Map(clientList.map((c) => [c.id, c.name]));
  let reqEmailById = new Map<string, string>();
  if (pendingReqs.length) {
    const { data: userList } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    reqEmailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? "—"]));
  }

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle="Cartera de clientes y estado del mes en curso"
      />
      <div className="app-content">
        <div className="kpis">
          <div className="kpi accent">
            <div className="k">Ingreso recurrente / mes</div>
            <div className="v mono">{formatCLP(monthlyTotal)}</div>
            <div className="m">
              <b>{formatUF(activeUfTotal)}</b> en contratos ·{" "}
              {contractList.filter((c) => c.status === "activo").length} activos
            </div>
          </div>
          <div className="kpi">
            <div className="k">Clientes en cartera</div>
            <div className="v mono">{clientList.length}</div>
            <div className="m">
              <b>{activeClients}</b> activos
            </div>
          </div>
          <div className="kpi">
            <div className="k">Proyectos en curso</div>
            <div className="v mono">{activeProjects.length}</div>
            <div className="m">
              <b>{projectList.length}</b> en total
            </div>
          </div>
          <div className="kpi">
            <div className="k">Propuestas en evaluación</div>
            <div className="v mono">{proposals}</div>
            <div className="m">clientes por cerrar</div>
          </div>
        </div>

        {pendingReqs.length > 0 && (
          <div className="card" style={{ marginBottom: "18px" }}>
            <div className="card-head">
              <h3>Solicitudes de reunión pendientes</h3>
              <span className="tag">{pendingReqs.length}</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {pendingReqs.map((r) => (
                <div key={r.id} style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        <Link href={`/clientes/${r.client_id}`} className="row-link">{clientNameById.get(r.client_id) ?? "Cliente"}</Link>
                        {" — "}{r.reason}
                      </div>
                      <div className="meta" style={{ marginTop: "3px" }}>
                        {reqEmailById.get(r.requested_by) ?? "—"} · urgencia {r.urgency}
                        {r.preferred_at ? ` · preferida ${formatDateTime(r.preferred_at)}` : ""}
                      </div>
                    </div>
                    <span className={`badge ${r.urgency === "alta" ? "b-bad" : r.urgency === "media" ? "b-warn" : "b-idle"}`}>
                      {r.urgency}
                    </span>
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <AgendarSolicitudForm requestId={r.id} clientId={r.client_id} clientName={clientNameById.get(r.client_id) ?? "el cliente"} preferredAt={r.preferred_at} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid-2">
          {/* Clientes y tarifa */}
          <div className="card">
            <div className="card-head">
              <h3>Clientes y tarifa mensual</h3>
              {uf.value != null && (
                <span className="tag">UF {formatCLP(uf.value)}</span>
              )}
            </div>
            {clientList.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="num">Tarifa mensual</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {clientList.map((cl) => {
                    const con = activeByClient.get(cl.id);
                    const monthly = con ? contractMonthlyNetCLP(con, uf.value) : null;
                    return (
                      <tr key={cl.id}>
                        <td>
                          <Link href={`/clientes/${cl.id}`} className="row-link">
                            <div className="cli">
                              <span
                                className="dot"
                                style={{ background: cl.accent_color ?? "#3dbdcb" }}
                              />
                              <div>
                                <div>{cl.name}</div>
                                <div className="meta">{SEGMENT_LABELS[cl.segment]}</div>
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="num">
                          <div className="amount mono">
                            {monthly != null ? formatCLP(monthly) : "—"}
                            {con?.currency === "UF" && (
                              <span className="uf">{formatUF(con.net_uf)}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${clientStatusBadge(cl.status)}`}>
                            {CLIENT_STATUS_LABELS[cl.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty">Sin clientes todavía.</div>
            )}
          </div>

          {/* Proyectos en curso */}
          <div className="card">
            <div className="card-head">
              <h3>Proyectos en curso</h3>
              <span className="tag">{activeProjects.length}</span>
            </div>
            {activeProjects.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Proyecto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {activeProjects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/proyectos/${p.id}`} className="row-link">
                          <div>
                            <div>{p.name}</div>
                            <div className="meta">{p.clients?.name ?? "—"}</div>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <span className={`badge ${projectStatusBadge(p.status)}`}>
                          {PROJECT_STATUS_LABELS[p.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Sin proyectos activos.</div>
            )}
          </div>
        </div>

        <div className="note">
          <p style={{ margin: 0 }}>
            La conversión UF, las tarifas y el estado de pago son la capa
            interna: no se muestran en el portal del cliente. La emisión del DTE
            sigue ocurriendo en el SII o Nubox; el registro de cobros llega en la
            Fase 5.
          </p>
        </div>
      </div>
    </>
  );
}
