import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ClientForm from "@/components/admin/ClientForm";
import { requireAdminRole } from "@/lib/auth";
import { crearCliente } from "../actions";

const SEC = "var(--sec-clientes)";

export default async function NuevoClientePage() {
  await requireAdminRole("clientes"); // owner-only (alta de cartera)
  return (
    <>
      <PageHeader title="Nuevo cliente" subtitle="Alta de una empresa en la cartera" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <Link href="/clientes" className="dback">← Volver a clientes</Link>
        <div className="dbox">
          <div className="dbox-body">
            <ClientForm action={crearCliente} submitLabel="Crear cliente" />
          </div>
        </div>
      </div>
    </>
  );
}
