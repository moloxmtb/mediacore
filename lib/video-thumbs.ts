import "server-only";
import { youtubeIdFromEmbed, youtubeThumb, vimeoIdFromEmbed } from "./video";

/**
 * Resuelve thumbnails de video SIN API keys, para pintar la miniatura en la
 * grilla del portal:
 *   - YouTube: URL estática (img.youtube.com), sin red desde nuestro código.
 *   - Vimeo: oEmbed cacheado (revalida cada día). Si el fetch falla, se omite.
 * Devuelve un mapa embed_url -> thumbnail_url. La ausencia de una clave es la
 * señal para que el viewer use su fallback (cuadrito + ícono de play).
 */
export async function resolveVideoThumbs(
  videos: { provider: string | null; embedUrl: string | null }[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const pending: Promise<void>[] = [];

  for (const v of videos) {
    if (!v.embedUrl || v.embedUrl in out) continue;

    if (v.provider === "youtube") {
      const id = youtubeIdFromEmbed(v.embedUrl);
      if (id) out[v.embedUrl] = youtubeThumb(id);
      continue;
    }

    if (v.provider === "vimeo") {
      const id = vimeoIdFromEmbed(v.embedUrl);
      if (!id) continue;
      const embedUrl = v.embedUrl;
      out[embedUrl] = ""; // reserva el slot para no repetir el fetch
      pending.push(
        (async () => {
          try {
            const res = await fetch(
              `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}`,
              { next: { revalidate: 86400 } },
            );
            if (res.ok) {
              const j = (await res.json()) as { thumbnail_url?: string };
              if (j?.thumbnail_url) out[embedUrl] = j.thumbnail_url;
            }
          } catch {
            /* fallback: sin thumb, el viewer pinta cuadrito + play */
          }
        })(),
      );
    }
  }

  await Promise.all(pending);
  // Limpia los slots que quedaron vacíos (Vimeo sin thumbnail) para que el
  // viewer los trate como "sin thumb".
  for (const k of Object.keys(out)) if (out[k] === "") delete out[k];
  return out;
}
