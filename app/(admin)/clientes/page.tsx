import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import {
  CLIENT_STATUS_LABELS,
  SEGMENT_LABELS,
  contractNetLabel,
  formatMonthYear,
} from "@/lib/format";
import type { Client, Contract } from "@/lib/types";

export default async function ClientesPage() {
  await requireAdminRole("clientes"); // owner-only (cartera global)
  const supabase = await createClient();
  const [{ data: clients }, { data: contracts }] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: true }),
    supabase
      .from("contracts")
      .select("id, client_id, currency, net_uf, net_clp_fixed, status, start_date"),
  ]);

  // Un contrato representativo por cliente (prioriza el activo).
  const byClient = new Map<string, Partial<Contract>>();
  for (const c of (contracts ?? []) as Partial<Contract>[]) {
    const prev = byClient.get(c.client_id!);
    if (!prev || (c.status === "activo" && prev.status !== "activo")) {
      byClient.set(c.client_id!, c);
    }
  }

  const list = (clients ?? []) as Client[];

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Contratos, tarifas e indexación por cliente"
      />
      <div className="app-content">
        <div className="page-actions">
          <Link href="/clientes/nuevo" className="btn btn-primary">
            + Nuevo cliente
          </Link>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Cartera de clientes</h3>
            <span className="tag">{list.length} registros</span>
          </div>

          {list.length ? (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Segmento</th>
                  <th>Contrato</th>
                  <th className="num">Tarifa base</th>
                  <th>Indexación</th>
                  <th>Desde</th>
                </tr>
              </thead>
              <tbody>
                {list.map((cl) => {
                  const con = byClient.get(cl.id);
                  return (
                    <tr key={cl.id}>
                      <td>
                        <Link href={`/clientes/${cl.id}`} className="row-link">
                          <div className="cli">
                            <span
                              className="dot"
                              style={{ background: cl.accent_color ?? "#3dbdcb" }}
                            />
                            {cl.name}
                          </div>
                        </Link>
                      </td>
                      <td>{SEGMENT_LABELS[cl.segment]}</td>
                      <td>
                        {con ? (
                          "Retainer mensual"
                        ) : (
                          <span style={{ color: "var(--faint)" }}>Sin contrato</span>
                        )}
                      </td>
                      <td className="num mono">
                        {con ? contractNetLabel(con as Contract) : "—"}
                      </td>
                      <td>
                        {con ? (
                          con.currency === "UF" ? (
                            <span className="badge b-accent">UF</span>
                          ) : (
                            <span className="badge b-idle">CLP fijo</span>
                          )
                        ) : (
                          <span className={`badge ${cl.status === "activo" ? "b-ok" : "b-idle"}`}>
                            {CLIENT_STATUS_LABELS[cl.status]}
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {con?.start_date ? formatMonthYear(con.start_date) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              Aún no hay clientes. Crea el primero con “Nuevo cliente”.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
