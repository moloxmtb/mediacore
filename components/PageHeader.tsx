import { logout } from "@/app/auth/actions";

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
      <form action={logout}>
        <button type="submit" className="logout-btn">
          Cerrar sesión
        </button>
      </form>
    </header>
  );
}
