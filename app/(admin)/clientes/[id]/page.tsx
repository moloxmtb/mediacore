import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ClientForm from "@/components/admin/ClientForm";
import ContractForm from "@/components/admin/ContractForm";
import CalendarMapForm from "@/components/admin/CalendarMapForm";
import UserForm from "@/components/admin/UserForm";
import FichaForm from "@/components/admin/FichaForm";
import LogoForm from "@/components/admin/LogoForm";
import ContactoForm from "@/components/admin/ContactoForm";
import EstrategiaForm from "@/components/admin/EstrategiaForm";
import PlanItemForm from "@/components/admin/PlanItemForm";
import Markdown from "@/components/Markdown";
import DeleteButton from "@/components/admin/DeleteButton";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestUf } from "@/lib/uf";
import { getConnectionStatus, listCalendars } from "@/lib/google";
import {
  cambiarRolUsuario,
  invitarUsuario,
  reenviarInvitacion,
  eliminarUsuario,
} from "../usuarios-actions";
import {
  guardarFicha,
  guardarContacto,
  eliminarContacto,
} from "../ficha-actions";
import {
  guardarEstrategia,
  guardarPlanItem,
  eliminarPlanItem,
} from "../contexto-actions";
import AgendarSolicitudForm from "@/components/admin/AgendarSolicitudForm";
import type {
  ClientContact,
  ClientDetails,
  ClientPlanItem,
  ClientStrategy,
  MeetingRequest,
} from "@/lib/types";
import type { ClientRole } from "@/lib/types";
import {
  CLIENT_STATUS_LABELS,
  SEGMENT_LABELS,
  contractNetLabel,
  contractMonthlyNetCLP,
  formatCLP,
  formatDate,
  formatDateTime,
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

  const [{ data: fichaData }, { data: contactsData }] = await Promise.all([
    supabase.from("client_details").select("*").eq("client_id", id).maybeSingle(),
    supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const ficha = (fichaData as ClientDetails | null) ?? null;
  const contactos = (contactsData ?? []) as ClientContact[];
  const logoUrl = ficha?.logo_path
    ? supabase.storage.from("logos").getPublicUrl(ficha.logo_path).data.publicUrl
    : null;

  const [{ data: strategyData }, { data: planData }] = await Promise.all([
    supabase.from("client_strategy").select("*").eq("client_id", id).maybeSingle(),
    supabase
      .from("client_plan_items")
      .select("*")
      .eq("client_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const strategy = (strategyData as ClientStrategy | null) ?? null;
  const planItems = (planData ?? []) as ClientPlanItem[];

  // Próximas reuniones de este cliente + confirmaciones de asistencia.
  const nowIso = new Date().toISOString();
  const { data: reunionesData } = await supabase
    .from("calendar_events")
    .select("id, title, starts_at")
    .eq("client_id", id)
    .eq("kind", "reunion")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(10);
  const reuniones = (reunionesData ?? []) as { id: string; title: string; starts_at: string }[];
  const attByEvent = new Map<string, { email: string; attending: boolean }[]>();
  if (reuniones.length) {
    const { data: att } = await supabase
      .from("event_attendance")
      .select("event_id, user_id, attending")
      .in("event_id", reuniones.map((r) => r.id));
    for (const a of (att ?? []) as { event_id: string; user_id: string; attending: boolean }[]) {
      const arr = attByEvent.get(a.event_id) ?? [];
      arr.push({ email: emailById.get(a.user_id) ?? "—", attending: a.attending });
      attByEvent.set(a.event_id, arr);
    }
  }

  // Solicitudes de reunión de este cliente (admin ve todas por RLS).
  const { data: mrData } = await supabase
    .from("meeting_requests")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  const meetingReqs = (mrData ?? []) as MeetingRequest[];

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
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                          <form action={reenviarInvitacion}>
                            <input type="hidden" name="email" value={u.email} />
                            <input type="hidden" name="client_id" value={cl.id} />
                            <button className="btn btn-sm" type="submit" title="Reenviar enlace para fijar contraseña">
                              Reenviar invitación
                            </button>
                          </form>
                          <DeleteButton
                            action={eliminarUsuario}
                            hidden={{ user_id: u.id, client_id: cl.id }}
                            label="Eliminar"
                            confirm={`¿Eliminar al usuario ${u.email}? Perderá el acceso al portal.`}
                          />
                        </div>
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
                  + Invitar usuario
                </summary>
                <div style={{ padding: "14px 2px 4px" }}>
                  <UserForm action={invitarUsuario} clientId={cl.id} />
                </div>
              </details>
            </div>
          </div>

          {/* Ficha de la empresa */}
          <div className="card">
            <div className="card-head">
              <h3>Ficha de la empresa</h3>
              {ficha?.updated_at && (
                <span className="tag mono">act. {formatDate(ficha.updated_at.slice(0, 10))}</span>
              )}
            </div>
            <div className="card-body">
              <div style={{ marginBottom: "18px", borderBottom: "1px solid var(--border-soft)", paddingBottom: "18px" }}>
                <label style={{ display: "block", marginBottom: "10px", fontSize: "13px", color: "var(--muted)" }}>
                  Logo de la empresa
                </label>
                <LogoForm clientId={cl.id} logoUrl={logoUrl} />
              </div>
              <FichaForm action={guardarFicha} clientId={cl.id} details={ficha} />
            </div>
          </div>

          {/* Contactos / funcionarios */}
          <div className="card">
            <div className="card-head">
              <h3>Contactos / funcionarios</h3>
              <span className="tag">{contactos.length}</span>
            </div>
            {contactos.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Cargo</th>
                    <th>Teléfono</th>
                    <th>Correo</th>
                  </tr>
                </thead>
                <tbody>
                  {contactos.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td style={{ color: "var(--muted)" }}>{c.role ?? "—"}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>{c.phone ?? "—"}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>{c.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Aún no hay contactos en el directorio.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
              {contactos.map((c) => (
                <details key={c.id}>
                  <summary className="btn btn-sm">Editar · {c.name}</summary>
                  <div style={{ padding: "14px 2px 4px" }}>
                    <ContactoForm action={guardarContacto} clientId={cl.id} contact={c} submitLabel="Guardar contacto" />
                    <div style={{ marginTop: "12px" }}>
                      <DeleteButton action={eliminarContacto} hidden={{ id: c.id, client_id: cl.id }} label="Eliminar contacto" confirm={`¿Eliminar a ${c.name} del directorio?`} />
                    </div>
                  </div>
                </details>
              ))}
              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>+ Agregar contacto</summary>
                <div style={{ padding: "14px 2px 4px" }}>
                  <ContactoForm action={guardarContacto} clientId={cl.id} submitLabel="Crear contacto" />
                </div>
              </details>
              <span className="hint">
                Directorio informativo. Agregar a alguien aquí <b>no</b> le da acceso al portal — el acceso se maneja en “Usuarios del portal”.
              </span>
            </div>
          </div>

          {/* Estrategia */}
          <div className="card">
            <div className="card-head">
              <h3>Estrategia</h3>
              {strategy?.updated_at && (
                <span className="tag mono">act. {formatDate(strategy.updated_at.slice(0, 10))}</span>
              )}
            </div>
            <div className="card-body">
              <EstrategiaForm action={guardarEstrategia} clientId={cl.id} strategy={strategy} />
              {strategy?.cuerpo?.trim() && (
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-soft)", paddingTop: "14px" }}>
                  <span className="hint">Vista previa de la narrativa</span>
                  <Markdown>{strategy.cuerpo}</Markdown>
                </div>
              )}
            </div>
          </div>

          {/* Plan contratado (alcance) */}
          <div className="card">
            <div className="card-head">
              <h3>Plan contratado (alcance)</h3>
              <span className="tag">{planItems.length}</span>
            </div>
            {planItems.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {planItems.map((it) => (
                    <tr key={it.id}>
                      <td>{it.name}</td>
                      <td style={{ color: "var(--muted)" }}>{it.description ?? "—"}</td>
                      <td>
                        <span className={`badge ${it.status === "activo" ? "b-ok" : "b-idle"}`}>
                          {it.status === "activo" ? "Activo" : "Pendiente"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Aún no hay ítems de plan.</div>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
              {planItems.map((it) => (
                <details key={it.id}>
                  <summary className="btn btn-sm">Editar · {it.name}</summary>
                  <div style={{ padding: "14px 2px 4px" }}>
                    <PlanItemForm action={guardarPlanItem} clientId={cl.id} item={it} submitLabel="Guardar ítem" />
                    <div style={{ marginTop: "12px" }}>
                      <DeleteButton action={eliminarPlanItem} hidden={{ id: it.id, client_id: cl.id }} label="Eliminar ítem" confirm={`¿Eliminar “${it.name}” del plan?`} />
                    </div>
                  </div>
                </details>
              ))}
              <details>
                <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>+ Agregar ítem</summary>
                <div style={{ padding: "14px 2px 4px" }}>
                  <PlanItemForm action={guardarPlanItem} clientId={cl.id} submitLabel="Crear ítem" />
                </div>
              </details>
              <span className="hint">
                Es el <b>alcance</b> de lo contratado, sin montos. Los precios y cuotas viven en Cobros y solo los ven dueño/finanzas.
              </span>
            </div>
          </div>

          {/* Reuniones y confirmaciones de asistencia */}
          <div className="card">
            <div className="card-head">
              <h3>Reuniones y confirmaciones</h3>
              <span className="tag">{reuniones.length}</span>
            </div>
            {reuniones.length ? (
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {reuniones.map((r) => {
                  const conf = attByEvent.get(r.id) ?? [];
                  const asisten = conf.filter((c) => c.attending);
                  const noAsisten = conf.filter((c) => !c.attending);
                  return (
                    <div key={r.id} style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <span style={{ fontWeight: 500 }}>{r.title}</span>
                        <span className="mono" style={{ color: "var(--muted)", fontSize: "12px" }}>{formatDateTime(r.starts_at)}</span>
                      </div>
                      <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {asisten.map((c) => (
                          <span key={c.email} className="badge b-ok">{c.email} · asiste</span>
                        ))}
                        {noAsisten.map((c) => (
                          <span key={c.email} className="badge b-idle">{c.email} · no podrá</span>
                        ))}
                        {conf.length === 0 && (
                          <span style={{ color: "var(--faint)", fontSize: "12.5px" }}>Sin confirmaciones aún.</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty">No hay reuniones próximas para este cliente.</div>
            )}
          </div>

          {/* Solicitudes de reunión */}
          <div className="card">
            <div className="card-head">
              <h3>Solicitudes de reunión</h3>
              <span className="tag">{meetingReqs.filter((r) => r.status === "pendiente").length} pendientes</span>
            </div>
            {meetingReqs.length ? (
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {meetingReqs.map((r) => (
                  <div key={r.id} style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{r.reason}</div>
                        <div className="meta" style={{ marginTop: "3px" }}>
                          {emailById.get(r.requested_by) ?? "—"} · urgencia {r.urgency}
                          {r.preferred_at ? ` · preferida ${formatDateTime(r.preferred_at)}` : ""}
                        </div>
                      </div>
                      <span className={`badge ${r.status === "agendada" ? "b-ok" : r.status === "descartada" ? "b-idle" : "b-warn"}`}>
                        {r.status === "agendada" ? "Agendada" : r.status === "descartada" ? "Descartada" : "Pendiente"}
                      </span>
                    </div>
                    {r.admin_note && <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "4px" }}>Nota: {r.admin_note}</div>}
                    {r.status === "pendiente" && (
                      <div style={{ marginTop: "8px" }}>
                        <AgendarSolicitudForm requestId={r.id} clientId={cl.id} clientName={cl.name} preferredAt={r.preferred_at} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Sin solicitudes de reunión.</div>
            )}
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
