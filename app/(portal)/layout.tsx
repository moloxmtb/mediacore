import { redirect } from "next/navigation";
import PortalNav from "@/components/portal/PortalNav";
import Brand from "@/components/Brand";
import SystemFooter from "@/components/SystemFooter";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout del portal del cliente (solo rol client, SOLO LECTURA). El middleware
 * ya impide que un admin caiga aquí; esta comprobación es defensa en
 * profundidad. El cliente NUNCA ve tarifas, contratos, cuotas ni cobros: esas
 * tablas no tienen política de lectura para él (ver schema.sql / fase5.sql).
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role !== "client") redirect("/dashboard");

  // El cliente solo puede leer su propia empresa (RLS clients: id = auth_client_id()).
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("name, accent_color")
    .maybeSingle();

  const companyName: string = client?.name ?? "Tu empresa";
  const contact = session.fullName ?? session.email ?? "Cliente";
  const initials = companyName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand" style={{ padding: "20px 18px" }}>
          <Brand size="sm" caption="Portal cliente" />
        </div>

        <PortalNav role={session.clientRole} />

        <div className="sidebar-who">
          <div
            className="avatar"
            style={{
              background: client?.accent_color
                ? `linear-gradient(135deg, ${client.accent_color}, #3d6bcb)`
                : undefined,
            }}
          >
            {initials}
          </div>
          <div>
            <div className="n">{companyName}</div>
            <div className="r">{contact}</div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        {children}
        <SystemFooter />
      </main>
    </div>
  );
}
