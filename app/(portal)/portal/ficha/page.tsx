import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import FichaForm from "@/components/admin/FichaForm";
import ContactoForm from "@/components/admin/ContactoForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { canSeeFinance, getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  guardarFicha,
  guardarContacto,
  eliminarContacto,
} from "@/app/(admin)/clientes/ficha-actions";
import type { ClientContact, ClientDetails } from "@/lib/types";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="kv-row">
      <span className="kv-k">{label}</span>
      <span className="kv-v">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

export default async function PortalFichaPage() {
  const session = await getSessionProfile();
  if (!session || session.role !== "client") redirect("/login");

  const supabase = await createClient();
  // RLS limita todo a lo del propio cliente.
  const [{ data: fichaData }, { data: contactsData }] = await Promise.all([
    supabase.from("client_details").select("*").maybeSingle(),
    supabase
      .from("client_contacts")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const ficha = (fichaData as ClientDetails | null) ?? null;
  const contactos = (contactsData ?? []) as ClientContact[];
  const clientId = session.clientId ?? "";

  // Dueño y finanzas pueden editar; contenido solo mira.
  const editable = canSeeFinance(session.clientRole);

  return (
    <>
      <PageHeader
        title="Mi empresa"
        subtitle={editable ? "Antecedentes y contactos" : "Antecedentes y contactos (solo lectura)"}
      />
      <div className="app-content">
        <div className="stack">
          {/* Ficha */}
          <div className="card">
            <div className="card-head">
              <h3>Antecedentes de la empresa</h3>
            </div>
            {editable ? (
              <div className="card-body">
                <FichaForm action={guardarFicha} clientId={clientId} details={ficha} />
              </div>
            ) : (
              <div className="card-body kv">
                <Row label="Razón social" value={ficha?.razon_social ?? null} />
                <Row label="RUT" value={ficha?.rut ?? null} />
                <Row label="Giro" value={ficha?.giro ?? null} />
                <Row label="Dirección" value={ficha?.direccion ?? null} />
                <Row label="Comuna" value={ficha?.comuna ?? null} />
                <Row label="Ciudad" value={ficha?.ciudad ?? null} />
                <Row label="Región" value={ficha?.region ?? null} />
                <Row label="Horarios" value={ficha?.horarios ?? null} />
                <Row label="Notas" value={ficha?.notas ?? null} />
              </div>
            )}
          </div>

          {/* Contactos */}
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
            {editable && (
              <div className="card-body" style={{ borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: "10px" }}>
                {contactos.map((c) => (
                  <details key={c.id}>
                    <summary className="btn btn-sm">Editar · {c.name}</summary>
                    <div style={{ padding: "14px 2px 4px" }}>
                      <ContactoForm action={guardarContacto} clientId={clientId} contact={c} submitLabel="Guardar contacto" />
                      <div style={{ marginTop: "12px" }}>
                        <DeleteButton action={eliminarContacto} hidden={{ id: c.id, client_id: clientId }} label="Eliminar contacto" confirm={`¿Eliminar a ${c.name} del directorio?`} />
                      </div>
                    </div>
                  </details>
                ))}
                <details>
                  <summary className="btn btn-sm btn-primary" style={{ width: "fit-content" }}>+ Agregar contacto</summary>
                  <div style={{ padding: "14px 2px 4px" }}>
                    <ContactoForm action={guardarContacto} clientId={clientId} submitLabel="Crear contacto" />
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
