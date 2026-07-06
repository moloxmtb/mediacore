"use client";

import { useCallback, useEffect } from "react";

export type LightboxItem = {
  kind: "imagen" | "video";
  /** imagen: signed URL a tamaño completo · video: src del iframe (embed) */
  src: string | null;
  orientation?: string | null;
};

/**
 * Lightbox propio (sin librería): muestra el medio en su formato real completo
 * —imagen sin recortar, video como iframe embebido real—. Navega con flechas /
 * teclado sin cerrarse; cierra con X, click afuera o Esc. Bloquea el scroll de
 * fondo mientras está abierto.
 */
export default function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const many = items.length > 1;
  const prev = useCallback(
    () => onIndex((index - 1 + items.length) % items.length),
    [index, items.length, onIndex],
  );
  const next = useCallback(
    () => onIndex((index + 1) % items.length),
    [index, items.length, onIndex],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next]);

  if (index < 0 || index >= items.length) return null;
  const it = items[index];

  return (
    <div className="lb-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lb-close" onClick={onClose} aria-label="Cerrar">×</button>
      {many && (
        <button
          className="lb-nav lb-prev"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label="Anterior"
        >
          ‹
        </button>
      )}

      <div
        className={`lb-stage ${it.orientation === "vertical" ? "is-vertical" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {it.kind === "imagen" && it.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.src} alt="" className="lb-img" />
        ) : it.kind === "video" && it.src ? (
          <div className="lb-video">
            <iframe
              src={it.src}
              title="Video"
              className="lb-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : null}
      </div>

      {many && (
        <button
          className="lb-nav lb-next"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label="Siguiente"
        >
          ›
        </button>
      )}
      {many && <div className="lb-count">{index + 1} / {items.length}</div>}
    </div>
  );
}
