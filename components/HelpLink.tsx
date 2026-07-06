"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Ícono "?" del encabezado. Lleva al centro de ayuda de la cara actual:
 *  portal (cliente, los 3 roles) o panel (admin). */
export default function HelpLink() {
  const pathname = usePathname();
  const href = pathname.startsWith("/portal") ? "/portal/ayuda" : "/ayuda";
  return (
    <Link href={href} className="help-btn" aria-label="Centro de ayuda" title="Centro de ayuda">
      ?
    </Link>
  );
}
