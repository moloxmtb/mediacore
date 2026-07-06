// Parser de links de video: detecta proveedor (confiable) y arma el embed.
// La orientación es una ADIVINANZA para pre-seleccionar; el admin la corrige a
// mano (el selector es la fuente de verdad final). Puro: se usa en cliente
// (pre-selección) y en servidor (validación autoritativa del proveedor).

export type VideoProvider = "youtube" | "vimeo";

export type VideoParsed = {
  provider: VideoProvider;
  embedUrl: string;
  orientationGuess: "vertical" | "horizontal";
};

export function parseVideoUrl(raw: string): VideoParsed | null {
  const url = (raw ?? "").trim();
  if (!url) return null;

  // YouTube: watch?v=, youtu.be/, embed/, shorts/
  if (/youtube\.com|youtu\.be/i.test(url)) {
    const m = url.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
    );
    if (m) {
      const id = m[1];
      const isShorts = /\/shorts\//i.test(url);
      return {
        provider: "youtube",
        embedUrl: `https://www.youtube.com/embed/${id}`,
        orientationGuess: isShorts ? "vertical" : "horizontal",
      };
    }
  }

  // Vimeo: vimeo.com/ID, player.vimeo.com/video/ID
  if (/vimeo\.com/i.test(url)) {
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) {
      return {
        provider: "vimeo",
        embedUrl: `https://player.vimeo.com/video/${m[1]}`,
        orientationGuess: "horizontal", // sin API no hay señal fiable; el admin corrige
      };
    }
  }

  return null; // ni YouTube ni Vimeo
}

// ---- Thumbnails (a partir del embed_url ya guardado en content_media) ----

/** Extrae el id de YouTube de un embed `…/embed/{id}`. */
export function youtubeIdFromEmbed(embedUrl: string | null): string | null {
  if (!embedUrl) return null;
  const m = embedUrl.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
  return m ? m[1] : null;
}

/** Extrae el id de Vimeo de un embed `player.vimeo.com/video/{id}`. */
export function vimeoIdFromEmbed(embedUrl: string | null): string | null {
  if (!embedUrl) return null;
  const m = embedUrl.match(/player\.vimeo\.com\/video\/(\d+)/i);
  return m ? m[1] : null;
}

/** Thumbnail estático de YouTube (sin API key). */
export function youtubeThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
