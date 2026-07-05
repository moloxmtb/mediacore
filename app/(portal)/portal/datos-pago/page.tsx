import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CompanyBankInfo } from "@/lib/types";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="kv-row">
      <span className="kv-k">{label}</span>
      <span className="kv-v mono">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

export default async function PortalDatosPagoPage() {
  const session = await getSessionProfile();
  if (!session || session.role !== "client") redirect("/login");

  const supabase = await createClient();
  // Datos globales de Color Media (iguales para todos los clientes).
  const { data } = await supabase
    .from("company_bank_info")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const b = (data as CompanyBankInfo | null) ?? null;

  const vacio =
    !b ||
    (!b.banco?.trim() && !b.numero_cuenta?.trim() && !b.razon_social?.trim());

  return (
    <>
      <PageHeader title="Datos de pago" subtitle="Datos de Color Media para transferencias" />
      <div className="app-content">
        <div className="stack">
          {vacio ? (
            <div className="card">
              <div className="empty">Aún no publicamos los datos de transferencia. Escríbenos si los necesitas.</div>
            </div>
          ) : (
            <div className="card">
              <div className="card-head">
                <h3>Transferencia bancaria</h3>
              </div>
              <div className="card-body kv">
                <Row label="Razón social" value={b.razon_social} />
                <Row label="RUT" value={b.rut} />
                <Row label="Banco" value={b.banco} />
                <Row label="Tipo de cuenta" value={b.tipo_cuenta} />
                <Row label="N° de cuenta" value={b.numero_cuenta} />
                <Row label="Correo" value={b.email} />
                {b.notas?.trim() && <Row label="Notas" value={b.notas} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
