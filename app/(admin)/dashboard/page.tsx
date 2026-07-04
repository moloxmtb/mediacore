import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getLatestUf } from "@/lib/uf";
import {
  CLIENT_STATUS_LABELS,
  SEGMENT_LABELS,
  clientStatusBadge,
  contractMonthlyCLP,
  formatCLP,
  formatUF,
  PROJECT_STATUS_LABELS,
  projectStatusBadge,
} from "@/lib/format";
import type { Client, Contract, Project } from "@/lib/types";

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
    const m = contractMonthlyCLP(c, uf.value);
    if (m != null) monthlyTotal += m;
    if (c.currency === "UF") activeUfTotal += c.base_amount;
  }

  const activeClients = clientList.filter((c) => c.status === "activo").length;
  const proposals = clientList.filter((c) => c.status === "propuesta").length;
  const activeProjects = projectList.filter((p) => p.status === "activo");

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
                    const monthly = con ? contractMonthlyCLP(con, uf.value) : null;
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
                              <span className="uf">{formatUF(con.base_amount)}</span>
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
