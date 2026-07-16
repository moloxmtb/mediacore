import type { CSSProperties } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StateChip from "@/components/admin/StateChip";
import { CollapsibleBox, CollapseControl } from "@/components/admin/CollapsibleBox";
import type { Tone } from "@/lib/estado";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/auth";
import { getConnectionStatus } from "@/lib/google";
import { formatDate } from "@/lib/format";
import {
  desconectarGoogle,
  guardarDatosBancarios,
  guardarNotificaciones,
  sincronizarAhora,
} from "./actions";
import type { CompanyBankInfo } from "@/lib/types";
import { mailConfigured } from "@/lib/mail";

const MESSAGES: Record<string, { text: string; tone: Tone }> = {
  "connected=1": { text: "Google Calendar conectado.", tone: "ok" },
  "connected=norefresh": {
    text: "Conectado, pero Google no devolvió un refresh token. Revoca el acceso de esta app en tu cuenta de Google y vuelve a conectar.",
    tone: "wait",
  },
  "synced=1": { text: "Sincronización completada.", tone: "ok" },
  "disconnected=1": { text: "Google Calendar desconectado.", tone: "neutral" },
  "error=config": {
    text: "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env.local.",
    tone: "bad",
  },
  "error=state": { text: "El flujo de conexión expiró. Reinténtalo.", tone: "bad" },
  "error=exchange": {
    text: "No se pudo completar la conexión con Google.",
    tone: "bad",
  },
  "error=sync": {
    text: "La sincronización falló. Revisa el mapeo de calendarios y la conexión.",
    tone: "bad",
  },
};

// SISTEMA: el brief no le asigna tono de sección → neutro.
const SEC = "var(--tx-2)";

const ico = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IcoPlug = () => ico(<><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z" /><path d="M12 17v5" /></>);
const IcoCal = () => ico(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></>);
const IcoMail = () => ico(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>);
const IcoBank = () => ico(<><path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M12 3l9 5H3z" /></>);

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole("integraciones"); // owner-only (config/sistema)
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

  // Config de notificaciones por correo.
  const [{ data: notifRows }, { data: notifConfig }] = await Promise.all([
    supabase.from("notification_settings").select("event_type, to_internal, to_client"),
    supabase.from("notification_config").select("internal_emails").eq("id", 1).maybeSingle(),
  ]);
  const notif = new Map(
    (notifRows ?? []).map((r) => [r.event_type as string, r]),
  );

  const { data: bankRow } = await supabase
    .from("company_bank_info")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const bank = (bankRow as CompanyBankInfo | null) ?? null;
  const NOTIF_LABELS: Record<string, string> = {
    accion: "Acciones (bitácora)",
    hito: "Hitos de calendario",
    reunion: "Reuniones",
  };

  return (
    <>
      <PageHeader
        title="Integraciones"
        subtitle="Google Calendar — sincronización bidireccional"
      />
      <div className="app-content" style={{ ["--sec" as string]: SEC } as CSSProperties}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
          {message ? <StateChip tone={message.tone} label={message.text} /> : <span />}
          <CollapseControl scope="int" />
        </div>

        <div className="stack">
          {/* Estado de conexión. La SALUD de un sistema externo sí es un estado
              del semáforo (verde vivo / gris apagado), a diferencia de "campo
              lleno o vacío" en una ficha, que es eje de tipo. */}
          <CollapsibleBox
            id="int-google"
            scope="int"
            defaultOpen
            sec={SEC}
            icon={<IcoPlug />}
            title="Google Calendar"
            actions={<StateChip tone={status.connected ? "ok" : "neutral"} label={status.connected ? "Conectado" : "Sin conectar"} />}
          >
            <div className="dbox-body">
              {!status.configured ? (
                <p className="mut" style={{ margin: 0 }}>
                  Falta configurar las credenciales de Google en{" "}
                  <span className="mono">.env.local</span> (
                  <span className="mono">GOOGLE_CLIENT_ID</span> y{" "}
                  <span className="mono">GOOGLE_CLIENT_SECRET</span>). Cuando las
                  pongas y reinicies el server, aquí aparecerá el botón para
                  conectar.
                </p>
              ) : status.connected ? (
                <>
                  <p className="mut" style={{ marginTop: 0 }}>
                    Conectado. Última actualización de credenciales:{" "}
                    <span className="mono">{formatDate(status.updatedAt)}</span>.
                    El refresh token está cifrado en la base y nunca llega al
                    navegador.
                  </p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <form action={sincronizarAhora}>
                      <button className="dbtn dbtn-primary" type="submit">
                        Sincronizar ahora
                      </button>
                    </form>
                    <form action={desconectarGoogle}>
                      <button className="dbtn dbtn-danger" type="submit">
                        Desconectar
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  <p className="mut" style={{ marginTop: 0 }}>
                    Conecta la cuenta de Google de Color Media para leer y
                    escribir en los calendarios de los clientes. Se piden permisos
                    de eventos de calendario; el calendario personal no se toca.
                  </p>
                  <a href="/api/auth/google" className="dbtn dbtn-primary">
                    Conectar Google Calendar
                  </a>
                </>
              )}
            </div>
          </CollapsibleBox>

          {/* Mapeo calendario ↔ cliente */}
          <CollapsibleBox
            id="int-calendarios"
            scope="int"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoCal />}
            title="Calendarios por cliente"
            actions={<span className="dtype">{mapped} de {list.length} mapeados</span>}
          >
            <table className="dtable">
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
                      {/* Identidad de cliente = cuadradito */}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <span className="cli-sq" style={{ background: c.accent_color ?? "var(--tx-3)" }} />
                        {c.name}
                      </span>
                    </td>
                    <td className={c.google_calendar_id ? "mono" : "mono mut"}>
                      {c.google_calendar_id ?? "sin asignar"}
                    </td>
                    <td className="num">
                      <Link href={`/clientes/${c.id}`} className="dbtn dbtn-sm">
                        {c.google_calendar_id ? "Cambiar" : "Asignar"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleBox>

          {/* Notificaciones por correo */}
          <CollapsibleBox
            id="int-notif"
            scope="int"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoMail />}
            title="Notificaciones por correo"
            actions={<StateChip tone={mailConfigured() ? "ok" : "wait"} label={mailConfigured() ? "Resend activo" : "Falta RESEND_API_KEY"} />}
          >
            <form action={guardarNotificaciones}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th style={{ textAlign: "center" }}>Equipo interno</th>
                    <th style={{ textAlign: "center" }}>Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {(["accion", "hito", "reunion"] as const).map((t) => {
                    const row = notif.get(t);
                    return (
                      <tr key={t}>
                        <td>{NOTIF_LABELS[t]}</td>
                        <td style={{ textAlign: "center" }}>
                          <input type="checkbox" name={`${t}_internal`} defaultChecked={row?.to_internal ?? true} />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <input type="checkbox" name={`${t}_client`} defaultChecked={row?.to_client ?? false} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="field">
                  <label>Correos internos de Color Media (separados por coma)</label>
                  <textarea name="internal_emails" defaultValue={notifConfig?.internal_emails ?? ""} placeholder="marketing@colormedia.cl" style={{ minHeight: "56px" }} />
                  <span className="mut" style={{ fontSize: "12.5px" }}>A estos correos llegan los avisos marcados como “interno”. Al cliente le llega solo a sus usuarios dueño/contenido de esa empresa.</span>
                </div>
                <div>
                  <button className="dbtn dbtn-primary dbtn-sm" type="submit">Guardar notificaciones</button>
                </div>
              </div>
            </form>
          </CollapsibleBox>

          {/* Datos bancarios de Color Media (global) */}
          <CollapsibleBox
            id="int-banco"
            scope="int"
            defaultOpen={false}
            sec={SEC}
            icon={<IcoBank />}
            title="Datos bancarios de Color Media"
            actions={<span className="dtype">Global · lo ven todos los clientes</span>}
          >
            <form action={guardarDatosBancarios}>
              <div className="dbox-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="form-row">
                  <div className="field">
                    <label>Razón social</label>
                    <input name="razon_social" defaultValue={bank?.razon_social ?? ""} placeholder="Vértice SpA" />
                  </div>
                  <div className="field">
                    <label>RUT</label>
                    <input name="rut" defaultValue={bank?.rut ?? ""} placeholder="77.123.456-7" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label>Banco</label>
                    <input name="banco" defaultValue={bank?.banco ?? ""} placeholder="Banco de Chile" />
                  </div>
                  <div className="field">
                    <label>Tipo de cuenta</label>
                    <input name="tipo_cuenta" defaultValue={bank?.tipo_cuenta ?? ""} placeholder="Cuenta corriente" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label>Número de cuenta</label>
                    <input name="numero_cuenta" defaultValue={bank?.numero_cuenta ?? ""} />
                  </div>
                  <div className="field">
                    <label>Correo de confirmación</label>
                    <input name="email" type="email" defaultValue={bank?.email ?? ""} placeholder="pagos@colormedia.cl" />
                  </div>
                </div>
                <div className="field">
                  <label>Notas / glosa</label>
                  <textarea name="notas" defaultValue={bank?.notas ?? ""} placeholder="Instrucciones para la transferencia" style={{ minHeight: "56px" }} />
                </div>
                <div>
                  <button className="dbtn dbtn-primary dbtn-sm" type="submit">Guardar datos bancarios</button>
                </div>
                <span className="mut" style={{ fontSize: "12.5px" }}>Son los datos de Color Media, iguales para todos los clientes. Cada cliente los ve en su portal (solo lectura) para transferir o agregarte como proveedor.</span>
              </div>
            </form>
          </CollapsibleBox>

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
