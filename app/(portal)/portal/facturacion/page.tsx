import type { CSSProperties } from "react";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import { requirePortalWorld } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLatestUf } from "@/lib/uf";
import { stStyle as st, installmentTone, planItemTone, type Tone } from "@/lib/estado";
import { contractNetLabel, formatCLP, formatDate, formatUF } from "@/lib/format";
import {
  INSTALLMENT_STATUS_LABELS,
  MODALITY_LABELS,
  installmentCLP,
  isDueToday,
  ivaUF,
  totalUF,
} from "@/lib/billing";
import { signInvoices } from "@/lib/storage";
import { flowConfigured } from "@/lib/flow";
import { iniciarPagoFlow, verificarPagoFlow } from "./pago-actions";
import type {
  ClientPlanItem,
  CompanyBankInfo,
  Contract,
  Installment,
  InstallmentPayment,
  InstallmentStatus,
} from "@/lib/types";

// El portal usa UN solo acento (teal): no hay color por sección. --sec = acento.
const SEC = "var(--accent)";

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

// Banner de retorno de Flow: tono del semáforo (el rojo del pago rechazado sí
// aplica — es la excepción accionable de Facturación).
const PAGO_BANNER: Record<string, { text: string; tone: Tone }> = {
  ok: { text: "Pago confirmado por Flow. La cuota quedó pagada.", tone: "ok" },
  rechazado: { text: "El pago fue rechazado. La cuota sigue pendiente; puedes reintentar.", tone: "bad" },
  cancelado: { text: "El pago se canceló. La cuota sigue pendiente.", tone: "wait" },
  pendiente: { text: "El pago quedó en proceso. Puedes usar “Verificar pago” en un momento.", tone: "wait" },
  verificado: { text: "Estado del pago actualizado con Flow.", tone: "neutral" },
  noconfig: { text: "El pago en línea no está configurado todavía.", tone: "wait" },
  noestado: { text: "Solo se pueden pagar cuotas ya facturadas.", tone: "wait" },
  config: { text: "El pago en línea no está disponible por ahora. Escríbenos por WhatsApp al +569 9330 4736 y lo dejamos resuelto al tiro.", tone: "wait" },
  error: { text: "No se pudo iniciar el pago. Inténtalo de nuevo.", tone: "bad" },
};

// Tono + etiqueta EFECTIVOS de una cuota: una 'facturada' con vencimiento pasado
// se muestra como Vencida en ROJO (excepción del portal: en Facturación el
// vencido sí alarma, es info accionable). El resto sigue installmentTone.
function cuotaEstado(r: Installment, t: string): { tone: Tone; label: string } {
  if (r.status === "facturada" && r.due_date < t) return { tone: "bad", label: "Vencida" };
  return { tone: installmentTone[r.status as InstallmentStatus], label: INSTALLMENT_STATUS_LABELS[r.status] };
}

const IcoDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
);
const IcoList = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
);
const IcoCard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
);

export default async function PortalFacturacionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // GATE: solo owner + finance. El rol content rebota a su home (guard de
  // servidor, no solo el link oculto en el nav).
  await requirePortalWorld("finance");
  const supabase = await createClient();

  const sp = await searchParams;
  const banner = sp.pago ? PAGO_BANNER[sp.pago] : null;

  // RLS ya limita a lo del propio cliente y solo owner/finance llega aquí.
  const [
    { data: contractsData },
    { data: instData },
    { data: payData },
    { data: planData },
    { data: bankData },
    uf,
  ] = await Promise.all([
    supabase.from("contracts").select("*").order("start_date", { ascending: false }),
    supabase.from("installments").select("*").order("due_date", { ascending: true }),
    supabase.from("installment_payments").select("*").order("created_at", { ascending: false }),
    supabase.from("client_plan_items").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("company_bank_info").select("*").eq("id", 1).maybeSingle(),
    getLatestUf(),
  ]);
  const contracts = (contractsData ?? []) as Contract[];
  const cuotas = (instData ?? []) as Installment[];
  const planItems = (planData ?? []) as ClientPlanItem[];
  const bank = (bankData as CompanyBankInfo | null) ?? null;
  const t = today();

  const lastPayByInst = new Map<string, InstallmentPayment>();
  for (const p of (payData ?? []) as InstallmentPayment[]) {
    if (!lastPayByInst.has(p.installment_id)) lastPayByInst.set(p.installment_id, p);
  }
  const flowOn = flowConfigured();

  const pdfUrls = await signInvoices(cuotas.map((r) => r.invoice_pdf_path).filter((p): p is string => !!p));

  let pagado = 0, porCobrar = 0, vencido = 0;
  for (const r of cuotas) {
    if (r.status === "pagada") pagado += r.total_clp ?? 0;
    else if (r.status === "facturada") {
      if (r.due_date < t) vencido += r.total_clp ?? 0;
      else porCobrar += r.total_clp ?? 0;
    }
  }

  const proxCuota = cuotas.filter((r) => r.status === "facturada").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  let pagoAlert: { tone: Tone; text: string } | null = null;
  if (proxCuota) {
    const dias = Math.round((new Date(proxCuota.due_date + "T00:00:00").getTime() - new Date(t + "T00:00:00").getTime()) / 86400000);
    if (dias < 0) pagoAlert = { tone: "bad", text: `Tienes un pago vencido (hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}).` };
    else if (dias <= 7) pagoAlert = { tone: "wait", text: dias === 0 ? "Tu próximo pago vence hoy." : `Tu próximo pago vence en ${dias} día${dias === 1 ? "" : "s"}.` };
  }

  const bankVacio = !bank || (!bank.banco?.trim() && !bank.numero_cuenta?.trim() && !bank.razon_social?.trim());

  return (
    <>
      <PageHeader title="Facturación" subtitle="Tu contrato, tus cuotas y cómo pagar" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        {banner && (
          <div style={{ marginBottom: "14px" }}>
            <StateChip tone={banner.tone} label={banner.text} />
          </div>
        )}
        {pagoAlert && (
          <div style={{ marginBottom: "14px" }}>
            <StateChip tone={pagoAlert.tone} label={pagoAlert.text} />
          </div>
        )}

        {/* Tres tarjetas de estado ALINEADAS y teñidas (corrige el bloque
            desalineado que había en producción). */}
        <div className="paygrid">
          <div className="paycard" style={st("ok")}>
            <span className="plabel">Pagado</span>
            <span className="pval">{formatCLP(pagado)}</span>
          </div>
          <div className="paycard" style={st("wait")}>
            <span className="plabel">Por cobrar</span>
            <span className="pval">{formatCLP(porCobrar)}</span>
          </div>
          <div className="paycard" style={st("bad")}>
            <span className="plabel">Vencido</span>
            <span className="pval">{formatCLP(vencido)}</span>
          </div>
        </div>

        <div className="stack">
          {/* Tu contrato */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoDoc /></span>
              <h3>Tu contrato</h3>
            </div>
            {contracts.length ? (
              <table className="dtable">
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
                      <td className="mono mut">
                        {formatDate(c.start_date)}{c.end_date ? ` → ${formatDate(c.end_date)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dempty">Aún no hay contrato registrado.</div>
            )}
          </div>

          {/* Tu plan — alcance como pastillas de tipo (sin montos) */}
          {planItems.length > 0 && (
            <div className="dbox">
              <div className="dbox-head">
                <span className="dh-ico"><IcoList /></span>
                <h3>Tu plan</h3>
                <span className="dcount">{planItems.length}</span>
              </div>
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {planItems.map((it) => (
                  <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{it.name}</div>
                      {it.description?.trim() && <div className="mut" style={{ fontSize: "12.5px", marginTop: "2px" }}>{it.description}</div>}
                    </div>
                    <StateChip tone={planItemTone[it.status]} label={it.status === "activo" ? "En curso" : "Por venir"} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tus cuotas — chip + borde por estado, plata en mono */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoDoc /></span>
              <h3>Tus cuotas</h3>
              <span className="dcount mono">UF {uf.value != null ? formatCLP(uf.value) : "—"}</span>
            </div>
            {cuotas.length ? (
              <table className="dtable">
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
                    const est = cuotaEstado(r, t);
                    return (
                      <tr key={r.id} className="drow" style={st(est.tone)}>
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
                            {isUF && r.has_iva && r.net_uf != null && <span className="uf">{formatUF(ivaUF(r.net_uf, true))}</span>}
                          </div>
                        </td>
                        <td className="num">
                          <div className="amount mono">
                            {approx}{formatCLP(clp?.total_clp)}
                            {isUF && r.net_uf != null && <span className="uf">{formatUF(totalUF(r.net_uf, r.has_iva))}</span>}
                          </div>
                        </td>
                        <td className="mono mut" style={{ whiteSpace: "nowrap" }}>
                          {formatDate(r.due_date)}
                          {isDueToday(r, t) && <span className="dtype" style={{ marginLeft: "6px" }}>vence hoy</span>}
                        </td>
                        <td><StateChip tone={est.tone} label={est.label} /></td>
                        <td>
                          {r.invoice_pdf_path && pdfUrls[r.invoice_pdf_path] ? (
                            <a className="dbtn dbtn-sm" href={pdfUrls[r.invoice_pdf_path]} target="_blank" rel="noopener noreferrer">Descargar</a>
                          ) : (
                            <span className="mut">—</span>
                          )}
                        </td>
                        <td>
                          {(() => {
                            const pay = lastPayByInst.get(r.id);
                            if (r.status === "pagada") return <span className="mut">Pagada</span>;
                            if (r.status !== "facturada" || !flowOn) return <span className="mut">—</span>;
                            const pendiente = pay && (pay.status === "pending" || pay.status === "created");
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
                                <form action={iniciarPagoFlow}>
                                  <input type="hidden" name="installment_id" value={r.id} />
                                  <button className="dbtn dbtn-primary dbtn-sm" type="submit">{pendiente ? "Reintentar pago" : "Pagar"}</button>
                                </form>
                                {pendiente && (
                                  <form action={verificarPagoFlow}>
                                    <input type="hidden" name="installment_id" value={r.id} />
                                    <button className="dbtn dbtn-sm" type="submit">Verificar pago</button>
                                  </form>
                                )}
                                {pay?.status === "rejected" && <StateChip tone="bad" label="último: rechazado" />}
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
              <div className="dempty">Aún no hay cuotas.</div>
            )}
          </div>

          {/* Cómo pagar — datos bancarios de Color Media */}
          <div className="dbox">
            <div className="dbox-head">
              <span className="dh-ico"><IcoCard /></span>
              <h3>Cómo pagar</h3>
            </div>
            {bankVacio ? (
              <div className="dempty">Aún no publicamos los datos de transferencia. Escríbenos si los necesitas.</div>
            ) : (
              <div className="dbox-body kv">
                <div className="kv-row"><span className="kv-k">Razón social</span><span className="kv-v mono">{bank!.razon_social?.trim() || "—"}</span></div>
                <div className="kv-row"><span className="kv-k">RUT</span><span className="kv-v mono">{bank!.rut?.trim() || "—"}</span></div>
                <div className="kv-row"><span className="kv-k">Banco</span><span className="kv-v mono">{bank!.banco?.trim() || "—"}</span></div>
                <div className="kv-row"><span className="kv-k">Tipo de cuenta</span><span className="kv-v mono">{bank!.tipo_cuenta?.trim() || "—"}</span></div>
                <div className="kv-row"><span className="kv-k">N° de cuenta</span><span className="kv-v mono">{bank!.numero_cuenta?.trim() || "—"}</span></div>
                <div className="kv-row"><span className="kv-k">Correo</span><span className="kv-v mono">{bank!.email?.trim() || "—"}</span></div>
                {bank!.notas?.trim() && <div className="kv-row"><span className="kv-k">Notas</span><span className="kv-v mono">{bank!.notas}</span></div>}
              </div>
            )}
          </div>

          <div className="note">
            <p style={{ margin: 0 }}>
              Los montos en UF muestran un equivalente estimado en pesos (≈) hasta que la cuota se factura; ahí queda fijo con la UF del día.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
