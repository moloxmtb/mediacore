import PageHeader from "@/components/PageHeader";
import MiembroForm from "@/components/admin/MiembroForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { requireAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/types";
import { cambiarRolMiembro, eliminarMiembro, asignarCliente, desasignarCliente } from "./actions";

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

  return (
    <>
      <PageHeader title="Equipo" subtitle="Miembros internos de Color Media y sus clientes asignados" />
      <div className="app-content">
        <div className="stack">
          {/* Miembros */}
          <div className="card">
            <div className="card-head">
              <h3>Miembros del equipo</h3>
              <span className="tag">{members.length}</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {members.map((m) => {
                const isSelf = m.id === session.userId;
                const isOwner = m.role === "owner";
                const unassigned = clients.filter((c) => !m.assigned.includes(c.id));
                return (
                  <div key={m.id} style={{ borderTop: "1px solid var(--border-soft)", paddingTop: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {m.fullName || m.email}
                          {isSelf && <span className="meta" style={{ marginLeft: "6px" }}>(tú)</span>}
                        </div>
                        <div className="meta mono">{m.email}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        {m.pending && <span className="badge b-warn">Invitación pendiente</span>}
                        {isOwner ? (
                          <span className="badge b-accent">Dueño · todos los clientes</span>
                        ) : (
                          <>
                            {/* Cambiar rol (ejecutivo↔productor) */}
                            <form action={cambiarRolMiembro} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <input type="hidden" name="member_id" value={m.id} />
                              <select
                                name="admin_role"
                                defaultValue={m.role}
                                style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", padding: "6px 8px", fontFamily: "inherit" }}
                              >
                                <option value="ejecutivo">Ejecutivo</option>
                                <option value="productor">Productor</option>
                              </select>
                              <button className="btn btn-sm" type="submit">Guardar</button>
                            </form>
                            <DeleteButton
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
                        <span className="meta">Clientes:</span>
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
                          <span className="meta" style={{ color: "var(--faint)" }}>sin clientes asignados</span>
                        )}
                        {unassigned.length > 0 && (
                          <form action={asignarCliente} style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            <input type="hidden" name="member_id" value={m.id} />
                            <select
                              name="client_id"
                              defaultValue=""
                              required
                              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", padding: "6px 8px", fontFamily: "inherit" }}
                            >
                              <option value="" disabled>+ asignar cliente…</option>
                              {unassigned.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button className="btn btn-sm btn-primary" type="submit">Asignar</button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invitar miembro */}
          <div className="card">
            <div className="card-head"><h3>Invitar miembro interno</h3></div>
            <div className="card-body">
              <MiembroForm />
              <span className="hint" style={{ display: "block", marginTop: "10px" }}>
                Crear un <b>dueño</b> (acceso total + gestión de equipo) no se hace desde aquí — es un acto
                deliberado que se hace por SQL. Aquí solo creas ejecutivos y productores.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
