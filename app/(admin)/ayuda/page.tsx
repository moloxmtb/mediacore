import PageHeader from "@/components/PageHeader";
import HelpCenter from "@/components/HelpCenter";
import { ADMIN_HELP } from "@/lib/help-content";

// Centro de ayuda del administrador. Vive bajo (admin): el layout ya redirige a
// cualquier cliente fuera, así que es solo para el admin. Solo lectura.
export default function AdminAyudaPage() {
  return (
    <>
      <PageHeader title="Centro de ayuda" subtitle="Guía práctica del panel, tarea por tarea" />
      <div className="app-content">
        <HelpCenter content={ADMIN_HELP} />
      </div>
    </>
  );
}
