"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { ClientRole } from "@/lib/types";

type Item = { href: string; label: string; world: "content" | "finance" | "any"; icon: ReactNode };

const items: Item[] = [
  {
    href: "/portal",
    label: "Inicio",
    world: "content",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
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
    href: "/portal/calendario",
    label: "Calendario",
    world: "content",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="16" y1="2" x2="16" y2="6" />
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
    href: "/portal/tareas",
    label: "Tareas",
    world: "content",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
  {
    href: "/portal/estrategia",
    label: "Estrategia",
    world: "any",
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="0.5" />
      </svg>
    ),
  },
  {
    href: "/portal/plan",
    label: "Tu plan",
    world: "any",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M9 11l2 2 4-4" />
        <rect x="3" y="4" width="18" height="16" rx="2" />
      </svg>
    ),
  },
  {
    href: "/portal/datos-pago",
    label: "Datos de pago",
    world: "any",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="6" y1="15" x2="10" y2="15" />
      </svg>
    ),
  },
  {
    href: "/portal/ficha",
    label: "Mi empresa",
    world: "any",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 9h1M9 13h1M14 9h1M14 13h1" />
      </svg>
    ),
  },
];

export default function PortalNav({
  role,
  counts = {},
}: {
  role: ClientRole | null;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const canContent = role === "owner" || role === "content";
  const canFinance = role === "owner" || role === "finance";
  const visible = items.filter((i) =>
    i.world === "any"
      ? true
      : i.world === "content"
        ? canContent
        : canFinance,
  );

  return (
    <nav className="admin-nav">
      <div className="nav-label">Tu espacio</div>
      {visible.map((item) => {
        // "/portal" (Inicio) solo activo exacto; el resto también en subrutas.
        const active =
          item.href === "/portal"
            ? pathname === "/portal"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const badge = counts[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${active ? " active" : ""}`}
          >
            {item.icon}
            {item.label}
            {badge > 0 && <span className="nav-badge">{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
