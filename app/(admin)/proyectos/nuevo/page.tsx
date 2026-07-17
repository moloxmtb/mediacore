import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ProjectForm from "@/components/admin/ProjectForm";
import { createClient } from "@/lib/supabase/server";
import { crearProyecto } from "../actions";

const SEC = "var(--sec-proyectos)";

export default async function NuevoProyectoPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <>
      <PageHeader title="Nuevo proyecto" subtitle="Alta de un proyecto para un cliente" />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <Link href="/proyectos" className="dback">← Volver a proyectos</Link>
        <div className="dbox">
          <div className="dbox-body">
            <ProjectForm
              action={crearProyecto}
              clients={clients ?? []}
              defaultClientId={client}
              submitLabel="Crear proyecto"
            />
          </div>
        </div>
      </div>
    </>
  );
}
