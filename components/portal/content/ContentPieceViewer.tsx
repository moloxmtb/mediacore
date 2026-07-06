"use client";

import { useState } from "react";
import type { ContentStatus } from "@/lib/types";
import { CONTENT_STATUS_LABELS, contentStatusBadge } from "@/lib/content";
import Lightbox, { type LightboxItem } from "./Lightbox";
import VoteBar from "./VoteBar";

export type ViewerMedia = {
  id: string;
  kind: "imagen" | "video";
  thumb: string | null; // miniatura de la grilla (signed img / thumbnail de video)
  full: string | null; // lightbox: signed img a tamaño completo / src del iframe
  provider: string | null;
  orientation: string | null;
};

export type ViewerVersion = {
  id: string;
  versionNumber: number;
  body: string | null;
  media: ViewerMedia[];
};

export type ViewerPiece = {
  id: string;
  title: string;
  status: ContentStatus;
  votable: boolean; // status === 'propuesta'
  statusMessage: string | null;
  current: ViewerVersion | null;
  past: ViewerVersion[]; // desc, sin la actual
};

function toLightbox(media: ViewerMedia[]): LightboxItem[] {
  return media.map((m) => ({ kind: m.kind, src: m.full, orientation: m.orientation }));
}

function Grid({
  media,
  onOpen,
}: {
  media: ViewerMedia[];
  onOpen: (index: number) => void;
}) {
  if (!media.length) return <div className="empty" style={{ padding: "18px" }}>Sin medios.</div>;
  return (
    <div className="pc-grid">
      {media.map((m, i) => (
        <button type="button" className="pc-thumb" key={m.id} onClick={() => onOpen(i)} title="Ver">
          {m.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.thumb} alt="" />
          ) : (
            <div className="pc-vfallback">
              <span className="pc-play">▶</span>
              <span className="pc-vmeta">{m.provider ?? "video"}</span>
            </div>
          )}
          {m.kind === "video" && m.thumb && <span className="pc-play pc-play-over">▶</span>}
        </button>
      ))}
    </div>
  );
}

export default function ContentPieceViewer({ piece }: { piece: ViewerPiece }) {
  const [lb, setLb] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const open = (media: ViewerMedia[]) => (index: number) =>
    setLb({ items: toLightbox(media), index });

  const cur = piece.current;

  return (
    <div className="pc">
      <div className="pc-head">
        <span className="pc-title">{piece.title}</span>
        <span className={`badge ${contentStatusBadge(piece.status)}`}>
          {CONTENT_STATUS_LABELS[piece.status]}
        </span>
      </div>

      {cur ? (
        <>
          <Grid media={cur.media} onOpen={open(cur.media)} />
          {cur.body && <p className="pc-body">{cur.body}</p>}

          {piece.votable ? (
            <VoteBar pieceId={piece.id} />
          ) : (
            piece.statusMessage && <div className="meta pc-statusmsg">{piece.statusMessage}</div>
          )}
        </>
      ) : (
        <div className="empty">Esta pieza aún no tiene una versión visible.</div>
      )}

      {piece.past.length > 0 && (
        <div className="pc-history">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? "Ocultar versiones anteriores" : `Ver versiones anteriores (${piece.past.length})`}
          </button>
          {showHistory && (
            <div className="pc-history-list">
              {piece.past.map((v) => (
                <div className="pc-history-item" key={v.id}>
                  <div className="meta mono pc-history-label">v{v.versionNumber} · solo lectura</div>
                  <Grid media={v.media} onOpen={open(v.media)} />
                  {v.body && <p className="pc-body pc-body-muted">{v.body}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lb && (
        <Lightbox
          items={lb.items}
          index={lb.index}
          onIndex={(i) => setLb((s) => (s ? { ...s, index: i } : s))}
          onClose={() => setLb(null)}
        />
      )}
    </div>
  );
}
