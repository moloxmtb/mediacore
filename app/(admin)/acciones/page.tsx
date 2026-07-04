import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

type Row = {
  id: string;
  action_date: string;
  title: string;
  description: string | null;
  result: string | null;
  kind: string | null;
  project_id: string | null;
  projects: { name: string } | null;
  clients: { name: string; accent_color: string | null } | null;
};

export default async function AccionesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("actions")
    .select(
      "id, action_date, title, description, result, kind, project_id, projects(name), clients(name, accent_color)",
    )
    .order("action_date", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Bitácora de acciones"
        subtitle="Registro de lo ejecutado por Color Media"
      />
      <div className="app-content">
        <div className="card">
          <div className="card-head">
            <h3>Acciones ejecutadas</h3>
            <span className="tag">{rows.length} registros</span>
          </div>
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Acción</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="mono" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {formatDate(a.action_date)}
                    </td>
                    <td>
                      <div className="cli">
                        <span
                          className="dot"
                          style={{ background: a.clients?.accent_color ?? "#3dbdcb" }}
                        />
                        {a.clients?.name ?? "—"}
                      </div>
                    </td>
                    <td>
                      {a.project_id ? (
                        <Link href={`/proyectos/${a.project_id}`} className="row-link">
                          {a.title}
                        </Link>
                      ) : (
                        a.title
                      )}
                      {a.description && (
                        <div className="meta" style={{ marginTop: "3px" }}>
                          {a.description}
                        </div>
                      )}
                    </td>
                    <td>{a.kind ? <span className="tag">{a.kind}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              Aún no hay acciones. Se registran desde la ficha de cada proyecto.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
