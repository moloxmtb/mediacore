import { redirect } from "next/navigation";
import PortalNav from "@/components/portal/PortalNav";
import Brand from "@/components/Brand";
import AppShell from "@/components/AppShell";
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

  // Logo de la empresa (bucket público 'logos'). RLS client_details: el cliente
  // lee su propia ficha. Sin logo → null y el sidebar muestra solo el nombre.
  const { data: details } = await supabase
    .from("client_details")
    .select("logo_path")
    .maybeSingle();
  const logoUrl = details?.logo_path
    ? supabase.storage.from("logos").getPublicUrl(details.logo_path).data.publicUrl
    : null;

  // Conteos para los badges del nav. La RLS ya limita cada tabla al mundo
  // correcto (content_pieces: owner/content; installments: owner/finance), así
  // que un rol que no corresponde recibe 0.
  const [{ count: contentPend }, { count: financePend }] = await Promise.all([
    supabase
      .from("content_pieces")
      .select("id", { count: "exact", head: true })
      .eq("status", "propuesta"),
    supabase
      .from("installments")
      .select("id", { count: "exact", head: true })
      .eq("status", "facturada"),
  ]);
  const navCounts: Record<string, number> = {
    "/portal/contenido": contentPend ?? 0,
    "/portal/finanzas": financePend ?? 0,
  };

  // Nombre = marca corta (clients.name), no la razón social legal.
  const companyName: string = client?.name ?? "Tu empresa";
  const contact = session.fullName ?? session.email ?? "Cliente";
  const contactSub = session.fullName ? session.email : null;
  const initials = contact
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
            <Brand size="sm" caption="Portal cliente" />
          </div>

          {/* Identidad de la empresa del cliente (señal de pertenencia). Con logo:
              logo arriba (proporción real) + nombre debajo. Sin logo: solo nombre. */}
          <div className="sidebar-client">
            {logoUrl && (
              <div className="sidebar-logo-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={companyName} className="sidebar-logo" />
              </div>
            )}
            <div className="sidebar-client-name">{companyName}</div>
          </div>

          <PortalNav role={session.clientRole} counts={navCounts} />

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
              <div className="n">{contact}</div>
              {contactSub && <div className="r">{contactSub}</div>}
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
