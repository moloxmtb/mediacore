/**
 * Logotipo MEDIACORE (by Color Media) como SVG + wordmark. Sin hooks, sirve en
 * Server y Client Components. El ícono es un cuadrado redondeado con un hueco
 * (fill-rule evenodd), así funciona sobre cualquier fondo.
 */
export default function Brand({
  size = "sm",
  caption,
}: {
  size?: "sm" | "lg";
  caption?: string;
}) {
  const icon = size === "lg" ? 44 : 30;
  const wordSize = size === "lg" ? "27px" : "18px";
  return (
    <div className="mc-logo" style={size === "lg" ? { gap: "14px" } : undefined}>
      <svg width={icon} height={icon} viewBox="0 0 48 48" aria-label="MEDIACORE">
        <path
          fill="var(--brand-steel)"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M15 4h18a11 11 0 0 1 11 11v18a11 11 0 0 1-11 11H15A11 11 0 0 1 4 33V15A11 11 0 0 1 15 4Zm7 13h4a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5v-4a5 5 0 0 1 5-5Z"
        />
      </svg>
      <div>
        <div className="mc-word" style={{ fontSize: wordSize }}>
          MEDIA<span className="core">CORE</span>
        </div>
        {caption && (
          <div className="mc-caption">
            {caption}
            <span className="mc-dot" />
          </div>
        )}
      </div>
    </div>
  );
}
