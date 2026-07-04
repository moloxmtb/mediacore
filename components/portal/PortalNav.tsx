"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { ClientRole } from "@/lib/types";

type Item = { href: string; label: string; world: "content" | "finance"; icon: ReactNode };

const items: Item[] = [
  {
    href: "/portal/que-viene",
    label: "Qué viene",
    world: "content",
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
    world: "content",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    href: "/portal/avance",
    label: "Avance",
    world: "content",
    icon: (
      <svg viewBox="0 0 24 24">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="4" y1="12" x2="17" y2="12" />
        <line x1="10" y1="18" x2="21" y2="18" />
      </svg>
    ),
  },
  {
    href: "/portal/contenido",
    label: "Contenido",
    world: "content",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    href: "/portal/finanzas",
    label: "Finanzas",
    world: "finance",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
];

export default function PortalNav({ role }: { role: ClientRole | null }) {
  const pathname = usePathname();
  const canContent = role === "owner" || role === "content";
  const canFinance = role === "owner" || role === "finance";
  const visible = items.filter((i) =>
    i.world === "content" ? canContent : canFinance,
  );

  return (
    <nav className="admin-nav">
      <div className="nav-label">Tu espacio</div>
      {visible.map((item) => {
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
