"use client";

import Link from "next/link";
import { fmtKm, fmtPrice } from "@/lib/format";
import type { FuelKey } from "@/lib/fuels";
import { openStatus } from "@/lib/hours";
import { levelFor } from "@/lib/savings";
import type { Station } from "@/lib/types";
import { BrandTile } from "./ui";

export function stationHref(s: Pick<Station, "id" | "munId">) {
  return `/gasolinera/${s.id}?m=${s.munId}`;
}

export function StationRow({ s, fuel, avg }: { s: Station; fuel: FuelKey; avg: number | null }) {
  const p = s.prices[fuel];
  const lv = p != null ? levelFor(p, avg) : null;
  const st = openStatus(s.hours, s.provId);
  return (
    <Link href={stationHref(s)} className="row-card">
      <BrandTile brand={s.brand} size={40} />
      <span className="col-2 grow min0">
        <span className="b15 ellipsis">{s.name}</span>
        <span className="muted sm ellipsis">
          {fmtKm(s.dist)} · <span className={st.open === false ? "closed" : undefined}>{st.label}</span>
        </span>
      </span>
      <span className="col-4 end">
        <span className="price-sm" style={{ color: lv?.color }}>
          {fmtPrice(p)} €
        </span>
        {s.disc && s.listPrices?.[fuel] != null ? (
          <span className="tag disc" title={`Precio de surtidor ${fmtPrice(s.listPrices[fuel])} €`}>
            {s.disc.label} · antes {fmtPrice(s.listPrices[fuel])}
          </span>
        ) : (
          lv && (
            <span className="tag" style={{ color: lv.color, background: lv.bg }}>
              {lv.label}
            </span>
          )
        )}
      </span>
    </Link>
  );
}
