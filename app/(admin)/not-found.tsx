import Link from "next/link";
import PageHeader from "@/components/PageHeader";

/**
 * 404 del panel interno. Vive bajo (admin), así que Next lo renderiza DENTRO
 * del shell: barra lateral, navegación y pie siguen ahí. Cubre tanto una URL
 * inexistente del panel como un notFound() de una ficha (un id borrado, por
 * ejemplo), que es el caso frecuente: el usuario sigue orientado y a un clic de
 * volver a lo suyo.
 */
export default function AdminNotFound() {
  return (
    <>
      <PageHeader title="Aquí no hay nada" subtitle="La página no existe o el registro fue eliminado" />
      <div className="app-content">
        <div className="dbox">
          <div className="dempty">
            <span>
              Puede que el enlace esté mal, o que quien lo creó ya lo haya borrado.
            </span>
            <Link href="/dashboard" className="dbtn dbtn-primary dbtn-sm">
              Volver al Resumen
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
