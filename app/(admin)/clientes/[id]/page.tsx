import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ClientForm from "@/components/admin/ClientForm";
import ContractForm from "@/components/admin/ContractForm";
import CalendarMapForm from "@/components/admin/CalendarMapForm";
import UserForm from "@/components/admin/UserForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestUf } from "@/lib/uf";
import { getConnectionStatus, listCalendars } from "@/lib/google";
import {
  cambiarRolUsuario,
  crearUsuario,
  eliminarUsuario,
} from "../usuarios-actions";
import type { ClientRole } from "@/lib/types";
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
  CLIENT_ROLE_LABELS,
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
import { generarCuotaMes, generarCuotasPorTramos } from "@/app/(admin)/cobros/actions";
import TramosEditor from "@/components/admin/TramosEditor";

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

  // Usuarios del portal de este cliente (correos vía service_role).
  const adminClient = createAdminClient();
  const [{ data: memberProfiles }, { data: userList }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, client_role")
      .eq("client_id", id)
      .eq("role", "client"),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailById = new Map(
    (userList?.users ?? []).map((u) => [u.id, u.email ?? "—"]),
  );
  const portalUsers = (memberProfiles ?? []).map((p) => ({
    id: p.id as string,
    email: emailById.get(p.id as string) ?? "—",
    client_role: (p.client_role as ClientRole) ?? "content",
  }));

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

          {/* Usuarios del portal */}
          <div className="card">
            <div className="card-head">
              <h3>Usuarios del portal</h3>
              <span className="tag">{portalUsers.length}</span>
            </div>
            {portalUsers.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Correo</th>
                    <th>Rol en el portal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {portalUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="mono">{u.email}</td>
                      <td>
                        <form action={cambiarRolUsuario} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="client_id" value={cl.id} />
                          <select
                            name="client_role"
                            defaultValue={u.client_role}
                            style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", padding: "6px 8px", fontFamily: "inherit" }}
                          >
                            {Object.entries(CLIENT_ROLE_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-sm" type="submit">Guardar</button>
                        </form>
                      </td>
                      <td className="num">
                        <DeleteButton
                          action={eliminarUsuario}
                          hidden={{ user_id: u.id, client_id: cl.id }}
                          label="Eliminar"
                          confirm={`¿Eliminar al usuario ${u.email}? Perderá el acceso al portal.`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Este cliente aún no tiene usuarios de portal.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)" }}>
              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>
                  + Agregar usuario
                </summary>
                <div style={{ padding: "14px 2px 4px" }}>
                  <UserForm action={crearUsuario} clientId={cl.id} />
                </div>
              </details>
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
                    <div style={{ marginTop: "12px" }}>
                      {c.modality === "retainer" ? (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                          <form action={generarCuotaMes}>
                            <input type="hidden" name="contract_id" value={c.id} />
                            <button className="btn btn-sm" type="submit">
                              Generar cuota del mes
                            </button>
                          </form>
                          <Link href="/cobros" className="btn btn-sm">
                            Ver en Cobros
                          </Link>
                        </div>
                      ) : (
                        <details>
                          <summary className="btn btn-sm">Generar cuotas por tramos</summary>
                          <div style={{ padding: "14px 2px 4px" }}>
                            <TramosEditor
                              action={generarCuotasPorTramos}
                              contractId={c.id}
                              currency={c.currency}
                              defaultNet={c.currency === "UF" ? c.net_uf : c.net_clp_fixed}
                              defaultCount={c.installments_count ?? 1}
                            />
                            <div style={{ marginTop: "10px" }}>
                              <Link href="/cobros" className="btn btn-sm">
                                Ver en Cobros
                              </Link>
                            </div>
                          </div>
                        </details>
                      )}
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
