"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, canSeeContent } from "@/lib/auth";
import type { DeliverableApproval } from "@/lib/types";

const DECISIONES: DeliverableApproval[] = ["aprobado", "cambios_solicitados", "rechazado"];

/**
 * El cliente responde un entregable ENVIADO (aprobar / pedir cambios / rechazar),
 * con comentario opcional. NO hace UPDATE directo: llama la RPC de Fase 1
 * (deliverable_client_respond, SECURITY DEFINER), que valida propiedad + rol
 * owner/content + estado 'enviado' y es columna-segura. El guard de sesión
 * (client + canSeeContent) es defensa en profundidad; el muro real es la RPC.
 */
export async function responderEntregable(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "").trim();
  const decision = String(fd.get("decision") ?? "").trim() as DeliverableApproval;
  const comment = String(fd.get("comment") ?? "").trim();
  if (!id || !DECISIONES.includes(decision)) return;

  const session = await getSessionProfile();
  if (!session || session.role !== "client" || !canSeeContent(session.clientRole)) return;

  const supabase = await createClient();
  await supabase.rpc("deliverable_client_respond", {
    p_id: id,
    p_decision: decision,
    p_comment: comment || null,
  });
  revalidatePath("/portal/entregables");
  revalidatePath("/portal");
}
