"use client";

import { useState, useTransition } from "react";
import { aprobarPieza, pedirCambios } from "@/app/(portal)/portal/contenido/actions";

/**
 * Voto sobre la pieza completa (solo versión actual en 'propuesta'). Comentario
 * OPCIONAL en ambos caminos. Dispara las mismas server actions de siempre
 * (content_reviews + trigger); no toca la lógica de estados. Tras votar, la
 * revalidación saca la pieza de 'propuesta' y esta barra desaparece sola.
 */
export default function VoteBar({ pieceId }: { pieceId: string }) {
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  function vote(kind: "aprobacion" | "cambios") {
    start(async () => {
      const fd = new FormData();
      fd.set("id", pieceId);
      fd.set("comment", comment);
      if (kind === "aprobacion") await aprobarPieza(fd);
      else await pedirCambios(fd);
    });
  }

  return (
    <div className="pc-vote">
      <textarea
        className="pc-vote-comment"
        placeholder="Comentario (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      <div className="pc-vote-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={pending}
          onClick={() => vote("aprobacion")}
        >
          {pending ? "Enviando…" : "Aprobar"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => vote("cambios")}
        >
          Pedir cambios
        </button>
      </div>
    </div>
  );
}
