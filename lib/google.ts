import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Client } from "@/lib/types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
const TZ = "America/Santiago";

// calendar.events: leer/escribir eventos. calendar.readonly: listar los
// calendarios del admin para el mapeo. (El proyecto de Google puede quedar
// en modo interno/testing por ser una sola cuenta propia.)
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function cfg() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

/** ¿Están configuradas las credenciales de Google (no placeholders)? */
export function isConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = cfg();
  return Boolean(
    clientId &&
      clientSecret &&
      redirectUri &&
      !clientId.startsWith("REEMPLAZAR"),
  );
}

// ============================================================
//  OAuth
// ============================================================
export function getAuthUrl(state: string): string {
  const { clientId, redirectUri } = cfg();
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri!,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // pide refresh_token
    prompt: "consent", // fuerza que Google devuelva refresh_token
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = cfg();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Intercambio de código falló: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = cfg();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Refresh de token falló: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ============================================================
//  Almacenamiento de credenciales (tabla google_credentials, fila única)
//  Solo service_role: la tabla no tiene políticas para anon/authenticated.
// ============================================================
export async function saveCredentials(tokens: TokenResponse): Promise<void> {
  const admin = createAdminClient();
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const row: Record<string, unknown> = {
    id: 1,
    access_token: tokens.access_token,
    token_expiry: expiry,
    scope: tokens.scope ?? SCOPES.join(" "),
    updated_at: new Date().toISOString(),
  };
  // El refresh_token solo llega en el primer consentimiento; si no viene,
  // conservamos el que ya está guardado.
  if (tokens.refresh_token) {
    row.refresh_token = encrypt(tokens.refresh_token);
  }
  await admin.from("google_credentials").upsert(row);
}

type CredRow = {
  refresh_token: string | null;
  access_token: string | null;
  token_expiry: string | null;
  scope: string | null;
  updated_at: string | null;
};

async function getCredentials(): Promise<CredRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_credentials")
    .select("refresh_token, access_token, token_expiry, scope, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null; // tabla aún no creada, etc.
  return (data as CredRow | null) ?? null;
}

export async function getConnectionStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  updatedAt: string | null;
}> {
  if (!isConfigured()) {
    return { configured: false, connected: false, updatedAt: null };
  }
  const cred = await getCredentials();
  return {
    configured: true,
    connected: Boolean(cred?.refresh_token),
    updatedAt: cred?.updated_at ?? null,
  };
}

export async function disconnect(): Promise<void> {
  const admin = createAdminClient();
  await admin.from("google_credentials").delete().eq("id", 1);
}

/** Devuelve un access token válido, refrescándolo si expiró. */
async function getAccessToken(): Promise<string> {
  const cred = await getCredentials();
  if (!cred?.refresh_token) {
    throw new Error("Google Calendar no está conectado.");
  }
  const stillValid =
    cred.access_token &&
    cred.token_expiry &&
    new Date(cred.token_expiry).getTime() - Date.now() > 60_000;
  if (stillValid) return cred.access_token!;

  const refreshed = await refreshAccessToken(decrypt(cred.refresh_token));
  await saveCredentials(refreshed); // actualiza access_token + expiry
  return refreshed.access_token;
}

// ============================================================
//  Calendar API
// ============================================================
async function calFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function listCalendars(): Promise<
  { id: string; summary: string; primary: boolean }[]
> {
  const token = await getAccessToken();
  const res = await calFetch("/users/me/calendarList", token);
  if (!res.ok) throw new Error(`calendarList: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.items ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    summary: (c.summaryOverride ?? c.summary) as string,
    primary: Boolean(c.primary),
  }));
}

function toGoogleTime(iso: string) {
  // Panel usa datetime con hora; se envía como dateTime con zona local.
  return { dateTime: new Date(iso).toISOString(), timeZone: TZ };
}

/**
 * Sincronización incremental Google → panel para el calendario de un cliente.
 * Usa syncToken (guardado en calendar_sync) y reconoce por google_event_id
 * para hacer upsert sin duplicar. Ante un syncToken inválido (410), reinicia
 * con una sincronización completa acotada al último año.
 */
export async function syncCalendar(
  client: Pick<Client, "id" | "google_calendar_id">,
): Promise<{ calendar: string | null; upserts: number; deletes: number }> {
  const cal = client.google_calendar_id;
  if (!cal) return { calendar: null, upserts: 0, deletes: 0 };

  const admin = createAdminClient();
  const token = await getAccessToken();

  const { data: syncRow } = await admin
    .from("calendar_sync")
    .select("sync_token")
    .eq("google_calendar_id", cal)
    .maybeSingle();

  let syncToken: string | null = syncRow?.sync_token ?? null;
  let upserts = 0;
  let deletes = 0;

  // Bucle con posible reinicio si el syncToken caducó.
  restart: for (let attempt = 0; attempt < 2; attempt++) {
    let pageToken: string | null = null;
    let nextSyncToken: string | null = null;

    do {
      const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true" });
      if (syncToken) params.set("syncToken", syncToken);
      else params.set("timeMin", new Date(Date.now() - 365 * 86400000).toISOString());
      if (pageToken) params.set("pageToken", pageToken);

      const res = await calFetch(
        `/calendars/${encodeURIComponent(cal)}/events?${params.toString()}`,
        token,
      );

      if (res.status === 410) {
        // syncToken inválido → limpiar y reiniciar con sync completa.
        await admin.from("calendar_sync").delete().eq("google_calendar_id", cal);
        syncToken = null;
        continue restart;
      }
      if (!res.ok) throw new Error(`events.list: ${res.status} ${await res.text()}`);

      const data = await res.json();
      for (const ev of data.items ?? []) {
        if (ev.status === "cancelled") {
          await admin
            .from("calendar_events")
            .delete()
            .match({ google_calendar_id: cal, google_event_id: ev.id });
          deletes++;
        } else {
          await admin.from("calendar_events").upsert(
            {
              client_id: client.id,
              google_calendar_id: cal,
              google_event_id: ev.id,
              title: ev.summary ?? "(sin título)",
              description: ev.description ?? null,
              starts_at: ev.start?.dateTime ?? ev.start?.date,
              ends_at: ev.end?.dateTime ?? ev.end?.date ?? null,
              source: "google",
              synced_at: new Date().toISOString(),
            },
            { onConflict: "google_calendar_id,google_event_id" },
          );
          upserts++;
        }
      }

      pageToken = data.nextPageToken ?? null;
      if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    } while (pageToken);

    if (nextSyncToken) {
      await admin.from("calendar_sync").upsert({
        google_calendar_id: cal,
        sync_token: nextSyncToken,
        synced_at: new Date().toISOString(),
      });
    }
    break;
  }

  return { calendar: cal, upserts, deletes };
}

/** Sincroniza todos los clientes con calendario mapeado. */
export async function syncAllCalendars() {
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("clients")
    .select("id, google_calendar_id")
    .not("google_calendar_id", "is", null);

  const results = [];
  for (const c of (clients ?? []) as Pick<Client, "id" | "google_calendar_id">[]) {
    try {
      results.push(await syncCalendar(c));
    } catch (e) {
      results.push({ calendar: c.google_calendar_id, error: String(e) });
    }
  }
  return results;
}

/**
 * Panel → Google: crea o actualiza el evento en el calendario del cliente.
 * Devuelve el google_event_id para guardarlo y evitar duplicados.
 */
export async function pushEvent(event: {
  google_event_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  calendarId: string;
}): Promise<string> {
  const token = await getAccessToken();
  const body = JSON.stringify({
    summary: event.title,
    description: event.description ?? undefined,
    start: toGoogleTime(event.starts_at),
    end: toGoogleTime(event.ends_at ?? event.starts_at),
  });

  const base = `/calendars/${encodeURIComponent(event.calendarId)}/events`;
  const res = event.google_event_id
    ? await calFetch(`${base}/${event.google_event_id}`, token, { method: "PATCH", body })
    : await calFetch(base, token, { method: "POST", body });

  if (!res.ok) throw new Error(`push evento: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

/** Panel → Google: elimina el evento. */
export async function deleteGoogleEvent(
  calendarId: string,
  googleEventId: string,
): Promise<void> {
  const token = await getAccessToken();
  const res = await calFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
    token,
    { method: "DELETE" },
  );
  // 410/404: ya no existe en Google; lo tomamos como borrado.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`delete evento: ${res.status} ${await res.text()}`);
  }
}
