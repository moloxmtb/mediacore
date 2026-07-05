import { APP_VERSION, APP_UPDATED } from "@/lib/version";
import { formatDate } from "@/lib/format";

/**
 * Sello de identidad + versión + contacto comercial. Discreto, al pie de ambas
 * caras (panel y portal). La versión vive en un solo lugar (lib/version.ts);
 * la fecha de actualización es automática.
 */
export default function SystemFooter() {
  return (
    <footer className="system-footer">
      <span className="sf-brand">
        <strong>Media Core</strong> · desarrollado por Color Media ·{" "}
        <span className="sf-version">v{APP_VERSION}</span>
        <span className="sf-date"> · actualizado {formatDate(APP_UPDATED.slice(0, 10))}</span>
      </span>
      <span className="sf-contact">
        ¿Quieres un sistema a la medida? Escríbenos a{" "}
        <a href="mailto:hola@colormedia.cl">hola@colormedia.cl</a>
      </span>
    </footer>
  );
}
