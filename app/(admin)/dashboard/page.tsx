import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { getLatestUf } from "@/lib/uf";
import {
  CLIENT_STATUS_LABELS,
  SEGMENT_LABELS,
  contractMonthlyNetCLP,
  formatCLP,
  formatDateTime,
  formatUF,
  PROJECT_STATUS_LABELS,
} from "@/lib/format";
import AgendarSolicitudForm from "@/components/admin/AgendarSolicitudForm";
import StateChip from "@/components/admin/StateChip";
import { stStyle as st, clientTone, projectTone, meetingRequestTone } from "@/lib/estado";
import type { Client, Contract, MeetingRequest, Project } from "@/lib/types";

// Resumen = NEUTRO (el brief no le asigna tono de sección: no es un objeto).
const SEC = "var(--tx-2)";

const IcoUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>
);
const IcoFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
const IcoCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
);

export default async function DashboardPage() {
  // owner + ejecutivo (productor cae en /proyectos). El ejecutivo ve un Resumen
  // ACOTADO a sus clientes (la RLS ya lo filtra) y SIN cifras de finanzas.
  const session = await requireAdminRole("dashboard");
  const isOwner = session.adminRole === "owner";

  const supabase = await createClient();

  // Operativo, con la sesión del usuario (RLS): para un ejecutivo, clients /
  // projects / meeting_requests ya vienen acotados a sus clientes asignados.
  const [{ data: clients }, { data: projects }, uf] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: true }),
    supabase
      .from("projects")
      .select("*, clients(name, accent_color)")
      .order("created_at", { ascending: false }),
    getLatestUf(),
  ]);

  const clientList = (clients ?? []) as Client[];
  const projectList = (projects ?? []) as (Project & {
    clients: { name: string; accent_color: string | null } | null;
  })[];

  // FINANZAS: solo owner. Para un no-owner NO se consulta `contracts` ni se
  // calcula ninguna cifra de plata (la RLS igual la bloquearía; esto además
  // evita el cálculo). Una sola fuente de verdad: la RLS filtra, no una función.
  let contractList: Contract[] = [];
  let monthlyTotal = 0;
  let activeUfTotal = 0;
  const activeByClient = new Map<string, Contract>();
  if (isOwner) {
    const { data: contracts } = await supabase.from("contracts").select("*");
    contractList = (contracts ?? []) as Contract[];
    for (const c of contractList) {
      if (c.status !== "activo") continue;
      if (!activeByClient.has(c.client_id)) activeByClient.set(c.client_id, c);
      const m = contractMonthlyNetCLP(c, uf.value);
      if (m != null) monthlyTotal += m;
      if (c.currency === "UF") activeUfTotal += c.net_uf ?? 0;
    }
  }

  const activeClients = clientList.filter((c) => c.status === "activo").length;
  const proposals = clientList.filter((c) => c.status === "propuesta").length;
  const activeProjects = projectList.filter((p) => p.status === "activo");

  // Solicitudes de reunión pendientes (RLS-scoped a sus clientes). Sin
  // createAdminClient: el email del solicitante requería service_role (bypass
  // de RLS) y se quitó; la tarjeta muestra cliente + motivo + urgencia.
  const { data: reqData } = await supabase
    .from("meeting_requests")
    .select("*")
    .eq("status", "pendiente")
    .order("created_at", { ascending: false })
    .limit(20);
  const pendingReqs = (reqData ?? []) as MeetingRequest[];
  const clientNameById = new Map(clientList.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle={isOwner ? "Cartera de clientes y estado del mes en curso" : "Tus clientes y su actividad"}
      />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        {/* Métricas: NEUTRAS (una métrica no es un estado) */}
        <div className="mgrid">
          {isOwner && (
            <div className="mcard">
              <div className="mk">Ingreso recurrente / mes</div>
              <div className="mv">{formatCLP(monthlyTotal)}</div>
              <div className="mm">
                <b>{formatUF(activeUfTotal)}</b> en contratos · {contractList.filter((c) => c.status === "activo").length} activos
              </div>
            </div>
          )}
          <div className="mcard">
            <div className="mk">{isOwner ? "Clientes en cartera" : "Tus clientes"}</div>
            <div className="mv">{clientList.length}</div>
            <div className="mm"><b>{activeClients}</b> activos</div>
          </div>
          <div className="mcard">
            <div className="mk">Proyectos en curso</div>
            <div className="mv">{activeProjects.length}</div>
            <div className="mm"><b>{projectList.length}</b> en total</div>
          </div>
          <div className="mcard">
            <div className="mk">Propuestas en evaluación</div>
            <div className="mv">{proposals}</div>
            <div className="mm">clientes por cerrar</div>
          </div>
        </div>

        {pendingReqs.length > 0 && (
          <div className="dbox" style={{ marginBottom: "18px", ["--sec" as string]: "var(--sec-calendario)" } as CSSProperties}>
            <div className="dbox-head">
              <span className="dh-ico"><IcoCal /></span>
              <h3>Solicitudes de reunión pendientes</h3>
              <span className="dcount">{pendingReqs.length}</span>
            </div>
            <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {pendingReqs.map((r) => (
                <div key={r.id} style={{ borderBottom: "0.5px solid var(--v2-line)", paddingBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        <Link href={`/clientes/${r.client_id}`} className="row-link">{clientNameById.get(r.client_id) ?? "Cliente"}</Link>
                        {" — "}{r.reason}
                      </div>
                      <div className="mut" style={{ marginTop: "3px", fontSize: "12px" }}>
                        {r.preferred_at ? `preferida ${formatDateTime(r.preferred_at)}` : "sin fecha preferida"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flex: "none" }}>
                      <span className="dtype">urgencia {r.urgency}</span>
                      <StateChip tone={meetingRequestTone.pendiente} label="Pendiente" />
                    </div>
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
          {/* Clientes y tarifa — SOLO owner (finanzas). */}
          {isOwner && (
            <div className="dbox" style={{ ["--sec" as string]: "var(--sec-clientes)" } as CSSProperties}>
              <div className="dbox-head">
                <span className="dh-ico"><IcoUsers /></span>
                <h3>Clientes y tarifa mensual</h3>
                {uf.value != null && <span className="dcount">UF {formatCLP(uf.value)}</span>}
              </div>
              {clientList.length ? (
                <table className="dtable">
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
                        <tr key={cl.id} className="drow" style={st(clientTone[cl.status])}>
                          <td>
                            <Link href={`/clientes/${cl.id}`} className="row-link" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                              <span className="cli-sq" style={{ background: cl.accent_color ?? "var(--tx-3)" }} />
                              <span>
                                <span style={{ display: "block" }}>{cl.name}</span>
                                <span className="mut" style={{ fontSize: "11.5px" }}>{SEGMENT_LABELS[cl.segment]}</span>
                              </span>
                            </Link>
                          </td>
                          <td className="num">
                            <div className="mono">
                              {monthly != null ? formatCLP(monthly) : "—"}
                              {con?.currency === "UF" && (
                                <span className="uf">{formatUF(con.net_uf)}</span>
                              )}
                            </div>
                          </td>
                          <td><StateChip tone={clientTone[cl.status]} label={CLIENT_STATUS_LABELS[cl.status]} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="dempty">Sin clientes todavía.</div>
              )}
            </div>
          )}

          {/* Proyectos en curso — todos los roles (acotado por RLS). */}
          <div className="dbox" style={{ ["--sec" as string]: "var(--sec-proyectos)" } as CSSProperties}>
            <div className="dbox-head">
              <span className="dh-ico"><IcoFolder /></span>
              <h3>Proyectos en curso</h3>
              <span className="dcount">{activeProjects.length}</span>
            </div>
            {activeProjects.length ? (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Proyecto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {activeProjects.map((p) => (
                    <tr key={p.id} className="drow" style={st(projectTone[p.status])}>
                      <td>
                        <Link href={`/proyectos/${p.id}`} className="row-link">
                          <span style={{ display: "block" }}>{p.name}</span>
                          <span className="mut" style={{ fontSize: "11.5px" }}>{p.clients?.name ?? "—"}</span>
                        </Link>
                      </td>
                      <td><StateChip tone={projectTone[p.status]} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">Sin proyectos activos.</div>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="note">
            <p style={{ margin: 0 }}>
              La conversión UF, las tarifas y el estado de pago son la capa
              interna: no se muestran en el portal del cliente. La emisión del DTE
              sigue ocurriendo en el SII o Nubox; el registro de cobros llega en la
              Fase 5.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
