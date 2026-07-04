import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ClientForm from "@/components/admin/ClientForm";
import ContractForm from "@/components/admin/ContractForm";
import CalendarMapForm from "@/components/admin/CalendarMapForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { createClient } from "@/lib/supabase/server";
import { getLatestUf } from "@/lib/uf";
import { getConnectionStatus, listCalendars } from "@/lib/google";
import {
  CLIENT_STATUS_LABELS,
  SEGMENT_LABELS,
  contractNetLabel,
  contractMonthlyNetCLP,
  formatCLP,
  formatDate,
  projectStatusBadge,
  PROJECT_STATUS_LABELS,
  clientStatusBadge,
} from "@/lib/format";
import type { Client, Contract, Project } from "@/lib/types";
import {
  actualizarCliente,
  actualizarContrato,
  crearContrato,
  eliminarCliente,
  eliminarContrato,
  guardarCalendarioCliente,
} from "../actions";
import { generarCuotas, generarCuotaMes } from "@/app/(admin)/cobros/actions";

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: contracts }, { data: projects }, uf] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("contracts")
        .select("*")
        .eq("client_id", id)
        .order("start_date", { ascending: false }),
      supabase
        .from("projects")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      getLatestUf(),
    ]);

  if (!client) notFound();

  const cl = client as Client;
  const contractList = (contracts ?? []) as Contract[];
  const projectList = (projects ?? []) as Project[];

  const gStatus = await getConnectionStatus();
  let calendars: { id: string; summary: string; primary: boolean }[] = [];
  if (gStatus.connected) {
    try {
      calendars = await listCalendars();
    } catch {
      calendars = [];
    }
  }

  return (
    <>
      <PageHeader title={cl.name} subtitle={`${SEGMENT_LABELS[cl.segment]} · ficha de cliente`} />
      <div className="app-content">
        <Link href="/clientes" className="back-link">
          ← Volver a clientes
        </Link>

        <div className="stack">
          {/* Ficha editable */}
          <div className="card">
            <div className="card-head">
              <h3>Ficha del cliente</h3>
              <span className={`badge ${clientStatusBadge(cl.status)}`}>
                {CLIENT_STATUS_LABELS[cl.status]}
              </span>
            </div>
            <div className="card-body">
              <ClientForm
                action={actualizarCliente}
                client={cl}
                submitLabel="Guardar cambios"
              />
              <div style={{ marginTop: "18px", borderTop: "1px solid var(--border-soft)", paddingTop: "16px" }}>
                <DeleteButton
                  action={eliminarCliente}
                  hidden={{ id: cl.id }}
                  label="Eliminar cliente"
                  confirm={`¿Eliminar a ${cl.name}? Se borrarán también sus contratos y proyectos. Esta acción no se puede deshacer.`}
                />
              </div>
            </div>
          </div>

          {/* Calendario de Google */}
          <div className="card">
            <div className="card-head">
              <h3>Calendario de Google</h3>
              {cl.google_calendar_id ? (
                <span className="badge b-ok">Mapeado</span>
              ) : (
                <span className="badge b-idle">Sin mapear</span>
              )}
            </div>
            <div className="card-body">
              <CalendarMapForm
                action={guardarCalendarioCliente}
                clientId={cl.id}
                current={cl.google_calendar_id}
                calendars={calendars}
                connected={gStatus.connected}
              />
            </div>
          </div>

          {/* Contratos */}
          <div className="card">
            <div className="card-head">
              <h3>Contratos</h3>
              <span className="tag">{contractList.length}</span>
            </div>

            {contractList.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Tarifa base</th>
                    <th className="num">Monto del mes</th>
                    <th>Vigencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {contractList.map((c) => {
                    const monthly = contractMonthlyNetCLP(c, uf.value);
                    return (
                      <tr key={c.id}>
                        <td className="mono">
                          {contractNetLabel(c)}{" "}
                          {c.currency === "UF" ? (
                            <span className="badge b-accent" style={{ marginLeft: "6px" }}>UF</span>
                          ) : (
                            <span className="badge b-idle" style={{ marginLeft: "6px" }}>CLP</span>
                          )}
                        </td>
                        <td className="num mono">
                          {monthly != null ? formatCLP(monthly) : "—"}
                        </td>
                        <td className="mono" style={{ color: "var(--muted)" }}>
                          {formatDate(c.start_date)}
                          {c.end_date ? ` → ${formatDate(c.end_date)}` : ""}
                        </td>
                        <td>
                          <span className={`badge ${c.status === "activo" ? "b-ok" : c.status === "pausado" ? "b-warn" : "b-idle"}`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty">Este cliente aún no tiene contratos.</div>
            )}

            {/* Editores inline por contrato + alta */}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
              {contractList.map((c) => (
                <details key={c.id}>
                  <summary className="btn btn-sm">
                    Editar contrato · {contractNetLabel(c)}
                  </summary>
                  <div style={{ padding: "16px 2px 6px" }}>
                    <ContractForm
                      action={actualizarContrato}
                      clientId={cl.id}
                      contract={c}
                      submitLabel="Guardar contrato"
                    />
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      {c.modality === "retainer" ? (
                        <form action={generarCuotaMes}>
                          <input type="hidden" name="contract_id" value={c.id} />
                          <button className="btn btn-sm" type="submit">
                            Generar cuota del mes
                          </button>
                        </form>
                      ) : (
                        <form action={generarCuotas}>
                          <input type="hidden" name="contract_id" value={c.id} />
                          <button className="btn btn-sm" type="submit">
                            Generar cuotas
                          </button>
                        </form>
                      )}
                      <Link href="/cobros" className="btn btn-sm">
                        Ver en Cobros
                      </Link>
                    </div>
                    <div style={{ marginTop: "12px" }}>
                      <DeleteButton
                        action={eliminarContrato}
                        hidden={{ id: c.id, client_id: cl.id }}
                        label="Eliminar contrato"
                        confirm="¿Eliminar este contrato?"
                      />
                    </div>
                  </div>
                </details>
              ))}

              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>
                  + Agregar contrato
                </summary>
                <div style={{ padding: "16px 2px 6px" }}>
                  <ContractForm
                    action={crearContrato}
                    clientId={cl.id}
                    submitLabel="Crear contrato"
                  />
                </div>
              </details>
            </div>
          </div>

          {/* Proyectos vinculados */}
          <div className="card">
            <div className="card-head">
              <h3>Proyectos</h3>
              <Link
                href={`/proyectos/nuevo?client=${cl.id}`}
                className="btn btn-sm btn-primary"
              >
                + Nuevo proyecto
              </Link>
            </div>
            {projectList.length ? (
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
                  {projectList.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/proyectos/${p.id}`} className="row-link">
                          {p.name}
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
              <div className="empty">Sin proyectos todavía.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
