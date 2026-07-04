import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getConnectionStatus } from "@/lib/google";
import { formatDate } from "@/lib/format";
import { desconectarGoogle, sincronizarAhora } from "./actions";

const MESSAGES: Record<string, { text: string; cls: string }> = {
  "connected=1": { text: "Google Calendar conectado.", cls: "b-ok" },
  "connected=norefresh": {
    text: "Conectado, pero Google no devolvió un refresh token. Revoca el acceso de esta app en tu cuenta de Google y vuelve a conectar.",
    cls: "b-warn",
  },
  "synced=1": { text: "Sincronización completada.", cls: "b-ok" },
  "disconnected=1": { text: "Google Calendar desconectado.", cls: "b-idle" },
  "error=config": {
    text: "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env.local.",
    cls: "b-bad",
  },
  "error=state": { text: "El flujo de conexión expiró. Reinténtalo.", cls: "b-bad" },
  "error=exchange": {
    text: "No se pudo completar la conexión con Google.",
    cls: "b-bad",
  },
  "error=sync": {
    text: "La sincronización falló. Revisa el mapeo de calendarios y la conexión.",
    cls: "b-bad",
  },
};

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const key = Object.entries(sp)
    .filter(([k]) => ["connected", "synced", "disconnected", "error"].includes(k))
    .map(([k, v]) => `${k}=${v}`)[0];
  const message = key ? MESSAGES[key] : null;

  const status = await getConnectionStatus();

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, google_calendar_id, accent_color")
    .order("name", { ascending: true });
  const list = clients ?? [];
  const mapped = list.filter((c) => c.google_calendar_id).length;

  return (
    <>
      <PageHeader
        title="Integraciones"
        subtitle="Google Calendar — sincronización bidireccional"
      />
      <div className="app-content">
        {message && (
          <div style={{ marginBottom: "18px" }}>
            <span className={`badge ${message.cls}`}>{message.text}</span>
          </div>
        )}

        <div className="stack">
          {/* Estado de conexión */}
          <div className="card">
            <div className="card-head">
              <h3>Google Calendar</h3>
              {status.connected ? (
                <span className="badge b-ok">Conectado</span>
              ) : (
                <span className="badge b-idle">Sin conectar</span>
              )}
            </div>
            <div className="card-body">
              {!status.configured ? (
                <p style={{ color: "var(--muted)", margin: 0 }}>
                  Falta configurar las credenciales de Google en{" "}
                  <span className="mono">.env.local</span> (
                  <span className="mono">GOOGLE_CLIENT_ID</span> y{" "}
                  <span className="mono">GOOGLE_CLIENT_SECRET</span>). Cuando las
                  pongas y reinicies el server, aquí aparecerá el botón para
                  conectar.
                </p>
              ) : status.connected ? (
                <>
                  <p style={{ color: "var(--muted)", marginTop: 0 }}>
                    Conectado. Última actualización de credenciales:{" "}
                    <span className="mono">{formatDate(status.updatedAt)}</span>.
                    El refresh token está cifrado en la base y nunca llega al
                    navegador.
                  </p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <form action={sincronizarAhora}>
                      <button className="btn btn-primary" type="submit">
                        Sincronizar ahora
                      </button>
                    </form>
                    <form action={desconectarGoogle}>
                      <button className="btn btn-danger" type="submit">
                        Desconectar
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: "var(--muted)", marginTop: 0 }}>
                    Conecta la cuenta de Google de Color Media para leer y
                    escribir en los calendarios de los clientes. Se piden permisos
                    de eventos de calendario; el calendario personal no se toca.
                  </p>
                  <a href="/api/auth/google" className="btn btn-primary">
                    Conectar Google Calendar
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Mapeo calendario ↔ cliente */}
          <div className="card">
            <div className="card-head">
              <h3>Calendarios por cliente</h3>
              <span className="tag">
                {mapped} de {list.length} mapeados
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Calendario de Google</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cli">
                        <span
                          className="dot"
                          style={{ background: c.accent_color ?? "#3dbdcb" }}
                        />
                        {c.name}
                      </div>
                    </td>
                    <td className="mono" style={{ color: c.google_calendar_id ? "var(--text)" : "var(--faint)" }}>
                      {c.google_calendar_id ?? "sin asignar"}
                    </td>
                    <td className="num">
                      <Link href={`/clientes/${c.id}`} className="btn btn-sm">
                        {c.google_calendar_id ? "Cambiar" : "Asignar"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="note">
            <p style={{ margin: 0 }}>
              La sincronización es bidireccional: los eventos creados o movidos en
              Google entran al panel (por syncToken, sin duplicar), y los hitos
              creados en el panel se escriben en el calendario del cliente. El
              cron puede llamar a <span className="mono">/api/calendar/sync</span>{" "}
              con el header <span className="mono">x-cron-secret</span>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
