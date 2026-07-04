"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { disconnect, syncAllCalendars } from "@/lib/google";

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
