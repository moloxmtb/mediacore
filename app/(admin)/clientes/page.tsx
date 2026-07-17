import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import {
  CLIENT_STATUS_LABELS,
  SEGMENT_LABELS,
  contractNetLabel,
  formatMonthYear,
} from "@/lib/format";
import { stStyle as st, clientTone } from "@/lib/estado";
import type { Client, Contract } from "@/lib/types";

const SEC = "var(--sec-clientes)";

const IcoUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

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
      <PageHeader title="Clientes" subtitle="Contratos, tarifas e indexación por cliente" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div className="dbox">
          <div className="dbox-head">
            <span className="dh-ico"><IcoUsers /></span>
            <h3>Cartera de clientes</h3>
            <span className="dcount">{list.length}</span>
            <div className="dhead-actions">
              <Link href="/clientes/nuevo" className="dbtn dbtn-primary dbtn-sm">+ Nuevo cliente</Link>
            </div>
          </div>

          {list.length ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Estado</th>
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
                    <tr key={cl.id} className="drow" style={st(clientTone[cl.status])}>
                      <td>
                        {/* Identidad de cliente: cuadradito con su color, aparte del estado */}
                        <Link href={`/clientes/${cl.id}`} className="row-link" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <span className="cli-sq" style={{ background: cl.accent_color ?? "var(--tx-3)" }} />
                          {cl.name}
                        </Link>
                      </td>
                      {/* Estado del cliente = chip semántico (MAPA §1) */}
                      <td><StateChip tone={clientTone[cl.status]} label={CLIENT_STATUS_LABELS[cl.status]} /></td>
                      <td className="mut">{SEGMENT_LABELS[cl.segment]}</td>
                      <td>{con ? <span className="dtype">Retainer mensual</span> : <span className="mut">Sin contrato</span>}</td>
                      <td className="num">{con ? contractNetLabel(con as Contract) : <span className="mut">—</span>}</td>
                      {/* Indexación = eje TIPO (pill borde), no estado */}
                      <td>{con ? <span className="dtype">{con.currency === "UF" ? "UF" : "CLP fijo"}</span> : <span className="mut">—</span>}</td>
                      <td className="mono mut">{con?.start_date ? formatMonthYear(con.start_date) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="dempty">
              <span>Aún no hay clientes.</span>
              <Link href="/clientes/nuevo" className="dbtn dbtn-primary dbtn-sm">+ Nuevo cliente</Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
