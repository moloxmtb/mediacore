import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GanttChart from "@/components/admin/GanttChart";
import { createClient } from "@/lib/supabase/server";
import type { Action, CalendarEvent, Deliverable, Phase } from "@/lib/types";

// La Gantt es una vista de PROYECTOS: hereda su tono (el brief no le asigna uno propio).
const SEC = "var(--sec-proyectos)";

export default async function GanttPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, client_id, clients(name)")
    .order("created_at", { ascending: true });

  const projectList = (projects ?? []) as unknown as {
    id: string;
    name: string;
    client_id: string;
    clients: { name: string } | null;
  }[];

  const chips = projectList.map((x) => ({
    id: x.id,
    name: x.name,
    clientName: x.clients?.name ?? null,
  }));

  const selectedId =
    p && projectList.some((x) => x.id === p)
      ? p
      : (projectList[0]?.id ?? "");
  const selectedProject = projectList.find((x) => x.id === selectedId);

  let phases: Phase[] = [];
  let events: CalendarEvent[] = [];
  const actionsByPhase: Record<string, Action[]> = {};
  const deliverablesByPhase: Record<string, Deliverable[]> = {};

  if (selectedId) {
    const [{ data: ph }, { data: ac }, { data: de }, { data: ev }] =
      await Promise.all([
        supabase
          .from("phases")
          .select("*")
          .eq("project_id", selectedId)
          .order("sort_order", { ascending: true })
          .order("start_date", { ascending: true }),
        supabase
          .from("actions")
          .select("*")
          .eq("project_id", selectedId)
          .not("phase_id", "is", null)
          .order("action_date", { ascending: false }),
        supabase
          .from("deliverables")
          .select("*")
          .eq("project_id", selectedId)
          .not("phase_id", "is", null)
          .order("created_at", { ascending: true }),
        // Hitos del cliente del proyecto (el calendario es por cliente).
        selectedProject
          ? supabase
              .from("calendar_events")
              .select("*")
              .eq("client_id", selectedProject.client_id)
              .order("starts_at", { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

    phases = (ph ?? []) as Phase[];
    events = (ev ?? []) as CalendarEvent[];
    for (const a of (ac ?? []) as Action[]) {
      (actionsByPhase[a.phase_id!] ??= []).push(a);
    }
    for (const d of (de ?? []) as Deliverable[]) {
      (deliverablesByPhase[d.phase_id!] ??= []).push(d);
    }
  }

  return (
    <>
      <PageHeader
        title="Carta Gantt"
        subtitle="Planificación y avance por proyecto"
      />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        {projectList.length ? (
          <GanttChart
            projects={chips}
            selectedId={selectedId}
            phases={phases}
            events={events}
            actionsByPhase={actionsByPhase}
            deliverablesByPhase={deliverablesByPhase}
          />
        ) : (
          <div className="dbox">
            <div className="dempty">
              <span>Aún no hay proyectos. Crea uno y agrégale fases para ver su carta Gantt.</span>
              <Link href="/proyectos/nuevo" className="dbtn dbtn-primary dbtn-sm">+ Nuevo proyecto</Link>
            </div>
          </div>
        )}

        <div className="note">
          <p style={{ margin: 0 }}>
            Haz clic en una barra para ver la descripción de la fase, las
            acciones ejecutadas y los entregables con su resultado. Esta misma
            Gantt la verá el cliente en su portal (Fase 6), en modo lectura y sin
            datos financieros. El porcentaje de avance lo actualizas tú desde la
            ficha del proyecto.
          </p>
        </div>
      </div>
    </>
  );
}
