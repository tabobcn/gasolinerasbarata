"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { BrandTile, Sheet } from "../ui";
import { useLocation } from "../LocationProvider";
import { stationHref } from "../StationRow";
import { discountsStore, useDiscounts } from "@/lib/discountStore";
import { allPrograms, applyDiscount, customId, discountFor, type DiscountState } from "@/lib/discounts";
import { activeOffers, fmtDay } from "@/lib/offers";
import { knownBrandList } from "@/lib/brands";
import { useSettings } from "@/lib/store";
import { stationsUrl, useJSON } from "@/lib/useJSON";
import { fmtPrice } from "@/lib/format";
import { fuelByKey } from "@/lib/fuels";
import type { StationsResponse } from "@/lib/types";
import Link from "next/link";

const cts = (n: number) => `${n} ${n === 1 ? "ct/l" : "cts/l"}`;

export function Discounts() {
  const router = useRouter();
  const [d, setD] = useDiscounts();
  const [settings] = useSettings();
  const { loc } = useLocation();
  const [adding, setAdding] = useState(false);
  const programs = allPrograms(d);
  const offers = activeOffers();

  const setItem = (id: string, patch: Partial<{ on: boolean; cts: number }>) =>
    setD((s: DiscountState) => {
      const cur = s.items[id] ?? { on: false, cts: 5 };
      return { ...s, items: { ...s.items, [id]: { ...cur, ...patch } } };
    });

  // Ejemplo real: la gasolinera más cercana con alguno de tus descuentos
  const { data } = useJSON<StationsResponse>(loc ? stationsUrl(loc.lat, loc.lon, settings.radius) : null);
  const example = useMemo(() => {
    if (!data) return null;
    const on = { ...d, enabled: true };
    const s = data.stations.find((x) => x.prices[settings.fuel] != null && discountFor(x.brand, on));
    return s ? applyDiscount(s, on) : null;
  }, [data, d, settings.fuel]);

  const brandsToAdd = knownBrandList().filter((b) => !programs.some((p) => p.brands.includes(b.key)));

  return (
    <div className="screen with-bar">
      <div className="stack-14 pad-x top">
        <div className="row-12">
          <button type="button" aria-label="Volver" className="icon-btn round" onClick={() => router.back()}>
            <Icon name="back" size={20} stroke={2.4} />
          </button>
          <h1 className="h1">Mis descuentos</h1>
        </div>
        <span className="muted b14">Marca las tarjetas y apps que usas. Te enseñamos el precio que pagas de verdad y ordenamos las gasolineras con él.</span>

        <section className="card tight">
          <h2 className="eyebrow pad-top">MIS TARJETAS Y APPS</h2>
          {programs.map((p, i) => {
            const it = d.items[p.id] ?? { on: false, cts: 5 };
            const isCustom = p.id.startsWith("b:");
            return (
              <div key={p.id} className={`disc-item${i < programs.length - 1 ? " line" : ""}`}>
                <div className="row-12 disc-head">
                  <BrandTile brand={p.tileBrand} size={40} />
                  <span className="col-2 grow min0">
                    <span className="b15">{p.name}</span>
                    <span className="muted b12">{p.sub}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={it.on}
                    aria-label={`Usar descuento de ${p.name}`}
                    className={`switch-btn${it.on ? " on" : ""}`}
                    onClick={() => setItem(p.id, { on: !it.on })}
                  >
                    <span aria-hidden="true" />
                  </button>
                </div>
                {it.on && (
                  <div className="disc-amount">
                    <span className="b13">Descuento</span>
                    <span className="row-8">
                      <button type="button" aria-label="Un céntimo menos" onClick={() => setItem(p.id, { cts: Math.max(1, it.cts - 1) })}>
                        −
                      </button>
                      <span className="disc-val">{cts(it.cts)}</span>
                      <button type="button" aria-label="Un céntimo más" onClick={() => setItem(p.id, { cts: Math.min(60, it.cts + 1) })}>
                        +
                      </button>
                    </span>
                  </div>
                )}
                {isCustom && (
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() =>
                      setD((s: DiscountState) => {
                        const items = { ...s.items };
                        delete items[p.id];
                        return { ...s, items, custom: s.custom.filter((b) => customId(b) !== p.id) };
                      })
                    }
                  >
                    Quitar
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="add-row" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} stroke={2.6} /> Añadir otro descuento
          </button>
        </section>

        <section className="card stack-12">
          <div className="row-between baseline">
            <h2 className="eyebrow">OFERTAS ACTIVAS</h2>
            {offers[0] && <span className="muted b12">Revisadas el {fmtDay(offers[0].checked)}</span>}
          </div>
          {offers.map((o) => (
            <div key={o.id} className="offer">
              <BrandTile brand={o.brand} size={36} />
              <span className="col-2">
                <span className="b14">{o.title}</span>
                <span className="xs">{o.detail}</span>
                <span className="xs">Hasta el {fmtDay(o.until)}</span>
                <a href={o.url} target="_blank" rel="noopener" className="b12">
                  Ver condiciones
                </a>
              </span>
            </div>
          ))}
          {!offers.length && <span className="muted sm">Ahora mismo no tenemos ofertas apuntadas.</span>}
          <span className="muted b12">Las ofertas cambian a menudo y se revisan a mano. El precio con descuento es orientativo.</span>
        </section>

        {example && example.disc && example.listPrices && (
          <Link href={stationHref(example)} className="example-box">
            <span className="eyebrow green">ASÍ LO VERÁS · {fuelByKey(settings.fuel)?.label.toUpperCase()}</span>
            <span className="row-8 wrap baseline">
              <span className="b14">{example.name}</span>
              <span className="strike b14">{fmtPrice(example.listPrices[settings.fuel])} €</span>
              <span className="price-sm green">{fmtPrice(example.prices[settings.fuel])} €</span>
            </span>
            <span className="b12 green-dark">
              Con tu {example.disc.label} −{cts(example.disc.cts)} · la ponemos primera si sale más barata
            </span>
          </Link>
        )}
      </div>

      <div className="action-bar plain">
        <button type="button" className="btn primary big grow" onClick={() => router.push("/")}>
          <Icon name="check" size={20} stroke={2.6} /> Guardar descuentos
        </button>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} label="Añadir otro descuento">
        <div className="stack-12">
          <h2 className="h-sheet">¿En qué gasolinera tienes descuento?</h2>
          <div className="chips wrap">
            {brandsToAdd.map((b) => (
              <button
                key={b.key}
                type="button"
                className="chip soft"
                onClick={() => {
                  discountsStore.set((s) => ({
                    ...s,
                    custom: s.custom.includes(b.key) ? s.custom : [...s.custom, b.key],
                    items: { ...s.items, [customId(b.key)]: { on: true, cts: 5 } },
                  }));
                  setAdding(false);
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
