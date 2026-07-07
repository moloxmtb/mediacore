import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ClientForm from "@/components/admin/ClientForm";
import { requireAdminRole } from "@/lib/auth";
import { crearCliente } from "../actions";

export default async function NuevoClientePage() {
  await requireAdminRole("clientes"); // owner-only (alta de cartera)
  return (
    <>
      <PageHeader title="Nuevo cliente" subtitle="Alta de una empresa en la cartera" />
      <div className="app-content">
        <Link href="/clientes" className="back-link">
          ← Volver a clientes
        </Link>
        <div className="card">
          <div className="card-body">
            <ClientForm action={crearCliente} submitLabel="Crear cliente" />
          </div>
        </div>
      </div>
    </>
  );
}
