import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/admin/DeleteButton";
import CuotaEditForm from "@/components/admin/CuotaEditForm";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { getLatestUf } from "@/lib/uf";
import { formatCLP, formatDate, formatUF } from "@/lib/format";
import {
  INSTALLMENT_STATUS_LABELS,
  installmentCLP,
  installmentStatusBadge,
  isDueToday,
  isOverdue,
  ivaUF,
  MODALITY_LABELS,
  totalUF,
} from "@/lib/billing";
import type { ContractModality, Installment } from "@/lib/types";
import {
  actualizarCuota,
  anularCuota,
  actualizarUf,
  eliminarCuota,
  eliminarFacturaPdf,
  facturarCuota,
  marcarPagada,
  subirFacturaPdf,
} from "./actions";
import { signInvoices } from "@/lib/storage";

type Row = Installment & {
  contracts: { modality: ContractModality } | null;
  clients: { name: string; accent_color: string | null } | null;
};

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    new Date(),
  );
}

export default async function CobrosPage() {
  await requireAdminRole("cobros"); // owner-only (finanzas)
  const supabase = await createClient();
  const [{ data }, uf] = await Promise.all([
    supabase
      .from("installments")
      .select("*, contracts(modality), clients(name, accent_color)")
      .order("due_date", { ascending: true }),
    getLatestUf(),
  ]);

  const rows = (data ?? []) as unknown as Row[];
  const t = today();

  // Firma corta de los PDF ya archivados (se archivan por cuota).
  const pdfUrls = await signInvoices(
    rows.map((r) => r.invoice_pdf_path).filter((p): p is string => !!p),
  );

  // Paybar: solo cuotas ya facturadas o pagadas cuentan como cobro.
  let pagado = 0;
  let porCobrar = 0;
  let vencido = 0;
  for (const r of rows) {
    if (r.status === "pagada") pagado += r.total_clp ?? 0;
    else if (r.status === "facturada") {
      if (r.due_date < t) vencido += r.total_clp ?? 0;
      else porCobrar += r.total_clp ?? 0;
    }
  }

  return (
    <>
      <PageHeader
        title="Cobros y contratos"
        subtitle="Cuotas por acuerdo: neto, IVA y total en UF y CLP"
      />
      <div className="app-content">
        <div className="page-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="tag mono">
            UF {uf.value != null ? formatCLP(uf.value) : "—"}
            {uf.date ? ` · ${formatDate(uf.date)}` : ""}
          </span>
          <form action={actualizarUf}>
            <button className="btn btn-sm" type="submit">
              Actualizar UF
            </button>
          </form>
        </div>

        <div className="paybar">
          <div className="paycell">
            <div className="k">
              <span className="badge b-ok" style={{ padding: "2px 8px" }}>Pagado</span>
            </div>
            <div className="v mono">{formatCLP(pagado)}</div>
          </div>
          <div className="paycell">
            <div className="k">
              <span className="badge b-accent" style={{ padding: "2px 8px" }}>Por cobrar</span>
            </div>
            <div className="v mono">{formatCLP(porCobrar)}</div>
          </div>
          <div className="paycell">
            <div className="k">
              <span className="badge b-bad" style={{ padding: "2px 8px" }}>Vencido</span>
            </div>
            <div className="v mono">{formatCLP(vencido)}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Cuotas</h3>
            <span className="tag">{rows.length}</span>
          </div>

          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Cliente / cuota</th>
                  <th className="num">Neto</th>
                  <th className="num">IVA</th>
                  <th className="num">Total</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const clp = installmentCLP(r, uf.value);
                  const isUF = r.currency === "UF";
                  const approx = !clp?.frozen ? "≈ " : "";
                  const dueToday = isDueToday(r, t);
                  const overdue = isOverdue(r, t);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="cli">
                          <span className="dot" style={{ background: r.clients?.accent_color ?? "#3dbdcb" }} />
                          <div>
                            <div>{r.clients?.name ?? "—"}</div>
                            <div className="meta">
                              {r.contracts ? MODALITY_LABELS[r.contracts.modality] : ""} · cuota {r.number}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num">
                        <div className="amount mono">
                          {approx}
                          {formatCLP(clp?.net_clp)}
                          {isUF && r.net_uf != null && (
                            <span className="uf">{formatUF(r.net_uf)}</span>
                          )}
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
                          {approx}
                          {formatCLP(clp?.total_clp)}
                          {isUF && r.net_uf != null && (
                            <span className="uf">{formatUF(totalUF(r.net_uf, r.has_iva))}</span>
                          )}
                        </div>
                      </td>
                      <td className="mono" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDate(r.due_date)}
                        {dueToday && (
                          <span className="badge b-warn" style={{ marginLeft: "6px" }}>vence hoy</span>
                        )}
                        {overdue && (
                          <span className="badge b-bad" style={{ marginLeft: "6px" }}>atrasada</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${installmentStatusBadge(r.status)}`}>
                          {INSTALLMENT_STATUS_LABELS[r.status]}
                        </span>
                        {r.dte_number && (
                          <div className="meta mono" style={{ marginTop: "3px" }}>
                            DTE {r.dte_number}
                          </div>
                        )}
                      </td>
                      <td className="num">
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                          {r.status === "proyectada" && (
                            <>
                              <details>
                                <summary className="btn btn-sm btn-primary">Facturar</summary>
                                <form
                                  action={facturarCuota}
                                  style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}
                                >
                                  <input type="hidden" name="id" value={r.id} />
                                  <input name="dte_number" placeholder="N° DTE (opcional)" />
                                  <button className="btn btn-sm btn-primary" type="submit">
                                    Confirmar facturación
                                  </button>
                                </form>
                              </details>
                              <details>
                                <summary className="btn btn-sm">Editar</summary>
                                <div style={{ marginTop: "8px" }}>
                                  <CuotaEditForm action={actualizarCuota} installment={r} />
                                </div>
                              </details>
                              <DeleteButton
                                action={eliminarCuota}
                                hidden={{ id: r.id }}
                                label="Eliminar"
                                confirm="¿Eliminar esta cuota proyectada?"
                              />
                            </>
                          )}
                          {r.status === "facturada" && (
                            <>
                              <form action={marcarPagada}>
                                <input type="hidden" name="id" value={r.id} />
                                <button className="btn btn-sm btn-primary" type="submit">
                                  Marcar pagada
                                </button>
                              </form>
                              <form action={anularCuota}>
                                <input type="hidden" name="id" value={r.id} />
                                <button className="btn btn-sm btn-danger" type="submit">
                                  Anular
                                </button>
                              </form>
                            </>
                          )}
                          {(r.status === "facturada" || r.status === "pagada") && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                              {r.invoice_pdf_path && pdfUrls[r.invoice_pdf_path] && (
                                <a
                                  className="btn btn-sm"
                                  href={pdfUrls[r.invoice_pdf_path]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Ver factura PDF
                                </a>
                              )}
                              <details>
                                <summary className="btn btn-sm">
                                  {r.invoice_pdf_path ? "Reemplazar PDF" : "Subir factura PDF"}
                                </summary>
                                <form
                                  action={subirFacturaPdf}
                                  style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}
                                >
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="file" name="pdf" accept="application/pdf" required />
                                  <button className="btn btn-sm btn-primary" type="submit">
                                    {r.invoice_pdf_path ? "Reemplazar" : "Subir"}
                                  </button>
                                </form>
                              </details>
                              {r.invoice_pdf_path && (
                                <form action={eliminarFacturaPdf}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="path" value={r.invoice_pdf_path} />
                                  <button className="btn btn-sm btn-danger" type="submit">
                                    Quitar PDF
                                  </button>
                                </form>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              Aún no hay cuotas. Genera las cuotas de un contrato desde la ficha
              del cliente (sección Contratos → “Generar cuotas”).
            </div>
          )}
        </div>

        <div className="note">
          <p style={{ margin: 0 }}>
            Se guarda el <b>neto</b> por separado del IVA; el total con IVA nunca
            se almacena como base. Las cuotas en UF muestran un CLP estimado
            (≈) hasta que las facturas: al facturar se <b>congela la UF del día</b>{" "}
            y el CLP queda fijo. El panel no emite el DTE (eso ocurre en SII o
            Nubox); aquí solo registras el número y el estado.
          </p>
        </div>
      </div>
    </>
  );
}
