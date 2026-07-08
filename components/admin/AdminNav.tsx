"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AdminRole } from "@/lib/types";
import { canSeeAdminSection, type AdminSection } from "@/lib/admin-sections";

type Item = { href: string; label: string; icon: ReactNode };
type Group = { label: string; items: Item[] };

const groups: Group[] = [
  {
    label: "Operación",
    items: [
      {
        href: "/dashboard",
        label: "Resumen",
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
          </svg>
        ),
      },
      {
        href: "/clientes",
        label: "Clientes",
        icon: (
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="7" r="3" />
            <path d="M3 21v-2a5 5 0 0 1 5-5h2" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M21 21v-2a5 5 0 0 0-4-4.9" />
          </svg>
        ),
      },
      {
        href: "/proyectos",
        label: "Proyectos",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        ),
      },
      {
        href: "/gantt",
        label: "Carta Gantt",
        icon: (
          <svg viewBox="0 0 24 24">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="4" y1="12" x2="17" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
          </svg>
        ),
      },
      {
        href: "/calendario",
        label: "Calendario",
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
        href: "/entregables",
        label: "Entregables",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M21 8v13H3V8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
          </svg>
        ),
      },
      {
        href: "/contenido",
        label: "Contenido",
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Finanzas",
    items: [
      {
        href: "/cobros",
        label: "Cobros y contratos",
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        ),
      },
      {
        href: "/acciones",
        label: "Bitácora de acciones",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="m4.9 4.9 2.9 2.9" />
            <path d="m16.2 16.2 2.9 2.9" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        href: "/equipo",
        label: "Equipo",
        icon: (
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="7" r="3" />
            <path d="M3 21v-2a5 5 0 0 1 5-5h2" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M21 21v-2a5 5 0 0 0-4-4.9" />
          </svg>
        ),
      },
      {
        href: "/integraciones",
        label: "Integraciones",
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
    ],
  },
];

// La sección de cada ítem se deriva del href (/dashboard → "dashboard", etc.),
// que coincide con las claves de ADMIN_SECTIONS.
const sectionOf = (href: string) => href.slice(1) as AdminSection;

export default function AdminNav({ adminRole }: { adminRole: AdminRole | null }) {
  const pathname = usePathname();

  return (
    <nav className="admin-nav">
      {groups.map((group) => {
        const items = group.items.filter((i) => canSeeAdminSection(adminRole, sectionOf(i.href)));
        if (!items.length) return null; // grupo sin ítems visibles → se oculta
        return (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
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
          </div>
        );
      })}
    </nav>
  );
}
