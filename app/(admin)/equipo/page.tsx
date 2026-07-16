import type { CSSProperties } from "react";
import PageHeader from "@/components/PageHeader";
import MiembroForm from "@/components/admin/MiembroForm";
import DeleteButton from "@/components/admin/DeleteButton";
import SlideOver from "@/components/admin/SlideOver";
import StateChip from "@/components/admin/StateChip";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/types";
import { cambiarRolMiembro, eliminarMiembro, asignarCliente, desasignarCliente } from "./actions";

// Equipo e Integraciones viven en SISTEMA: el brief no les asigna tono de
// sección (no son objetos del negocio) → neutro.
const SEC = "var(--tx-2)";

const IcoTeam = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export default async function EquipoPage() {
  // Solo owner (equipo: ["owner"] en ADMIN_SECTIONS): redirige y oculta el nav.
  const session = await requireAdminRole("equipo");

  const supabase = await createClient();
  const adminClient = createAdminClient();
  const [{ data: profs }, { data: userList }, { data: clientsData }, { data: asgData }] = await Promise.all([
    supabase.from("profiles").select("id, admin_role, full_name").eq("role", "admin"),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("admin_assignments").select("member_id, client_id"),
  ]);

  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? "—"]));
  const confirmedById = new Map((userList?.users ?? []).map((u) => [u.id, !!u.email_confirmed_at]));
  const clients = (clientsData ?? []) as { id: string; name: string }[];
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  const assignedByMember = new Map<string, string[]>();
  for (const a of (asgData ?? []) as { member_id: string; client_id: string }[]) {
    (assignedByMember.get(a.member_id) ?? assignedByMember.set(a.member_id, []).get(a.member_id)!).push(a.client_id);
  }

  const members = (profs ?? [])
    .map((p) => ({
      id: p.id as string,
      email: emailById.get(p.id as string) ?? "—",
      fullName: (p.full_name as string | null) ?? "",
      role: (p.admin_role as AdminRole | null) ?? "ejecutivo",
      pending: !confirmedById.get(p.id as string),
      assigned: assignedByMember.get(p.id as string) ?? [],
    }))
    // owner primero, luego por nombre
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.fullName.localeCompare(b.fullName)));

  const invitar = (
    <SlideOver title="Invitar miembro interno" sec={SEC} triggerClass="dbtn dbtn-primary dbtn-sm" trigger={<>+ Invitar miembro</>}>
      <MiembroForm />
      <span className="mut" style={{ display: "block", marginTop: "10px", fontSize: "12.5px" }}>
        Crear un <b>dueño</b> (acceso total + gestión de equipo) no se hace desde aquí — es un acto
        deliberado que se hace por SQL. Aquí solo creas ejecutivos y productores.
      </span>
    </SlideOver>
  );

  return (
    <>
      <PageHeader title="Equipo" subtitle="Miembros internos de Color Media y sus clientes asignados" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div className="stack">
          {/* Miembros */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoTeam /></span>
              <h3>Miembros del equipo</h3>
              <span className="dcount">{members.length}</span>
              <div className="dhead-actions">{invitar}</div>
            </div>
            <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {members.map((m) => {
                const isSelf = m.id === session.userId;
                const isOwner = m.role === "owner";
                const unassigned = clients.filter((c) => !m.assigned.includes(c.id));
                return (
                  <div key={m.id} style={{ borderTop: "0.5px solid var(--v2-line)", paddingTop: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {m.fullName || m.email}
                          {isSelf && <span className="mut" style={{ marginLeft: "6px", fontSize: "12px" }}>(tú)</span>}
                        </div>
                        <div className="mut mono" style={{ fontSize: "12px" }}>{m.email}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        {m.pending && <StateChip tone="wait" label="Invitación pendiente" />}
                        {isOwner ? (
                          <span className="dtype">Dueño · todos los clientes</span>
                        ) : (
                          <>
                            {/* Cambiar rol (ejecutivo↔productor) */}
                            <form action={cambiarRolMiembro} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <input type="hidden" name="member_id" value={m.id} />
                              <select name="admin_role" defaultValue={m.role}>
                                <option value="ejecutivo">Ejecutivo</option>
                                <option value="productor">Productor</option>
                              </select>
                              <button className="dbtn dbtn-sm" type="submit">Guardar</button>
                            </form>
                            <DeleteButton
                              icon
                              action={eliminarMiembro}
                              hidden={{ member_id: m.id }}
                              label="Quitar del equipo"
                              confirm={`¿Quitar a ${m.fullName || m.email} del equipo? Perderá el acceso al panel.`}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Clientes asignados (solo ejecutivo/productor) */}
                    {!isOwner && (
                      <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <span className="mut" style={{ fontSize: "12px" }}>Clientes:</span>
                        {m.assigned.length ? (
                          m.assigned.map((cid) => (
                            <form key={cid} action={desasignarCliente} style={{ display: "inline-flex" }}>
                              <input type="hidden" name="member_id" value={m.id} />
                              <input type="hidden" name="client_id" value={cid} />
                              <button className="chip chip-removable" type="submit" title="Quitar asignación">
                                {clientNameById.get(cid) ?? "—"} <span aria-hidden>✕</span>
                              </button>
                            </form>
                          ))
                        ) : (
                          <span className="mut" style={{ fontSize: "12px" }}>sin clientes asignados</span>
                        )}
                        {unassigned.length > 0 && (
                          <form action={asignarCliente} style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            <input type="hidden" name="member_id" value={m.id} />
                            <select name="client_id" defaultValue="" required>
                              <option value="" disabled>+ asignar cliente…</option>
                              {unassigned.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button className="dbtn dbtn-primary dbtn-sm" type="submit">Asignar</button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
