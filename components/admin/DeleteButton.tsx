"use client";

export default function DeleteButton({
  action,
  hidden,
  label = "Eliminar",
  confirm,
  icon = false,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  label?: string;
  confirm: string;
  /** Variante ícono (tarro): para las acciones por fila del sistema v2 (.dsx). */
  icon?: boolean;
}) {
  return (
    <form
      action={action}
      style={icon ? { display: "inline-flex" } : undefined}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {icon ? (
        <button type="submit" className="dact dact-del" data-tip={label} aria-label={label}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      ) : (
        <button type="submit" className="btn btn-danger btn-sm">
          {label}
        </button>
      )}
    </form>
  );
}
