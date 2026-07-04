import { redirect } from "next/navigation";

/**
 * En la práctica el middleware intercepta "/" y redirige a la home del rol
 * (o a /login si no hay sesión). Este componente es solo un fallback.
 */
export default function Home() {
  redirect("/login");
}
