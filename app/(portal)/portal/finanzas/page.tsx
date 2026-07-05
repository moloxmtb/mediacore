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
import { signInvoices } from "@/lib/storage";
import { flowConfigured } from "@/lib/flow";
import { iniciarPagoFlow, verificarPagoFlow } from "./pago-actions";
import type { Contract, Installment, InstallmentPayment } from "@/lib/types";

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

const PAGO_BANNER: Record<string, { text: string; cls: string }> = {
  ok: { text: "Pago confirmado por Flow. La cuota quedó pagada.", cls: "b-ok" },
  rechazado: { text: "El pago fue rechazado. La cuota sigue pendiente; puedes reintentar.", cls: "b-bad" },
  cancelado: { text: "El pago se canceló. La cuota sigue pendiente.", cls: "b-warn" },
  pendiente: { text: "El pago quedó en proceso. Puedes usar “Verificar pago” en un momento.", cls: "b-warn" },
  verificado: { text: "Estado del pago actualizado con Flow.", cls: "b-idle" },
  noconfig: { text: "El pago en línea no está configurado todavía.", cls: "b-warn" },
  noestado: { text: "Solo se pueden pagar cuotas ya facturadas.", cls: "b-warn" },
  error: { text: "No se pudo iniciar el pago. Inténtalo de nuevo.", cls: "b-bad" },
};

export default async function PortalFinanzasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePortalWorld("finance");
  const supabase = await createClient();

  const sp = await searchParams;
  const banner = sp.pago ? PAGO_BANNER[sp.pago] : null;

  // RLS ya limita a lo del propio cliente y solo owner/finance llega aquí.
  const [{ data: contractsData }, { data: instData }, { data: payData }, uf] = await Promise.all([
    supabase.from("contracts").select("*").order("start_date", { ascending: false }),
    supabase.from("installments").select("*").order("due_date", { ascending: true }),
    supabase.from("installment_payments").select("*").order("created_at", { ascending: false }),
    getLatestUf(),
  ]);
  const contracts = (contractsData ?? []) as Contract[];
  const cuotas = (instData ?? []) as Installment[];
  const t = today();

  // Último intento de pago por cuota (para mostrar "en proceso" / "verificar").
  const lastPayByInst = new Map<string, InstallmentPayment>();
  for (const p of (payData ?? []) as InstallmentPayment[]) {
    if (!lastPayByInst.has(p.installment_id)) lastPayByInst.set(p.installment_id, p);
  }
  const flowOn = flowConfigured();

  // Firma corta de las facturas PDF (RLS ya limitó las cuotas a este cliente).
  const pdfUrls = await signInvoices(
    cuotas.map((r) => r.invoice_pdf_path).filter((p): p is string => !!p),
  );

  let pagado = 0, porCobrar = 0, vencido = 0;
  for (const r of cuotas) {
    if (r.status === "pagada") pagado += r.total_clp ?? 0;
    else if (r.status === "facturada") {
      if (r.due_date < t) vencido += r.total_clp ?? 0;
      else porCobrar += r.total_clp ?? 0;
    }
  }

  // Alerta de pago próximo/vencido (≤7 días). Coherente con "Qué viene", para
  // que finanzas —que no pasa por el home de contenido— también la vea.
  const proxCuota = cuotas
    .filter((r) => r.status === "facturada")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  let pagoAlert: { tone: string; text: string } | null = null;
  if (proxCuota) {
    const dias = Math.round(
      (new Date(proxCuota.due_date + "T00:00:00").getTime() - new Date(t + "T00:00:00").getTime()) / 86400000,
    );
    if (dias < 0) pagoAlert = { tone: "b-bad", text: `Tienes un pago vencido (hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}).` };
    else if (dias <= 7) pagoAlert = { tone: "b-warn", text: dias === 0 ? "Tu próximo pago vence hoy." : `Tu próximo pago vence en ${dias} día${dias === 1 ? "" : "s"}.` };
  }

  return (
    <>
      <PageHeader title="Finanzas" subtitle="Tu contrato y tus cuotas" />
      <div className="app-content">
        {banner && (
          <div style={{ marginBottom: "18px" }}>
            <span className={`badge ${banner.cls}`}>{banner.text}</span>
          </div>
        )}
        {pagoAlert && (
          <div style={{ marginBottom: "18px" }}>
            <span className={`badge ${pagoAlert.tone}`}>{pagoAlert.text}</span>
          </div>
        )}
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
                    <th>Factura</th>
                    <th>Pago</th>
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
                        <td>
                          {r.invoice_pdf_path && pdfUrls[r.invoice_pdf_path] ? (
                            <a
                              className="btn btn-sm"
                              href={pdfUrls[r.invoice_pdf_path]}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Descargar
                            </a>
                          ) : (
                            <span style={{ color: "var(--faint)" }}>—</span>
                          )}
                        </td>
                        <td>
                          {(() => {
                            const pay = lastPayByInst.get(r.id);
                            if (r.status === "pagada") {
                              return <span style={{ color: "var(--muted)" }}>Pagada</span>;
                            }
                            if (r.status !== "facturada" || !flowOn) {
                              return <span style={{ color: "var(--faint)" }}>—</span>;
                            }
                            const pendiente = pay && (pay.status === "pending" || pay.status === "created");
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
                                <form action={iniciarPagoFlow}>
                                  <input type="hidden" name="installment_id" value={r.id} />
                                  <button className="btn btn-sm btn-primary" type="submit">
                                    {pendiente ? "Reintentar pago" : "Pagar"}
                                  </button>
                                </form>
                                {pendiente && (
                                  <form action={verificarPagoFlow}>
                                    <input type="hidden" name="installment_id" value={r.id} />
                                    <button className="btn btn-sm" type="submit">Verificar pago</button>
                                  </form>
                                )}
                                {pay?.status === "rejected" && (
                                  <span className="badge b-bad">último: rechazado</span>
                                )}
                              </div>
                            );
                          })()}
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
