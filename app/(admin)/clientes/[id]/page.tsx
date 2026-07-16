import type { CSSProperties, ReactNode } from "react";
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
import SlideOver from "@/components/admin/SlideOver";
import StateChip from "@/components/admin/StateChip";
import { CollapsibleBox, CollapseControl } from "@/components/admin/CollapsibleBox";
import {
  stStyle as st,
  clientTone,
  projectTone,
  planItemTone,
  invitationTone,
  meetingRequestTone,
  contractTone,
} from "@/lib/estado";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
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
  ClientInvitation,
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
  PROJECT_STATUS_LABELS,
  CLIENT_ROLE_LABELS,
  INVITATION_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
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

const SEC = "var(--sec-clientes)";

const ico = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IcoUser = () => ico(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>);
const IcoUsers = () => ico(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>);
const IcoBuilding = () => ico(<><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h2a2 2 0 0 1 2 2v10" /><path d="M9 7h2M9 11h2M9 15h2" /></>);
const IcoContact = () => ico(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M6 16c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M15 9h3M15 13h3" /></>);
const IcoTarget = () => ico(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></>);
const IcoList = () => ico(<><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>);
const IcoCal = () => ico(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></>);
const IcoInbox = () => ico(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>);
const IcoLink = () => ico(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>);
const IcoDoc = () => ico(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></>);
const IcoFolder = () => ico(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>);
const IcoPencil = () => ico(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>);

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminRole("clientes"); // owner-only (ficha con finanzas)
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

  // Invitaciones de este cliente (historial de envíos/reenvíos), agrupadas por
  // email. La más reciente marca el estado actual; el resto es el historial.
  const { data: invData } = await adminClient
    .from("client_invitations")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
  const invitations = (invData ?? []) as ClientInvitation[];
  const invitationsByEmail = new Map<string, ClientInvitation[]>();
  for (const inv of invitations) {
    const key = inv.email.toLowerCase();
    (invitationsByEmail.get(key) ?? invitationsByEmail.set(key, []).get(key)!).push(inv);
  }

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

  const nuevoUsuario = (
    <SlideOver title="Invitar usuario" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Invitar usuario</>}>
      <UserForm action={invitarUsuario} clientId={cl.id} />
    </SlideOver>
  );
  const nuevoContacto = (
    <SlideOver title="Agregar contacto" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar contacto</>}>
      <ContactoForm action={guardarContacto} clientId={cl.id} submitLabel="Crear contacto" />
    </SlideOver>
  );
  const nuevoItem = (
    <SlideOver title="Agregar ítem al plan" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar ítem</>}>
      <PlanItemForm action={guardarPlanItem} clientId={cl.id} submitLabel="Crear ítem" />
    </SlideOver>
  );
  const nuevoContrato = (
    <SlideOver title="Agregar contrato" sec="var(--sec-cobros)" triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Agregar contrato</>}>
      <ContractForm action={crearContrato} clientId={cl.id} submitLabel="Crear contrato" />
    </SlideOver>
  );
  const nuevoProyecto = (
    <Link href={`/proyectos/nuevo?client=${cl.id}`} className="dbtn dbtn-primary dbtn-sm">+ Nuevo proyecto</Link>
  );

  return (
    <>
      <PageHeader title={cl.name} subtitle={`${SEGMENT_LABELS[cl.segment]} · ficha de cliente`} />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
          <Link href="/clientes" className="dback">← Volver a clientes</Link>
          <CollapseControl scope="cli" />
        </div>

        <div className="stack">
          {/* Ficha editable — única abierta por defecto */}
          <CollapsibleBox
            id="cli-ficha"
            scope="cli"
            defaultOpen
            sec={SEC}
            icon={<IcoUser />}
            title="Ficha del cliente"
            actions={<StateChip tone={clientTone[cl.status]} label={CLIENT_STATUS_LABELS[cl.status]} />}
          >
            <div className="dbox-body">
              <ClientForm action={actualizarCliente} client={cl} submitLabel="Guardar cambios" />
              <div style={{ marginTop: "18px", borderTop: "0.5px solid var(--v2-line)", paddingTop: "16px" }}>
                <DeleteButton
                  action={eliminarCliente}
                  hidden={{ id: cl.id }}
                  label="Eliminar cliente"
                  confirm={`¿Eliminar a ${cl.name}? Se borrarán también sus contratos y proyectos. Esta acción no se puede deshacer.`}
                />
              </div>
            </div>
          </CollapsibleBox>

          {/* Usuarios del portal */}
          <CollapsibleBox
            id="cli-usuarios"
            scope="cli"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoUsers />}
            title="Usuarios del portal"
            count={portalUsers.length}
            actions={nuevoUsuario}
          >
            {portalUsers.length ? (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Correo</th>
                    <th>Rol en el portal</th>
                    <th>Invitación</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {portalUsers.map((u) => {
                    const invs = invitationsByEmail.get(u.email.toLowerCase()) ?? [];
                    const latest = invs[0] ?? null;
                    return (
                      <tr key={u.id} className="drow" style={st(latest ? invitationTone[latest.status] : "neutral")}>
                        <td className="mono">{u.email}</td>
                        <td>
                          <form action={cambiarRolUsuario} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="client_id" value={cl.id} />
                            <select name="client_role" defaultValue={u.client_role}>
                              {Object.entries(CLIENT_ROLE_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                              ))}
                            </select>
                            <button className="dbtn dbtn-sm" type="submit">Guardar</button>
                          </form>
                        </td>
                        <td>
                          {latest ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                              <StateChip tone={invitationTone[latest.status]} label={INVITATION_STATUS_LABELS[latest.status]} />
                              <details>
                                <summary className="mut" style={{ cursor: "pointer", fontSize: "12px" }}>
                                  Historial ({invs.length})
                                </summary>
                                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {invs.map((iv) => (
                                    <div key={iv.id} style={{ fontSize: "12px", display: "flex", gap: "6px", alignItems: "center" }}>
                                      <StateChip tone={invitationTone[iv.status]} label={INVITATION_STATUS_LABELS[iv.status]} />
                                      <span className="mut">
                                        {iv.kind === "invite" ? "invitación" : "reenvío"} · {formatDateTime(iv.created_at)}
                                      </span>
                                      {iv.error && <span style={{ color: "var(--st-bad)" }} title={iv.error}>· {iv.error.slice(0, 40)}</span>}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </div>
                          ) : (
                            <span className="mut">Sin registro</span>
                          )}
                        </td>
                        <td className="num">
                          {/* Acción principal como texto (en tono de sección), el resto en icono */}
                          <div className="dacts">
                            <form action={reenviarInvitacion}>
                              <input type="hidden" name="email" value={u.email} />
                              <input type="hidden" name="client_id" value={cl.id} />
                              <button className="dbtn dbtn-sm" type="submit" title="Reenviar enlace para fijar contraseña">
                                Reenviar invitación
                              </button>
                            </form>
                            <DeleteButton
                              icon
                              action={eliminarUsuario}
                              hidden={{ user_id: u.id, client_id: cl.id }}
                              label="Eliminar usuario"
                              confirm={`¿Eliminar al usuario ${u.email}? Perderá el acceso al portal.`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="dempty">
                <span>Este cliente aún no tiene usuarios de portal.</span>
                {nuevoUsuario}
              </div>
            )}
          </CollapsibleBox>

          {/* Ficha de la empresa */}
          <CollapsibleBox
            id="cli-empresa"
            scope="cli"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoBuilding />}
            title="Ficha de la empresa"
            actions={ficha?.updated_at ? <span className="dtype mono">act. {formatDate(ficha.updated_at.slice(0, 10))}</span> : undefined}
          >
            <div className="dbox-body">
              <div style={{ marginBottom: "18px", borderBottom: "0.5px solid var(--v2-line)", paddingBottom: "18px" }}>
                <label style={{ display: "block", marginBottom: "10px", fontSize: "13px", color: "var(--tx-2)" }}>
                  Logo de la empresa
                </label>
                <LogoForm clientId={cl.id} logoUrl={logoUrl} />
              </div>
              <FichaForm action={guardarFicha} clientId={cl.id} details={ficha} />
            </div>
          </CollapsibleBox>

          {/* Contactos / funcionarios */}
          <CollapsibleBox
            id="cli-contactos"
            scope="cli"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoContact />}
            title="Contactos / funcionarios"
            count={contactos.length}
            actions={nuevoContacto}
          >
            {contactos.length ? (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Cargo</th>
                    <th>Teléfono</th>
                    <th>Correo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contactos.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="mut">{c.role ?? "—"}</td>
                      <td className="mono mut">{c.phone ?? "—"}</td>
                      <td className="mono mut">{c.email ?? "—"}</td>
                      <td className="num">
                        <div className="dacts">
                          <SlideOver
                            title={`Editar · ${c.name}`}
                            sec={SEC}
                            triggerClass="dact"
                            triggerTip="Editar"
                            triggerAria="Editar contacto"
                            trigger={<IcoPencil />}
                          >
                            <ContactoForm action={guardarContacto} clientId={cl.id} contact={c} submitLabel="Guardar contacto" />
                          </SlideOver>
                          <DeleteButton
                            icon
                            action={eliminarContacto}
                            hidden={{ id: c.id, client_id: cl.id }}
                            label="Eliminar contacto"
                            confirm={`¿Eliminar a ${c.name} del directorio?`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">
                <span>Aún no hay contactos en el directorio.</span>
                {nuevoContacto}
              </div>
            )}
            <div className="dbox-body" style={{ borderTop: "0.5px solid var(--v2-line)" }}>
              <span className="mut" style={{ fontSize: "12.5px" }}>
                Directorio informativo. Agregar a alguien aquí <b>no</b> le da acceso al portal — el acceso se maneja en “Usuarios del portal”.
              </span>
            </div>
          </CollapsibleBox>

          {/* Estrategia */}
          <CollapsibleBox
            id="cli-estrategia"
            scope="cli"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoTarget />}
            title="Estrategia"
            actions={strategy?.updated_at ? <span className="dtype mono">act. {formatDate(strategy.updated_at.slice(0, 10))}</span> : undefined}
          >
            <div className="dbox-body">
              <EstrategiaForm action={guardarEstrategia} clientId={cl.id} strategy={strategy} />
              {strategy?.cuerpo?.trim() && (
                <div style={{ marginTop: "16px", borderTop: "0.5px solid var(--v2-line)", paddingTop: "14px" }}>
                  <span className="mut" style={{ fontSize: "12.5px" }}>Vista previa de la narrativa</span>
                  <Markdown>{strategy.cuerpo}</Markdown>
                </div>
              )}
            </div>
          </CollapsibleBox>

          {/* Plan contratado (alcance) */}
          <CollapsibleBox
            id="cli-plan"
            scope="cli"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoList />}
            title="Plan contratado (alcance)"
            count={planItems.length}
            actions={nuevoItem}
          >
            {planItems.length ? (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {planItems.map((it) => (
                    <tr key={it.id} className="drow" style={st(planItemTone[it.status])}>
                      <td>{it.name}</td>
                      <td className="mut">{it.description ?? "—"}</td>
                      <td>
                        <StateChip tone={planItemTone[it.status]} label={it.status === "activo" ? "Activo" : "Pendiente"} />
                      </td>
                      <td className="num">
                        <div className="dacts">
                          <SlideOver
                            title={`Editar · ${it.name}`}
                            sec={SEC}
                            triggerClass="dact"
                            triggerTip="Editar"
                            triggerAria="Editar ítem"
                            trigger={<IcoPencil />}
                          >
                            <PlanItemForm action={guardarPlanItem} clientId={cl.id} item={it} submitLabel="Guardar ítem" />
                          </SlideOver>
                          <DeleteButton
                            icon
                            action={eliminarPlanItem}
                            hidden={{ id: it.id, client_id: cl.id }}
                            label="Eliminar ítem"
                            confirm={`¿Eliminar “${it.name}” del plan?`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">
                <span>Aún no hay ítems de plan.</span>
                {nuevoItem}
              </div>
            )}
            <div className="dbox-body" style={{ borderTop: "0.5px solid var(--v2-line)" }}>
              <span className="mut" style={{ fontSize: "12.5px" }}>
                Es el <b>alcance</b> de lo contratado, sin montos. Los precios y cuotas viven en Cobros y solo los ven dueño/finanzas.
              </span>
            </div>
          </CollapsibleBox>

          {/* Reuniones y confirmaciones — tono de calendario */}
          <CollapsibleBox
            id="cli-reuniones"
            scope="cli"
            defaultOpen={false}
            sec="var(--sec-calendario)"
            icon={<IcoCal />}
            title="Reuniones y confirmaciones"
            count={reuniones.length}
          >
            {reuniones.length ? (
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {reuniones.map((r) => {
                  const conf = attByEvent.get(r.id) ?? [];
                  const asisten = conf.filter((c) => c.attending);
                  const noAsisten = conf.filter((c) => !c.attending);
                  return (
                    <div key={r.id} style={{ borderBottom: "0.5px solid var(--v2-line)", paddingBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <span style={{ fontWeight: 500 }}>{r.title}</span>
                        <span className="mono mut" style={{ fontSize: "12px" }}>{formatDateTime(r.starts_at)}</span>
                      </div>
                      <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {asisten.map((c) => (
                          <StateChip key={c.email} tone="ok" label={`${c.email} · asiste`} />
                        ))}
                        {noAsisten.map((c) => (
                          <StateChip key={c.email} tone="neutral" label={`${c.email} · no podrá`} />
                        ))}
                        {conf.length === 0 && <span className="mut" style={{ fontSize: "12.5px" }}>Sin confirmaciones aún.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dempty">No hay reuniones próximas para este cliente.</div>
            )}
          </CollapsibleBox>

          {/* Solicitudes de reunión — tono de calendario */}
          <CollapsibleBox
            id="cli-solicitudes"
            scope="cli"
            defaultOpen={false}
            sec="var(--sec-calendario)"
            icon={<IcoInbox />}
            title="Solicitudes de reunión"
            count={meetingReqs.filter((r) => r.status === "pendiente").length}
          >
            {meetingReqs.length ? (
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {meetingReqs.map((r) => (
                  <div key={r.id} style={{ borderBottom: "0.5px solid var(--v2-line)", paddingBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{r.reason}</div>
                        <div className="mut" style={{ marginTop: "3px", fontSize: "12px" }}>
                          {emailById.get(r.requested_by) ?? "—"}
                          {r.preferred_at ? ` · preferida ${formatDateTime(r.preferred_at)}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flex: "none" }}>
                        {/* urgencia = eje TIPO (el MAPA no la mapea); el semáforo es el estado */}
                        <span className="dtype">urgencia {r.urgency}</span>
                        <StateChip
                          tone={meetingRequestTone[r.status]}
                          label={r.status === "agendada" ? "Agendada" : r.status === "descartada" ? "Descartada" : "Pendiente"}
                        />
                      </div>
                    </div>
                    {r.admin_note && <div className="mut" style={{ fontSize: "12.5px", marginTop: "4px" }}>Nota: {r.admin_note}</div>}
                    {r.status === "pendiente" && (
                      <div style={{ marginTop: "8px" }}>
                        <AgendarSolicitudForm requestId={r.id} clientId={cl.id} clientName={cl.name} preferredAt={r.preferred_at} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="dempty">Sin solicitudes de reunión.</div>
            )}
          </CollapsibleBox>

          {/* Calendario de Google */}
          <CollapsibleBox
            id="cli-google"
            scope="cli"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoLink />}
            title="Calendario de Google"
            /* Mapeado/Sin mapear = eje de CONFIGURACIÓN (presencia), no del MAPA → pastilla de tipo */
            actions={<span className="dtype">{cl.google_calendar_id ? "Mapeado" : "Sin mapear"}</span>}
          >
            <div className="dbox-body">
              <CalendarMapForm
                action={guardarCalendarioCliente}
                clientId={cl.id}
                current={cl.google_calendar_id}
                calendars={calendars}
                connected={gStatus.connected}
              />
            </div>
          </CollapsibleBox>

          {/* Contratos — FINANZAS: tono de cobros */}
          <CollapsibleBox
            id="cli-contratos"
            scope="cli"
            defaultOpen={false}
            sec="var(--sec-cobros)"
            icon={<IcoDoc />}
            title="Contratos"
            count={contractList.length}
            actions={nuevoContrato}
          >
            {contractList.length ? (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Tarifa base</th>
                    <th className="num">Monto del mes</th>
                    <th>Vigencia</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contractList.map((c) => {
                    const monthly = contractMonthlyNetCLP(c, uf.value);
                    return (
                      <tr key={c.id} className="drow" style={st(contractTone(c.status))}>
                        <td className="mono">
                          {contractNetLabel(c)}{" "}
                          {/* moneda = eje TIPO */}
                          <span className="dtype" style={{ marginLeft: "6px" }}>{c.currency}</span>
                        </td>
                        <td className="num mono">{monthly != null ? formatCLP(monthly) : "—"}</td>
                        <td className="mono mut">
                          {formatDate(c.start_date)}
                          {c.end_date ? ` → ${formatDate(c.end_date)}` : ""}
                        </td>
                        <td><StateChip tone={contractTone(c.status)} label={CONTRACT_STATUS_LABELS[c.status] ?? c.status} /></td>
                        <td className="num">
                          <div className="dacts">
                            <SlideOver
                              title={`Editar contrato · ${contractNetLabel(c)}`}
                              sec="var(--sec-cobros)"
                              triggerClass="dact"
                              triggerTip="Editar"
                              triggerAria="Editar contrato"
                              trigger={<IcoPencil />}
                            >
                              <ContractForm action={actualizarContrato} clientId={cl.id} contract={c} submitLabel="Guardar contrato" />
                              <div style={{ marginTop: "16px", borderTop: "0.5px solid var(--v2-line)", paddingTop: "14px" }}>
                                {c.modality === "retainer" ? (
                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                    <form action={generarCuotaMes}>
                                      <input type="hidden" name="contract_id" value={c.id} />
                                      <button className="dbtn dbtn-sm" type="submit">Generar cuota del mes</button>
                                    </form>
                                    <Link href="/cobros" className="dbtn dbtn-sm">Ver en Cobros</Link>
                                  </div>
                                ) : (
                                  <>
                                    <span className="mut" style={{ fontSize: "12.5px", display: "block", marginBottom: "10px" }}>
                                      Generar cuotas por tramos
                                    </span>
                                    <TramosEditor
                                      action={generarCuotasPorTramos}
                                      contractId={c.id}
                                      currency={c.currency}
                                      defaultNet={c.currency === "UF" ? c.net_uf : c.net_clp_fixed}
                                      defaultCount={c.installments_count ?? 1}
                                    />
                                    <div style={{ marginTop: "10px" }}>
                                      <Link href="/cobros" className="dbtn dbtn-sm">Ver en Cobros</Link>
                                    </div>
                                  </>
                                )}
                              </div>
                            </SlideOver>
                            <DeleteButton
                              icon
                              action={eliminarContrato}
                              hidden={{ id: c.id, client_id: cl.id }}
                              label="Eliminar contrato"
                              confirm="¿Eliminar este contrato?"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="dempty">
                <span>Este cliente aún no tiene contratos.</span>
                {nuevoContrato}
              </div>
            )}
          </CollapsibleBox>

          {/* Proyectos vinculados — tono de proyectos */}
          <CollapsibleBox
            id="cli-proyectos"
            scope="cli"
            defaultOpen={false}
            sec="var(--sec-proyectos)"
            icon={<IcoFolder />}
            title="Proyectos"
            count={projectList.length}
            actions={nuevoProyecto}
          >
            {projectList.length ? (
              <table className="dtable">
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
                    <tr key={p.id} className="drow" style={st(projectTone[p.status])}>
                      <td>
                        <Link href={`/proyectos/${p.id}`} className="row-link">{p.name}</Link>
                      </td>
                      <td><StateChip tone={projectTone[p.status]} label={PROJECT_STATUS_LABELS[p.status]} /></td>
                      <td className="mono mut">{formatDate(p.start_date)}</td>
                      <td className="mono mut">{formatDate(p.end_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">
                <span>Sin proyectos todavía.</span>
                {nuevoProyecto}
              </div>
            )}
          </CollapsibleBox>
        </div>
      </div>
    </>
  );
}
