"use client";

import { useActionState, useState } from "react";
import type { GenerarState } from "@/app/(admin)/cobros/actions";
import type { CurrencyKind } from "@/lib/types";

const initial: GenerarState = { error: null };

type Row = { from: number; to: number; net: string };

function parseNet(s: string): number {
  return Number(String(s).replace(/\./g, "").replace(",", "."));
}

export default function TramosEditor({
  action,
  contractId,
  currency,
  defaultNet,
  defaultCount,
}: {
  action: (state: GenerarState, fd: FormData) => Promise<GenerarState>;
  contractId: string;
  currency: CurrencyKind;
  defaultNet: number | null;
  defaultCount: number;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [rows, setRows] = useState<Row[]>([
    { from: 1, to: Math.max(defaultCount, 1), net: defaultNet ? String(defaultNet) : "" },
  ]);

  const unit = currency === "UF" ? "UF" : "CLP";

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addTramo = () =>
    setRows((rs) => {
      const last = rs[rs.length - 1];
      const next = (last?.to ?? 0) + 1;
      return [...rs, { from: next, to: next, net: "" }];
    });
  const removeTramo = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  // Preview y validación (espejo del server; el server es la autoridad).
  const sorted = [...rows].sort((a, b) => a.from - b.from);
  let valid = sorted.length > 0 && sorted[0].from === 1;
  let expected = 1;
  let totalCuotas = 0;
  let totalNet = 0;
  for (const r of sorted) {
    if (r.from !== expected || r.to < r.from || !(parseNet(r.net) > 0)) valid = false;
    totalCuotas = Math.max(totalCuotas, r.to);
    totalNet += (r.to - r.from + 1) * (parseNet(r.net) || 0);
    expected = r.to + 1;
  }

  const tramosJson = JSON.stringify(
    rows.map((r) => ({ from: Number(r.from), to: Number(r.to), net: parseNet(r.net) })),
  );

  return (
    <form action={formAction} className="form" style={{ maxWidth: "none" }}>
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="tramos" value={tramosJson} />

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {rows.map((r, i) => (
          <div key={i} className="form-row" style={{ gridTemplateColumns: "1fr 1fr 1.2fr auto", alignItems: "end" }}>
            <div className="field">
              {i === 0 && <label>Desde cuota</label>}
              <input
                type="number"
                min={1}
                value={r.from}
                onChange={(e) => setRow(i, { from: parseInt(e.target.value || "1", 10) })}
              />
            </div>
            <div className="field">
              {i === 0 && <label>Hasta cuota</label>}
              <input
                type="number"
                min={r.from}
                value={r.to}
                onChange={(e) => setRow(i, { to: parseInt(e.target.value || "1", 10) })}
              />
            </div>
            <div className="field">
              {i === 0 && <label>Neto ({unit})</label>}
              <input
                inputMode="decimal"
                value={r.net}
                placeholder={currency === "UF" ? "24" : "650000"}
                onChange={(e) => setRow(i, { net: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => removeTramo(i)}
              disabled={rows.length === 1}
              title="Quitar tramo"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-sm" onClick={addTramo} style={{ width: "fit-content" }}>
        + Agregar tramo
      </button>

      <div className="note" style={{ marginTop: "4px" }}>
        {valid ? (
          <span>
            <b>{totalCuotas}</b> cuotas mensuales consecutivas desde el inicio del
            contrato · total neto{" "}
            <b>
              {currency === "UF"
                ? `${totalNet} UF`
                : `$${new Intl.NumberFormat("es-CL").format(totalNet)}`}
            </b>{" "}
            (+ IVA si aplica).
          </span>
        ) : (
          <span style={{ color: "var(--warn)" }}>
            Los tramos deben empezar en la cuota 1 y ser contiguos (ej. 1–6 y
            7–12), cada uno con neto mayor que cero.
          </span>
        )}
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.message && <span className="badge-soft">{state.message}</span>}
      {state.needsConfirm && (
        <div className="form-error" style={{ background: "var(--warn-dim)", color: "var(--warn)", borderColor: "rgba(224,166,60,.3)" }}>
          Este contrato ya tiene {(state.counts?.proyectadas ?? 0) + (state.counts?.billed ?? 0)} cuotas
          ({state.counts?.proyectadas ?? 0} proyectadas, {state.counts?.billed ?? 0} con movimiento).
          Puedes borrar las proyectadas y regenerar; las facturadas o pagadas no se tocan.
        </div>
      )}

      <div className="form-actions">
        <button
          type="submit"
          name="confirm"
          value="generar"
          className="btn btn-primary"
          disabled={pending || !valid}
        >
          {pending ? "Generando…" : "Generar cuotas"}
        </button>
        {state.needsConfirm && (
          <button
            type="submit"
            name="confirm"
            value="force"
            className="btn btn-danger"
            disabled={pending || !valid}
          >
            Borrar proyectadas y regenerar ({state.counts?.proyectadas ?? 0})
          </button>
        )}
      </div>
    </form>
  );
}
