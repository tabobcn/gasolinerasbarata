"use client";

import Link from "next/link";
import { fmtKm } from "@/lib/format";
import { availText, chargerHref, chargerName, cpoStyle, displayGroup, priceNote, type Avail, type Car, type Charger, type Summary } from "@/lib/chargers";

const euro = (n: number) => n.toFixed(2).replace(".", ",");

export function ChargerTile({ ch, size = 40 }: { ch: Pick<Charger, "party" | "operator">; size?: number }) {
  const s = cpoStyle(ch.party, ch.operator);
  return (
    <span
      aria-hidden="true"
      className="cpo-tile"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: s.bg,
        color: s.fg,
        fontSize: Math.round(size * (s.mark.length > 2 ? 0.3 : 0.36)),
      }}
    >
      {s.mark}
    </span>
  );
}

export function AvailBadge({ a, small }: { a: Avail; small?: boolean }) {
  const t = availText(a);
  return (
    <span className={`avail ${t.tone}${small ? " small" : ""}`}>
      <span className="dot" aria-hidden="true" />
      {t.text}
    </span>
  );
}

/** Fila de la lista de cargadores */
export function ChargerRow({ s, car }: { s: Summary; car: Car }) {
  const pg = displayGroup(s, car);
  const price = pg?.price ?? null;
  const doubtful = pg?.doubtful ?? false;
  const cost = car.electric && !doubtful ? s.best?.fill.cost ?? null : null;
  const t = availText(s.avail);
  return (
    <Link href={chargerHref(s.ch)} className={`row-card${car.electric && !s.compatible ? " dim" : ""}`}>
      <ChargerTile ch={s.ch} size={40} />
      <span className="col-2 grow min0">
        <span className="b15 ellipsis">{chargerName(s.ch)}</span>
        <span className="muted b12 ellipsis">
          {fmtKm(s.ch.dist)} · {s.plugs || "Sin datos de enchufes"}
        </span>
        <span className={`b12 tone-${t.tone}`}>
          {car.electric && !s.compatible ? "No compatible con tu coche" : t.text}
        </span>
      </span>
      <span className="col-2 end">
        <span className={`price-sm${price != null ? " blue-ink" : " muted"}`}>{price != null ? `${euro(price)} €` : "—"}</span>
        <span className="muted b12 nowrap">{pg && (doubtful || !pg.vatKnown) ? priceNote(pg) : cost != null ? `${euro(cost)} € lleno` : price != null ? "kWh · IVA incl." : "sin precio"}</span>
      </span>
    </Link>
  );
}
