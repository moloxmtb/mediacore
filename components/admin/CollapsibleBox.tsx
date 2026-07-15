"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Recuadro colapsable del sistema v2. Clic en la cabecera abre/cierra (flecha que
 * rota). Cerrado = sólo la cabecera de color (vista global). El estado se recuerda
 * por sección en localStorage. El botón "+ Agregar" de la cabecera NO togglea
 * (stopPropagation). `CollapseControl` emite un evento que todos los boxes del
 * mismo `scope` escuchan para expandir/colapsar todo.
 */
const LS_KEY = (id: string) => `mc.projbox.${id}`;
const EVT = "mc:setboxes";

export function CollapsibleBox({
  id,
  scope = "proj",
  defaultOpen,
  sec,
  icon,
  title,
  count,
  actions,
  children,
}: {
  id: string;
  scope?: string;
  defaultOpen: boolean;
  sec: string;
  icon: ReactNode;
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY(id));
    // Hidratar desde localStorage al montar (seguro para SSR: el 1er render usa
    // defaultOpen en server y cliente; el effect lo ajusta tras hidratar).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== null) setOpen(stored === "1");
    const onAll = (e: Event) => {
      const d = (e as CustomEvent).detail as { scope: string; open: boolean };
      if (d?.scope !== scope) return;
      setOpen(d.open);
      localStorage.setItem(LS_KEY(id), d.open ? "1" : "0");
    };
    window.addEventListener(EVT, onAll);
    return () => window.removeEventListener(EVT, onAll);
  }, [id, scope]);

  const toggle = () =>
    setOpen((o) => {
      const n = !o;
      localStorage.setItem(LS_KEY(id), n ? "1" : "0");
      return n;
    });

  return (
    <section className="dbox" style={{ ["--sec" as string]: sec }}>
      <div
        className={`dbox-head dbox-head-toggle${open ? " is-open" : ""}`}
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="dbox-caret" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        <span className="dh-ico">{icon}</span>
        <h3>{title}</h3>
        {count != null && <span className="dcount">{count}</span>}
        {actions && (
          <div className="dhead-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {open && children}
    </section>
  );
}

export function CollapseControl({ scope = "proj" }: { scope?: string }) {
  const setAll = (open: boolean) =>
    window.dispatchEvent(new CustomEvent(EVT, { detail: { scope, open } }));
  return (
    <div className="dcollapse-ctl">
      <button type="button" className="dbtn dbtn-sm" onClick={() => setAll(false)}>Colapsar todo</button>
      <button type="button" className="dbtn dbtn-sm" onClick={() => setAll(true)}>Expandir todo</button>
    </div>
  );
}
