"use client";

import type { DiscountItem } from "@/lib/discounts";

const fmt = (it: DiscountItem) => (it.unit === "pct" ? `${it.cts} %` : `${it.cts} ${it.cts === 1 ? "ct/l" : "cts/l"}`);

/** Cuánto, en qué unidad (céntimos por litro o %) y cómo se recibe (rebaja en el surtidor o saldo en la tarjeta) */
export function DiscountControls({ it, onChange }: { it: DiscountItem; onChange: (patch: Partial<DiscountItem>) => void }) {
  const pct = it.unit === "pct";
  const max = pct ? 30 : 60;
  const saldo = it.kind === "saldo";
  return (
    <>
      <div className="disc-amount">
        <span className="b13">{saldo ? "Te devuelven" : "Descuento"}</span>
        <span className="row-8">
          <button type="button" aria-label="Menos" onClick={() => onChange({ cts: Math.max(1, it.cts - 1) })}>
            −
          </button>
          <span className="disc-val">{fmt(it)}</span>
          <button type="button" aria-label="Más" onClick={() => onChange({ cts: Math.min(max, it.cts + 1) })}>
            +
          </button>
        </span>
      </div>
      <div className="disc-kind">
        <button type="button" aria-pressed={!pct} className={`opt${!pct ? " on" : ""}`} onClick={() => onChange({ unit: "cts" })}>
          Céntimos por litro
        </button>
        <button type="button" aria-pressed={pct} className={`opt${pct ? " on" : ""}`} onClick={() => onChange({ unit: "pct", cts: Math.min(30, it.cts) })}>
          Porcentaje
        </button>
        <button type="button" aria-pressed={!saldo} className={`opt${!saldo ? " on" : ""}`} onClick={() => onChange({ kind: "directo" })}>
          Rebaja en el surtidor
        </button>
        <button type="button" aria-pressed={saldo} className={`opt${saldo ? " on" : ""}`} onClick={() => onChange({ kind: "saldo" })}>
          Saldo en la tarjeta
        </button>
      </div>
    </>
  );
}
