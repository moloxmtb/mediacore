import type { CSSProperties } from "react";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/admin/DeleteButton";
import CuotaEditForm from "@/components/admin/CuotaEditForm";
import NotificarButton from "@/components/admin/NotificarButton";
import SlideOver from "@/components/admin/SlideOver";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { getLatestUf } from "@/lib/uf";
import { formatCLP, formatDate, formatUF } from "@/lib/format";
import {
  INSTALLMENT_STATUS_LABELS,
  installmentCLP,
  isDueToday,
  isOverdue,
  ivaUF,
  MODALITY_LABELS,
  totalUF,
} from "@/lib/billing";
import type { ContractModality, Installment, InstallmentStatus } from "@/lib/types";
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

const SEC_COBROS = "var(--sec-cobros)";

// Estado (installment_status) → tono semántico, según MAPA-ESTADOS-COLORES.md §8a:
// proyectada gris · facturada ámbar · pagada verde · vencida rojo · anulada gris.
const ST: Record<"ok" | "wait" | "bad" | "neutral", string> = {
  ok: "var(--st-ok)",
  wait: "var(--st-wait)",
  bad: "var(--st-bad)",
  neutral: "var(--st-neutral)",
};
const STATUS_TONE: Record<InstallmentStatus, keyof typeof ST> = {
  proyectada: "neutral",
  facturada: "wait",
  pagada: "ok",
  vencida: "bad",
  anulada: "neutral",
};
const st = (v: string): CSSProperties => ({ ["--st" as string]: v }) as CSSProperties;

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    new Date(),
  );
}

/* ---------- Iconos (línea, 24x24) ---------- */
const IcoDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M9 13h6M9 17h6" />
  </svg>
);
const IcoEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const IcoView = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IcoUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </svg>
);
const IcoUnlink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M9.5 13.5l5 5M14.5 13.5l-5 5" />
  </svg>
);
const IcoBan = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </svg>
);

export default async function CobrosPage() {
  const session = await requireAdminRole("cobros"); // owner-only (finanzas)
  // Belt-and-suspenders: la página ya es owner-only por requireAdminRole, pero el
  // botón "notificar" (cobro = finanzas) se condiciona explícito a owner igual.
  const isOwner = session.adminRole === "owner";
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
      <div className="app-content" style={{ ["--sec" as string]: SEC_COBROS } as CSSProperties}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span className="mono" style={{ fontSize: "12px", color: "var(--tx-2)" }}>
            UF {uf.value != null ? formatCLP(uf.value) : "—"}
            {uf.date ? ` · ${formatDate(uf.date)}` : ""}
          </span>
          <form action={actualizarUf}>
            <button className="dbtn dbtn-sm" type="submit">
              Actualizar UF
            </button>
          </form>
        </div>

        {/* Resumen: tarjetas de fondo teñido completo por estado */}
        <div className="paygrid">
          <div className="paycard" style={st(ST.ok)}>
            <span className="plabel">Pagado</span>
            <span className="pval">{formatCLP(pagado)}</span>
          </div>
          <div className="paycard" style={st(ST.wait)}>
            <span className="plabel">Por cobrar</span>
            <span className="pval">{formatCLP(porCobrar)}</span>
          </div>
          <div className="paycard" style={st(ST.bad)}>
            <span className="plabel">Vencido</span>
            <span className="pval">{formatCLP(vencido)}</span>
          </div>
        </div>

        <div className="dbox">
          <div className="dbox-head">
            <span className="dh-ico"><IcoDoc /></span>
            <h3>Cuotas</h3>
            <span className="dcount">{rows.length}</span>
          </div>

          {rows.length ? (
            <table className="dtable">
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
                  const tone = ST[STATUS_TONE[r.status]];
                  const pdfUrl = r.invoice_pdf_path ? pdfUrls[r.invoice_pdf_path] : undefined;
                  return (
                    <tr key={r.id} className="drow" style={st(tone)}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                          <span className="cli-sq" style={{ background: r.clients?.accent_color ?? "var(--sec-cobros)" }} />
                          <div>
                            <div>{r.clients?.name ?? "—"}</div>
                            <div className="mut" style={{ fontSize: "11.5px", marginTop: "1px" }}>
                              {r.contracts ? MODALITY_LABELS[r.contracts.modality] : ""} · cuota {r.number}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num">
                        <div className="mono">
                          {approx}
                          {formatCLP(clp?.net_clp)}
                          {isUF && r.net_uf != null && (
                            <span className="mut" style={{ display: "block", fontSize: "11.5px", marginTop: "1px" }}>{formatUF(r.net_uf)}</span>
                          )}
                        </div>
                      </td>
                      <td className="num">
                        <div className="mono">
                          {r.has_iva ? `${approx}${formatCLP(clp?.iva_clp)}` : "exento"}
                          {isUF && r.has_iva && r.net_uf != null && (
                            <span className="mut" style={{ display: "block", fontSize: "11.5px", marginTop: "1px" }}>{formatUF(ivaUF(r.net_uf, true))}</span>
                          )}
                        </div>
                      </td>
                      <td className="num">
                        <div className="mono">
                          {approx}
                          {formatCLP(clp?.total_clp)}
                          {isUF && r.net_uf != null && (
                            <span className="mut" style={{ display: "block", fontSize: "11.5px", marginTop: "1px" }}>{formatUF(totalUF(r.net_uf, r.has_iva))}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="mono mut" style={{ whiteSpace: "nowrap" }}>{formatDate(r.due_date)}</span>
                        {dueToday && (
                          <span className="dchip" style={{ ...st(ST.wait), marginLeft: "6px" }}>vence hoy</span>
                        )}
                        {overdue && (
                          <span className="dchip" style={{ ...st(ST.bad), marginLeft: "6px" }}>atrasada</span>
                        )}
                      </td>
                      <td>
                        <span className="dchip" style={st(tone)}>
                          {INSTALLMENT_STATUS_LABELS[r.status]}
                        </span>
                        {r.dte_number && (
                          <div className="mut mono" style={{ fontSize: "11px", marginTop: "3px" }}>
                            DTE {r.dte_number}
                          </div>
                        )}
                      </td>
                      <td className="num">
                        <div className="dacts">
                          {/* Acción principal contextual (texto, tono teal) */}
                          {r.status === "proyectada" && (
                            <SlideOver
                              title="Facturar cuota"
                              sec={SEC_COBROS}
                              triggerClass="dbtn dbtn-primary dbtn-sm"
                              trigger={<>Facturar</>}
                            >
                              <form action={facturarCuota} className="so-form">
                                <input type="hidden" name="id" value={r.id} />
                                <div>
                                  <label>N° DTE (opcional)</label>
                                  <input name="dte_number" placeholder="N° DTE" />
                                </div>
                                <button className="dbtn dbtn-primary" type="submit">
                                  Confirmar facturación
                                </button>
                              </form>
                            </SlideOver>
                          )}
                          {r.status === "facturada" && (
                            <form action={marcarPagada}>
                              <input type="hidden" name="id" value={r.id} />
                              <button className="dbtn dbtn-primary dbtn-sm" type="submit">
                                Cobrar
                              </button>
                            </form>
                          )}
                          {r.status === "pagada" && pdfUrl && (
                            <a
                              className="dbtn dbtn-primary dbtn-sm"
                              href={pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Ver factura
                            </a>
                          )}

                          {/* Acciones secundarias (iconos con tooltip) */}
                          {r.status === "facturada" && pdfUrl && (
                            <a className="dact" data-tip="Ver factura PDF" aria-label="Ver factura PDF" href={pdfUrl} target="_blank" rel="noopener noreferrer">
                              <IcoView />
                            </a>
                          )}
                          {(r.status === "facturada" || r.status === "pagada") && (
                            <SlideOver
                              title={r.invoice_pdf_path ? "Reemplazar factura PDF" : "Subir factura PDF"}
                              sec={SEC_COBROS}
                              triggerClass="dact"
                              triggerTip={r.invoice_pdf_path ? "Reemplazar PDF" : "Subir factura PDF"}
                              triggerAria="Factura PDF"
                              trigger={<IcoUpload />}
                            >
                              <form action={subirFacturaPdf} className="so-form">
                                <input type="hidden" name="id" value={r.id} />
                                <div>
                                  <label>Archivo PDF</label>
                                  <input type="file" name="pdf" accept="application/pdf" required />
                                </div>
                                <button className="dbtn dbtn-primary" type="submit">
                                  {r.invoice_pdf_path ? "Reemplazar" : "Subir"}
                                </button>
                              </form>
                            </SlideOver>
                          )}
                          {(r.status === "facturada" || r.status === "pagada") && r.invoice_pdf_path && (
                            <form action={eliminarFacturaPdf} style={{ display: "inline-flex" }}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="path" value={r.invoice_pdf_path} />
                              <button className="dact dact-del" type="submit" data-tip="Quitar PDF" aria-label="Quitar PDF">
                                <IcoUnlink />
                              </button>
                            </form>
                          )}
                          {r.status === "facturada" && (
                            <form action={anularCuota} style={{ display: "inline-flex" }}>
                              <input type="hidden" name="id" value={r.id} />
                              <button className="dact dact-del" type="submit" data-tip="Anular" aria-label="Anular cuota">
                                <IcoBan />
                              </button>
                            </form>
                          )}
                          {r.status === "proyectada" && (
                            <SlideOver
                              title="Editar cuota"
                              sec={SEC_COBROS}
                              triggerClass="dact"
                              triggerTip="Editar"
                              triggerAria="Editar cuota"
                              trigger={<IcoEdit />}
                            >
                              <CuotaEditForm action={actualizarCuota} installment={r} />
                            </SlideOver>
                          )}
                          {r.status === "proyectada" && (
                            <DeleteButton
                              icon
                              action={eliminarCuota}
                              hidden={{ id: r.id }}
                              label="Eliminar"
                              confirm="¿Eliminar esta cuota proyectada?"
                            />
                          )}
                          {isOwner && <NotificarButton kind="cobro" id={r.id} icon sec={SEC_COBROS} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="dempty">
              Aún no hay cuotas. Genera las cuotas de un contrato desde la ficha
              del cliente (sección Contratos → “Generar cuotas”).
            </div>
          )}
        </div>

        <p style={{ color: "var(--tx-2)", fontSize: "12.5px", lineHeight: 1.6, marginTop: "16px", maxWidth: "70ch" }}>
          Se guarda el <b>neto</b> por separado del IVA; el total con IVA nunca
          se almacena como base. Las cuotas en UF muestran un CLP estimado
          (≈) hasta que las facturas: al facturar se <b>congela la UF del día</b>{" "}
          y el CLP queda fijo. El panel no emite el DTE (eso ocurre en SII o
          Nubox); aquí solo registras el número y el estado.
        </p>
      </div>
    </>
  );
}
