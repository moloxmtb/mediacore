"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const items: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/portal/que-viene",
    label: "Qué viene",
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: "/portal/proyectos",
    label: "Proyectos",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    href: "/portal/avance",
    label: "Avance",
    icon: (
      <svg viewBox="0 0 24 24">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="4" y1="12" x2="17" y2="12" />
        <line x1="10" y1="18" x2="21" y2="18" />
      </svg>
    ),
  },
];

export default function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav">
      <div className="nav-label">Tu espacio</div>
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${active ? " active" : ""}`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
