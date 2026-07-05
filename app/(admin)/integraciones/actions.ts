"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { disconnect, syncAllCalendars } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export async function sincronizarAhora() {
  try {
    await syncAllCalendars();
  } catch {
    redirect("/integraciones?error=sync");
  }
  revalidatePath("/gantt");
  revalidatePath("/integraciones");
  redirect("/integraciones?synced=1");
}

export async function desconectarGoogle() {
  await disconnect();
  revalidatePath("/integraciones");
  redirect("/integraciones?disconnected=1");
}

const NOTIF_TYPES = ["accion", "hito", "reunion"] as const;

export async function guardarNotificaciones(fd: FormData): Promise<void> {
  const supabase = await createClient();
  for (const t of NOTIF_TYPES) {
    await supabase
      .from("notification_settings")
      .update({
        to_internal: fd.get(`${t}_internal`) != null,
        to_client: fd.get(`${t}_client`) != null,
      })
      .eq("event_type", t);
  }
  await supabase
    .from("notification_config")
    .update({ internal_emails: String(fd.get("internal_emails") ?? "").trim() })
    .eq("id", 1);
  revalidatePath("/integraciones");
}
