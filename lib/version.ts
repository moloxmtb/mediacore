/**
 * Única fuente de la versión del sistema (Media Core).
 * Súbela A MANO cuando haya cambios, según la convención:
 *   - decimal para cambios menores:  1.00 → 1.01 → 1.14 …
 *   - entero para cambios mayores, y resetea el decimal:  1.14 → 2.00
 * Se muestra automáticamente en panel y portal (ver components/SystemFooter).
 */
export const APP_VERSION = "1.15";

/**
 * Fecha de última actualización — AUTOMÁTICA. Se fija sola al hacer build /
 * desplegar (o al arrancar el servidor en desarrollo). No hay que tocarla.
 */
export const APP_UPDATED: string = new Date().toISOString();
