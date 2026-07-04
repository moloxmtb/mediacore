import PageHeader from "@/components/PageHeader";
import GanttChart from "@/components/admin/GanttChart";
import { createClient } from "@/lib/supabase/server";
import type { Action, CalendarEvent, Deliverable, Phase } from "@/lib/types";

export default async function PortalAvancePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const supabase = await createClient();

  // RLS: solo los proyectos del propio cliente.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .order("created_at", { ascending: true });

  const projectList = (projects ?? []) as { id: string; name: string }[];
  const chips = projectList.map((x) => ({
    id: x.id,
    name: x.name,
    clientName: null,
  }));

  const selectedId =
    p && projectList.some((x) => x.id === p) ? p : (projectList[0]?.id ?? "");

  let phases: Phase[] = [];
  let events: CalendarEvent[] = [];
  const actionsByPhase: Record<string, Action[]> = {};
  const deliverablesByPhase: Record<string, Deliverable[]> = {};

  if (selectedId) {
    // Todas las consultas pasan por RLS: fases del proyecto propio, y acciones/
    // entregables/eventos solo los visibles para el cliente.
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
        supabase
          .from("calendar_events")
          .select("*")
          .eq("project_id", selectedId)
          .order("starts_at", { ascending: true }),
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
        title="Avance"
        subtitle="Tu carta Gantt: fases y hitos en el tiempo"
      />
      <div className="app-content">
        {projectList.length ? (
          <GanttChart
            projects={chips}
            selectedId={selectedId}
            phases={phases}
            events={events}
            actionsByPhase={actionsByPhase}
            deliverablesByPhase={deliverablesByPhase}
            basePath="/portal/avance"
          />
        ) : (
          <div className="card">
            <div className="empty">Aún no hay proyectos con fases que mostrar.</div>
          </div>
        )}
        <div className="note">
          <p style={{ margin: 0 }}>
            Haz clic en una barra para ver el detalle de la fase: acciones y
            entregables. Es la misma planificación que llevamos internamente, en
            modo lectura.
          </p>
        </div>
      </div>
    </>
  );
}
