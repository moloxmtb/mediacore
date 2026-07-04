import PageHeader from "@/components/PageHeader";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLatestUf } from "@/lib/uf";
import {
  contractNetLabel,
  formatCLP,
  formatDate,
  formatUF,
} from "@/lib/format";
import {
  INSTALLMENT_STATUS_LABELS,
  MODALITY_LABELS,
  installmentCLP,
  installmentStatusBadge,
  isDueToday,
  isOverdue,
  ivaUF,
  totalUF,
} from "@/lib/billing";
import type { Contract, Installment } from "@/lib/types";

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

export default async function PortalFinanzasPage() {
  await requirePortalWorld("finance");
  const supabase = await createClient();

  // RLS ya limita a lo del propio cliente y solo owner/finance llega aquí.
  const [{ data: contractsData }, { data: instData }, uf] = await Promise.all([
    supabase.from("contracts").select("*").order("start_date", { ascending: false }),
    supabase.from("installments").select("*").order("due_date", { ascending: true }),
    getLatestUf(),
  ]);
  const contracts = (contractsData ?? []) as Contract[];
  const cuotas = (instData ?? []) as Installment[];
  const t = today();

  let pagado = 0, porCobrar = 0, vencido = 0;
  for (const r of cuotas) {
    if (r.status === "pagada") pagado += r.total_clp ?? 0;
    else if (r.status === "facturada") {
      if (r.due_date < t) vencido += r.total_clp ?? 0;
      else porCobrar += r.total_clp ?? 0;
    }
  }

  return (
    <>
      <PageHeader title="Finanzas" subtitle="Tu contrato y tus cuotas" />
      <div className="app-content">
        <div className="stack">
          {/* Contrato */}
          <div className="card">
            <div className="card-head">
              <h3>Tu contrato</h3>
            </div>
            {contracts.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Modalidad</th>
                    <th className="num">Neto por cuota</th>
                    <th>IVA</th>
                    <th>Vigencia</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td>{MODALITY_LABELS[c.modality]}</td>
                      <td className="num mono">{contractNetLabel(c)}</td>
                      <td>{c.has_iva ? "19%" : "Exento"}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {formatDate(c.start_date)}
                        {c.end_date ? ` → ${formatDate(c.end_date)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Aún no hay contrato registrado.</div>
            )}
          </div>

          {/* Resumen de cobros */}
          <div className="paybar">
            <div className="paycell">
              <div className="k"><span className="badge b-ok" style={{ padding: "2px 8px" }}>Pagado</span></div>
              <div className="v mono">{formatCLP(pagado)}</div>
            </div>
            <div className="paycell">
              <div className="k"><span className="badge b-accent" style={{ padding: "2px 8px" }}>Por cobrar</span></div>
              <div className="v mono">{formatCLP(porCobrar)}</div>
            </div>
            <div className="paycell">
              <div className="k"><span className="badge b-bad" style={{ padding: "2px 8px" }}>Vencido</span></div>
              <div className="v mono">{formatCLP(vencido)}</div>
            </div>
          </div>

          {/* Cuotas */}
          <div className="card">
            <div className="card-head">
              <h3>Cuotas</h3>
              <span className="tag mono">
                UF {uf.value != null ? formatCLP(uf.value) : "—"}
              </span>
            </div>
            {cuotas.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Cuota</th>
                    <th className="num">Neto</th>
                    <th className="num">IVA</th>
                    <th className="num">Total</th>
                    <th>Vence</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.map((r) => {
                    const clp = installmentCLP(r, uf.value);
                    const isUF = r.currency === "UF";
                    const approx = !clp?.frozen ? "≈ " : "";
                    return (
                      <tr key={r.id}>
                        <td className="mono">#{r.number}</td>
                        <td className="num">
                          <div className="amount mono">
                            {approx}{formatCLP(clp?.net_clp)}
                            {isUF && r.net_uf != null && <span className="uf">{formatUF(r.net_uf)}</span>}
                          </div>
                        </td>
                        <td className="num">
                          <div className="amount mono">
                            {r.has_iva ? `${approx}${formatCLP(clp?.iva_clp)}` : "exento"}
                            {isUF && r.has_iva && r.net_uf != null && (
                              <span className="uf">{formatUF(ivaUF(r.net_uf, true))}</span>
                            )}
                          </div>
                        </td>
                        <td className="num">
                          <div className="amount mono">
                            {approx}{formatCLP(clp?.total_clp)}
                            {isUF && r.net_uf != null && <span className="uf">{formatUF(totalUF(r.net_uf, r.has_iva))}</span>}
                          </div>
                        </td>
                        <td className="mono" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                          {formatDate(r.due_date)}
                          {isDueToday(r, t) && <span className="badge b-warn" style={{ marginLeft: "6px" }}>vence hoy</span>}
                          {isOverdue(r, t) && <span className="badge b-bad" style={{ marginLeft: "6px" }}>atrasada</span>}
                        </td>
                        <td>
                          <span className={`badge ${installmentStatusBadge(r.status)}`}>
                            {INSTALLMENT_STATUS_LABELS[r.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty">Aún no hay cuotas.</div>
            )}
          </div>

          <div className="note">
            <p style={{ margin: 0 }}>
              Los montos en UF muestran un equivalente estimado en pesos (≈) hasta
              que la cuota se factura; ahí queda fijo con la UF del día.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
