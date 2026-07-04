import { redirect } from "next/navigation";
import AdminNav from "@/components/admin/AdminNav";
import { getSessionProfile } from "@/lib/auth";

/**
 * Layout del panel interno (solo admin). El middleware ya bloquea el acceso
 * de clientes a esta área; esta comprobación es defensa en profundidad.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/portal");

  const name = session.fullName ?? session.email ?? "Administrador";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-bars" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="brand-txt">
            <div className="name">Color Media</div>
            <div className="sub">Panel interno</div>
          </div>
        </div>

        <AdminNav />

        <div className="sidebar-who">
          <div className="avatar">{initials}</div>
          <div>
            <div className="n">{name}</div>
            <div className="r">Administrador</div>
          </div>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
