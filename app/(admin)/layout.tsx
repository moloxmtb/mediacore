import { redirect } from "next/navigation";
import AdminNav from "@/components/admin/AdminNav";
import Brand from "@/components/Brand";
import AppShell from "@/components/AppShell";
import SystemFooter from "@/components/SystemFooter";
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
    <AppShell
      sidebar={
        <>
          <div className="sidebar-brand" style={{ padding: "20px 18px" }}>
            <Brand size="sm" caption="Panel interno" />
          </div>

          <AdminNav />

          <div className="sidebar-who">
            <div className="avatar">{initials}</div>
            <div>
              <div className="n">{name}</div>
              <div className="r">Administrador</div>
            </div>
          </div>
        </>
      }
    >
      {children}
      <SystemFooter />
    </AppShell>
  );
}
