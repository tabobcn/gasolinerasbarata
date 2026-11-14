"use client";

import Link from "next/link";
import { fmtEuros, fmtKm, fmtPrice, shortStreet } from "@/lib/format";
import type { FuelKey } from "@/lib/fuels";
import { openStatus } from "@/lib/hours";
import type { Station } from "@/lib/types";
import { BrandTile } from "./ui";

export function stationHref(s: Pick<Station, "id" | "munId">) {
  return `/gasolinera/${s.id}?m=${s.munId}`;
}

/**
 * Fila de la lista. En vez de "Barato / Caro" (aquí salen solo las más baratas y todas serían "Barato")
 * se compara con la mejor opción: céntimos de más por litro y lo que cuesta llenar el depósito.
 */
export function StationRow({ s, fuel, tank, bestPrice }: { s: Station; fuel: FuelKey; tank: number; bestPrice: number | null }) {
  const p = s.prices[fuel];
  const st = openStatus(s.hours, s.provId);
  const diff = p != null && bestPrice != null ? p - bestPrice : null;
  return (
    <Link href={stationHref(s)} className="row-card">
      <BrandTile brand={s.brand} size={40} />
      <span className="col-2 grow min0">
        <span className="b15 ellipsis">{s.name}</span>
        <span className="muted sm ellipsis">
          {fmtKm(s.dist)}
          {st.open === false && (
            <>
              {" · "}
              <span className="closed">{st.label}</span>
            </>
          )}
          {s.address ? ` · ${shortStreet(s.address)}` : st.open !== false ? ` · ${st.label}` : ""}
        </span>
        {s.disc && s.listPrices?.[fuel] != null && (
          <span className="tag disc fit" title={`Precio de surtidor ${fmtPrice(s.listPrices[fuel])} €`}>
            {s.disc.label} · antes {fmtPrice(s.listPrices[fuel])}
          </span>
        )}
      </span>
      <span className="col-4 end">
        <span className="price-sm">{fmtPrice(p)} €</span>
        {p != null && (
          <span className="muted xs nowrap">
            {diff != null && diff >= 0.0005 ? `+${String(Math.round(diff * 1000) / 10).replace(".", ",")} cts · ` : ""}Llenar {fmtEuros(p * tank)} €
          </span>
        )}
      </span>
    </Link>
  );
}
