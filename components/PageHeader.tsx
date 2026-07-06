import { logout } from "@/app/auth/actions";
import HelpLink from "@/components/HelpLink";

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="app-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <HelpLink />
        <form action={logout}>
          <button type="submit" className="logout-btn">
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
