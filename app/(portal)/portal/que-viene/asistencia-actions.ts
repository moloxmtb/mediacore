"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, canSeeContent } from "@/lib/auth";

/**
 * Confirma (o corrige) la asistencia del cliente a una reunión. La RLS de
 * event_attendance garantiza que solo pueda escribir su propia reunión: valida
 * user_id = auth.uid(), su cliente, rol owner/content y que el evento sea una
 * reunión suya visible. Por eso basta el cliente ligado a la sesión.
 */
export async function confirmarAsistencia(fd: FormData): Promise<void> {
  const event_id = String(fd.get("event_id") ?? "").trim();
  const attending = String(fd.get("attending") ?? "") === "si";
  if (!event_id) return;

  const session = await getSessionProfile();
  if (!session || session.role !== "client" || !canSeeContent(session.clientRole)) return;
  if (!session.clientId) return;

  const supabase = await createClient();
  await supabase.from("event_attendance").upsert(
    {
      event_id,
      client_id: session.clientId,
      user_id: session.userId,
      attending,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,user_id" },
  );
  revalidatePath("/portal/que-viene");
}
