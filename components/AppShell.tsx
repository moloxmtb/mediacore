"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Brand from "@/components/Brand";
import HelpLink from "@/components/HelpLink";
import { logout } from "@/app/auth/actions";

/**
 * Shell responsive compartido por admin y portal. En ESCRITORIO (≥768px) es el
 * mismo layout de siempre: sidebar fijo a la izquierda, sin barra superior. En
 * MÓVIL (<768px) el mismo `.sidebar` se vuelve un drawer que entra desde la
 * izquierda; arriba aparece una barra fija con ☰ + logo. Toda la diferencia la
 * decide el CSS por ancho; el estado abierto/cerrado (efímero, useState) solo
 * importa en móvil.
 *
 * El contenido del sidebar (marca + nav + perfil) lo pasa cada layout como
 * `sidebar`; el nav se renderiza UNA vez y sirve de sidebar y de drawer. Las
 * acciones de header (ayuda + cerrar sesión) se agregan aquí como `.drawer-only`
 * (ocultas en escritorio, donde viven en el PageHeader; visibles en el drawer
 * en móvil).
 */
export default function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Cerrar al navegar: si el click cayó sobre un link del drawer, cerramos.
  // Delegación en el contenedor → no hay que tocar los componentes de nav.
  function onSidebarClick(e: MouseEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  }

  // Cerrar con Escape + bloquear el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={`app-shell${open ? " nav-open" : ""}`}>
      {/* Barra superior — solo móvil (CSS) */}
      <div className="mobile-topbar">
        <button
          type="button"
          className="hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Brand size="sm" />
      </div>

      {/* Overlay — solo móvil, visible con .nav-open (CSS) */}
      <div className="sidebar-overlay" onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className="sidebar" onClick={onSidebarClick}>
        {sidebar}
        {/* Ayuda + cerrar sesión: solo en el drawer móvil (oculto en escritorio) */}
        <div className="drawer-only sidebar-actions">
          <HelpLink />
          <form action={logout}>
            <button type="submit" className="logout-btn">Cerrar sesión</button>
          </form>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
