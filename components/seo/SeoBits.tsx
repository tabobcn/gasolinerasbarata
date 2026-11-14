import Link from "next/link";
import { brandStyle, LOGO_IMG, tileCss } from "@/lib/brands";
import { fmtPrice } from "@/lib/format";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { levelFor } from "@/lib/savings";
import type { FuelSummary } from "@/lib/seo";
import type { Station } from "@/lib/types";
import { SITE_URL } from "@/lib/config";
import { JsonLd } from "./JsonLd";

export const stationLink = (s: Station) => `/gasolinera/${s.id}?m=${s.munId}`;

export function SeoStationRow({ s, fuel, avg, rank }: { s: Station; fuel: FuelKey; avg: number | null; rank: number }) {
  const p = s.prices[fuel]!;
  const lv = levelFor(p, avg);
  const b = brandStyle(s.brand);
  return (
    <li>
      <Link href={stationLink(s)} className="row-card">
        <span className="seo-rank" aria-hidden="true">
          {rank}
        </span>
        <span aria-hidden="true" style={tileCss(b, 36)}>
          {b.logo ? <img src={b.logo} alt="" width={36} height={36} loading="lazy" decoding="async" style={LOGO_IMG} /> : b.mark}
        </span>
        <span className="col-2 grow min0">
          <span className="b15 ellipsis">{s.name}</span>
          <span className="muted b12 ellipsis">
            {s.address}
            {s.town && s.town !== s.mun ? ` · ${s.town}` : ""}
          </span>
        </span>
        <span className="col-0 end">
          <span className="price-sm" style={{ color: lv.color }}>
            {fmtPrice(p)} €
          </span>
          <span className="b12" style={{ color: lv.color }}>
            {lv.label}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function SummaryTable({ rows, compare }: { rows: FuelSummary[]; compare?: Record<string, number | null> }) {
  const shown = rows.filter((r) => r.count > 0);
  if (!shown.length) return null;
  return (
    <div className="card tight">
      <table className="seo-table">
        <caption className="sr-only">Precio más barato y precio medio por combustible</caption>
        <thead>
          <tr>
            <th scope="col">Combustible</th>
            <th scope="col">Más barata</th>
            <th scope="col">Media</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.fuel}>
              <th scope="row">{fuelByKey(r.fuel)?.label}</th>
              <td>
                <strong className="green">{fmtPrice(r.min)} €</strong>
              </td>
              <td>
                {fmtPrice(r.avg)} €
                {compare?.[r.fuel] != null && r.avg != null && <span className="muted b12 block">provincia {fmtPrice(compare[r.fuel])} €</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.label,
      ...(it.href ? { item: `${SITE_URL}${it.href}` } : {}),
    })),
  };
  return (
    <nav aria-label="Estás en" className="crumbs">
      <JsonLd data={ld} />
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
