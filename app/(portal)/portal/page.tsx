import { redirect } from "next/navigation";
import { getSessionProfile, portalHome } from "@/lib/auth";

export default async function PortalHome() {
  const session = await getSessionProfile();
  redirect(portalHome(session?.clientRole ?? "content"));
}
