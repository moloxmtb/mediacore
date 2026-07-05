import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClientPlanItem } from "@/lib/types";

export default async function PortalPlanPage() {
  const session = await getSessionProfile();
  if (!session || session.role !== "client") redirect("/login");

  const supabase = await createClient();
  // RLS limita al plan del propio cliente.
  const { data } = await supabase
    .from("client_plan_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const items = (data ?? []) as ClientPlanItem[];

  const activos = items.filter((i) => i.status === "activo");
  const pendientes = items.filter((i) => i.status === "pendiente");

  const Item = ({ it }: { it: ClientPlanItem }) => (
    <div className="plan-item">
      <div className="plan-item-head">
        <span className="plan-item-name">{it.name}</span>
        <span className={`badge ${it.status === "activo" ? "b-ok" : "b-idle"}`}>
          {it.status === "activo" ? "Activo" : "Pendiente"}
        </span>
      </div>
      {it.description?.trim() && <p className="plan-item-desc">{it.description}</p>}
    </div>
  );

  return (
    <>
      <PageHeader title="Tu plan" subtitle="Qué incluye lo que contrataste" />
      <div className="app-content">
        <div className="stack">
          {items.length === 0 ? (
            <div className="card">
              <div className="empty">Todavía no publicamos el detalle de tu plan. Pronto lo verás aquí.</div>
            </div>
          ) : (
            <>
              {activos.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <h3>En curso</h3>
                    <span className="tag">{activos.length}</span>
                  </div>
                  <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {activos.map((it) => <Item key={it.id} it={it} />)}
                  </div>
                </div>
              )}
              {pendientes.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <h3>Por venir</h3>
                    <span className="tag">{pendientes.length}</span>
                  </div>
                  <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {pendientes.map((it) => <Item key={it.id} it={it} />)}
                  </div>
                </div>
              )}
              <div className="note">
                <p style={{ margin: 0 }}>
                  Este es el alcance de tu plan. Los valores y las cuotas están en la sección de finanzas.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
