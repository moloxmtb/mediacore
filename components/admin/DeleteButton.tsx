"use client";

export default function DeleteButton({
  action,
  hidden,
  label = "Eliminar",
  confirm,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  label?: string;
  confirm: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className="btn btn-danger btn-sm">
        {label}
      </button>
    </form>
  );
}
