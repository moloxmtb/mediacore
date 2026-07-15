import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClientStaff, resolveOwnerOnly, resolveClientRecipients } from "@/lib/notify";

/**
 * Sistema de notificaciones MANUALES (botón contextual "notificar" en cada
 * objeto). El destinatario de cada botón calca el predicado de lectura de la
 * RLS de ese objeto: el GATE de visibilidad (branch cliente) se evalúa ANTES de
 * resolver, y el resolutor de staff se elige según el objeto.
 *
 *  - 6 objetos de negocio → staff = resolveClientStaff (owner ∪ asignados),
 *    cliente = owner/content.
 *  - cobro → staff = resolveOwnerOnly (SOLO owner; finanzas es owner-only en la
 *    RLS), cliente = owner/finance. Nunca ejecutivos/productores.
 *
 * Gates (LITERALES a la RLS, decisión cerrada):
 *  tarea → tipo='cliente' · reunión/hito → visible_to_client (del evento) ·
 *  entregable → visible_to_client (sin ≠borrador) · contenido → status≠borrador ·
 *  bitácora → visible_to_client · cobro → true (sin flag por fila).
 */

export type NotifyKind = "tarea" | "reunion" | "entregable" | "cobro" | "contenido" | "bitacora" | "hito";
export type NotifyAudience = "equipo" | "cliente";

type Descriptor = {
  objectLabel: string;
  staffResolver: "clientStaff" | "ownerOnly";
  clientWorld: "content" | "finance";
  requiresOwner: boolean; // guard de actor: cobro exige isSessionOwner()
};

export const NOTIFY_REGISTRY: Record<NotifyKind, Descriptor> = {
  tarea: { objectLabel: "TAREA", staffResolver: "clientStaff", clientWorld: "content", requiresOwner: false },
  reunion: { objectLabel: "REUNIÓN", staffResolver: "clientStaff", clientWorld: "content", requiresOwner: false },
  entregable: { objectLabel: "ENTREGABLE", staffResolver: "clientStaff", clientWorld: "content", requiresOwner: false },
  cobro: { objectLabel: "COBRO", staffResolver: "ownerOnly", clientWorld: "finance", requiresOwner: true },
  contenido: { objectLabel: "CONTENIDO", staffResolver: "clientStaff", clientWorld: "content", requiresOwner: false },
  bitacora: { objectLabel: "BITÁCORA", staffResolver: "clientStaff", clientWorld: "content", requiresOwner: false },
  hito: { objectLabel: "HITO", staffResolver: "clientStaff", clientWorld: "content", requiresOwner: false },
};

export type LoadedObject = {
  clientId: string;
  clientName: string | null;
  title: string;
  /** ¿el CLIENTE puede ver ESTA fila? Calca el branch cliente de la RLS. */
  gateOk: boolean;
  panelPath: string;
  portalPath: string;
};

type ClientRef = { name: string | null } | null;
function mk(clientId: string, clients: unknown, title: string, gateOk: boolean, panelPath: string, portalPath: string): LoadedObject {
  return { clientId, clientName: (clients as ClientRef)?.name ?? null, title, gateOk, panelPath, portalPath };
}

/** Lee la fila fresca (admin client) y calcula su gate de cliente. null si no existe. */
export async function loadNotifyObject(kind: NotifyKind, id: string): Promise<LoadedObject | null> {
  const admin = createAdminClient();
  switch (kind) {
    case "tarea": {
      const { data } = await admin.from("tasks").select("titulo, tipo, client_id, clients(name)").eq("id", id).maybeSingle();
      if (!data) return null;
      return mk(data.client_id as string, data.clients, (data.titulo as string) ?? "Tarea", data.tipo === "cliente", "/tareas", "/portal/tareas");
    }
    case "reunion":
    case "hito": {
      const { data } = await admin.from("calendar_events").select("title, visible_to_client, client_id, clients(name)").eq("id", id).maybeSingle();
      if (!data) return null;
      const portal = kind === "hito" ? "/portal/avance" : "/portal/calendario";
      return mk(data.client_id as string, data.clients, (data.title as string) ?? "Evento", data.visible_to_client === true, "/calendario", portal);
    }
    case "entregable": {
      const { data } = await admin.from("deliverables").select("title, visible_to_client, projects(client_id, clients(name))").eq("id", id).maybeSingle();
      if (!data) return null;
      const proj = data.projects as unknown as { client_id: string; clients: ClientRef } | null;
      if (!proj?.client_id) return null;
      return mk(proj.client_id, proj.clients, (data.title as string) ?? "Entregable", data.visible_to_client === true, `/entregables/${id}`, "/portal/entregables");
    }
    case "cobro": {
      const { data } = await admin.from("installments").select("number, client_id, clients(name)").eq("id", id).maybeSingle();
      if (!data) return null;
      return mk(data.client_id as string, data.clients, `Cuota ${data.number}`, true, `/clientes/${data.client_id}`, "/portal/finanzas");
    }
    case "contenido": {
      const { data } = await admin.from("content_pieces").select("title, status, client_id, clients(name)").eq("id", id).maybeSingle();
      if (!data) return null;
      return mk(data.client_id as string, data.clients, (data.title as string) ?? "Contenido", data.status !== "borrador", "/contenido", "/portal/contenido");
    }
    case "bitacora": {
      const { data } = await admin.from("actions").select("title, visible_to_client, client_id, clients(name)").eq("id", id).maybeSingle();
      if (!data) return null;
      return mk(data.client_id as string, data.clients, (data.title as string) ?? "Bitácora", data.visible_to_client === true, "/acciones", "/portal");
    }
  }
}

/**
 * Resuelve los destinatarios para (objeto, audiencia). El GATE va ANTES de
 * resolver: si la audiencia es 'cliente' y el objeto no es visible para el
 * cliente, devuelve conjunto vacío + motivo (no hay a quién notificar). El staff
 * NO pasa por el gate (ve todo lo de su cliente, como la RLS).
 */
export async function resolveNotifyRecipients(
  kind: NotifyKind,
  obj: LoadedObject,
  audience: NotifyAudience,
): Promise<{ recipients: { email: string; name: string | null }[]; skipped?: string }> {
  const d = NOTIFY_REGISTRY[kind];
  if (audience === "equipo") {
    const recipients = d.staffResolver === "ownerOnly" ? await resolveOwnerOnly(obj.clientId) : await resolveClientStaff(obj.clientId);
    return { recipients };
  }
  // cliente: gate antes de resolver.
  if (!obj.gateOk) return { recipients: [], skipped: "Este objeto no es visible para el cliente; no se le notifica." };
  return { recipients: await resolveClientRecipients(obj.clientId, d.clientWorld) };
}
