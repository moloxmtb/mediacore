import { stStyle, type Tone } from "@/lib/estado";

/**
 * Chip de ESTADO del sistema v2 (rect 6px, fondo del tono al 15% + punto).
 * El tono sale SIEMPRE de lib/estado (fuente única del MAPA), nunca a ojo.
 * Para el eje "tipo" (interna/cliente, reunión, Google/panel) usar `.dtype`,
 * que va con borde y sin relleno para no confundirse con estado.
 */
export default function StateChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="dchip" style={stStyle(tone)}>
      {label}
    </span>
  );
}
