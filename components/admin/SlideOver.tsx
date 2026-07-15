"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Panel crear/editar lateral (slide-over). El trigger (botón "+ Agregar" o icono
 * lápiz) lo abre; el formulario va como children y se monta sólo al abrir.
 * `sec` fija el tono de sección (--sec) dentro del panel (foco, botón primario).
 *
 * Auto-cierre: el panel expone `close` por contexto; los forms llaman
 * useSlideOverAutoClose(state.ok) para cerrarse solos al guardar con éxito.
 * Fuera de un slide-over ese hook es no-op (no hay contexto).
 */
const SlideOverCtx = createContext<{ close: () => void } | null>(null);

export function useSlideOverAutoClose(ok: boolean | undefined) {
  const ctx = useContext(SlideOverCtx);
  useEffect(() => {
    if (ok && ctx) ctx.close();
  }, [ok, ctx]);
}

export default function SlideOver({
  title,
  sec,
  trigger,
  triggerClass,
  triggerTip,
  triggerAria,
  children,
}: {
  title: string;
  sec: string;
  trigger: ReactNode;
  triggerClass: string;
  triggerTip?: string;
  triggerAria?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={triggerClass}
        data-tip={triggerTip}
        aria-label={triggerAria ?? title}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </button>

      {open && (
        <>
          <div className="so-overlay" onClick={() => setOpen(false)} />
          <aside className="so-panel" style={{ ["--sec" as string]: sec }} role="dialog" aria-label={title}>
            <div className="so-head">
              <h4>{title}</h4>
              <button type="button" className="so-close" aria-label="Cerrar" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="so-body">
              <SlideOverCtx.Provider value={{ close: () => setOpen(false) }}>
                {children}
              </SlideOverCtx.Provider>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
