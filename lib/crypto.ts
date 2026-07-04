import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Cifrado simétrico AES-256-GCM para el refresh token de Google.
 * La clave vive en GOOGLE_TOKEN_ENC_KEY (32 bytes en hex, solo servidor).
 * El token cifrado se guarda en la base; el texto plano nunca toca el disco
 * ni el navegador.
 */
function key(): Buffer {
  const hex = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "GOOGLE_TOKEN_ENC_KEY ausente o inválida (se esperan 64 hex = 32 bytes).",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Formato: iv(12) + tag(16) + ciphertext, en base64.
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
