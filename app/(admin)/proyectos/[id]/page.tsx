import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ProjectForm from "@/components/admin/ProjectForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_STATUS_LABELS } from "@/lib/format";
import type { Project } from "@/lib/types";
import { actualizarProyecto, eliminarProyecto } from "../actions";

export default async function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: clients }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
  ]);

  if (!project) notFound();
  const p = project as Project;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`Proyecto · ${PROJECT_STATUS_LABELS[p.status]}`}
      />
      <div className="app-content">
        <Link href="/proyectos" className="back-link">
          ← Volver a proyectos
        </Link>
        <div className="card">
          <div className="card-body">
            <ProjectForm
              action={actualizarProyecto}
              clients={clients ?? []}
              project={p}
              submitLabel="Guardar cambios"
            />
            <div style={{ marginTop: "18px", borderTop: "1px solid var(--border-soft)", paddingTop: "16px" }}>
              <DeleteButton
                action={eliminarProyecto}
                hidden={{ id: p.id }}
                label="Eliminar proyecto"
                confirm={`¿Eliminar el proyecto ${p.name}? Esta acción no se puede deshacer.`}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
