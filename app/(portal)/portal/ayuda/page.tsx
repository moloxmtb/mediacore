import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import HelpCenter from "@/components/HelpCenter";
import { getSessionProfile } from "@/lib/auth";
import { CLIENT_HELP } from "@/lib/help-content";

// Centro de ayuda del cliente: accesible a los TRES roles (no se gatea por
// mundo). Solo lectura, sin datos: no toca la base.
export default async function PortalAyudaPage() {
  const session = await getSessionProfile();
  if (!session || session.role !== "client") redirect("/login");

  return (
    <>
      <PageHeader title="Centro de ayuda" subtitle="Busca tu duda por palabra clave o explora los temas" />
      <div className="app-content">
        <HelpCenter content={CLIENT_HELP} />
      </div>
    </>
  );
}
