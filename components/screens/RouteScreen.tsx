"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BottomNav, BrandTile, EmptyState, FuelChips, Sheet, Skeleton } from "../ui";
import { Icon } from "../Icon";
import { PlaceSearch } from "../PlaceSearch";
import { useLocation } from "../LocationProvider";
import { navUrl } from "../NavigateProvider";
import { RouteMap } from "../RouteMap";
import { stationHref } from "../StationRow";
import { recordVisit, useMode, useSettings, useShows } from "@/lib/store";
import { ChargeRoute } from "../ChargeRoute";
import { useJSON, r3 } from "@/lib/useJSON";
import type { Place, RouteResponse, RouteStop } from "@/lib/types";
import { fuelByKey } from "@/lib/fuels";
import { fmtEuros, fmtMinutes, fmtPrice } from "@/lib/format";
import { useDiscounts } from "@/lib/discountStore";
import { discText, encodeDiscounts, paidPrice } from "@/lib/discounts";

type Pt = { lat: number; lon: number; label: string };

export function RouteScreen() {
  const { loc } = useLocation();
  const [settings, setSettings] = useSettings();
  const fuel = settings.fuels.includes(settings.fuel) ? settings.fuel : (settings.fuels[0] ?? "g95");
  const [selId, setSelId] = useState<string | null>(null); // parada abierta en la hoja de "cómo llegar"
  const [mapSel, setMapSel] = useState<string | null>(null); // parada tocada en el mapa (tarjeta sobre el mapa)
  const [from, setFrom] = useState<Pt | null>(null); // null = mi ubicación
  const [to, setTo] = useState<Pt | null>(null);
  const [editing, setEditing] = useState<null | "from" | "to">(null);
  const [mode, setMode] = useMode(); // gasolineras o cargadores (el último que usaste)
  const shows = useShows();

  const [discState] = useDiscounts();
  const origin = from ?? (loc ? { lat: loc.lat, lon: loc.lon, label: loc.label ?? "Mi ubicación" } : null);
  const dParam = encodeDiscounts(discState);
  const url =
    origin && to && mode === "fuel"
      ? `/api/route?from=${r3(origin.lat)},${r3(origin.lon)}&to=${r3(to.lat)},${r3(to.lon)}&fuel=${fuel}&tank=${settings.tank}${dParam ? `&d=${encodeURIComponent(dParam)}` : ""}${settings.onlyBrands?.length ? `&o=${encodeURIComponent(settings.onlyBrands.join(","))}` : settings.hiddenBrands?.length ? `&h=${encodeURIComponent(settings.hiddenBrands.join(","))}` : ""}`
      : null;
  const { data, error, loading } = useJSON<RouteResponse>(url);

  const pick = (p: Place) => {
    const pt = { lat: p.lat, lon: p.lon, label: p.label };
    if (editing === "from") setFrom(pt);
    else setTo(pt);
    setEditing(null);
  };

  const stops = data?.stops ?? [];
  const best = stops.find((s) => s.bestOverall);
  const points = useMemo(
    () =>
      (data?.stops ?? []).map((s) => {
        const price = paidPrice(s.station, fuel) ?? s.station.prices[fuel];
        return { id: s.station.id, lat: s.station.lat, lon: s.station.lon, text: fmtPrice(price), aria: `${s.station.name}, ${fmtPrice(price)} euros, kilómetro ${s.kmAlong}`, big: s.bestInSeg, top: s.bestOverall };
      }),
    [data, fuel],
  );
  const sel = stops.find((s) => s.station.id === selId) ?? null;
  const onMap = stops.find((s) => s.station.id === mapSel) ?? null;
  const paid = (s: RouteStop) => paidPrice(s.station, fuel) ?? s.station.prices[fuel]!;
  const sub = (s: RouteStop) => `Km ${s.kmAlong} · desvío +${s.detourMin} min`;
  const fill = (s: RouteStop) => `Llenar ${fmtEuros(paid(s) * settings.tank)} €`;
  const visit = (s: RouteStop) => recordVisit({ id: s.station.id, m: s.station.munId, name: s.station.name, brand: s.station.brand, how: "ir" });

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top">
        <h1 className="h1 big">Ruta</h1>

        {shows.fuel && shows.charge && (
        <div role="tablist" aria-label="Qué buscar en la ruta" className="mode-tabs">
          <button type="button" role="tab" aria-selected={mode === "fuel"} className={mode === "fuel" ? "on" : undefined} onClick={() => setMode("fuel")}>
            <Icon name="pump" size={16} stroke={2.4} color={mode === "fuel" ? "#0B7A43" : "currentColor"} />
            Gasolineras
          </button>
          <button type="button" role="tab" aria-selected={mode === "charge"} className={mode === "charge" ? "on" : undefined} onClick={() => setMode("charge")}>
            <Icon name="bolt" size={16} stroke={mode === "charge" ? 1.6 : 2.2} fill={mode === "charge" ? "#1F4FD1" : "none"} color={mode === "charge" ? "#1F4FD1" : "currentColor"} />
            Cargadores
          </button>
        </div>
        )}

        {mode === "fuel" && settings.fuels.length > 1 && <FuelChips fuels={settings.fuels} value={fuel} onChange={(f) => setSettings((s) => ({ ...s, fuel: f }))} />}

        <div className="card stack-12">
          <div className="row-12">
            <div className="route-dots" aria-hidden="true">
              <span className="d1" />
              <span className="line" />
              <span className="d2" />
            </div>
            <div className="col-0 grow min0">
              <button type="button" className="route-field" onClick={() => setEditing("from")}>
                <span className="muted xs">Desde</span>
                <span className="b15 ellipsis">{from ? from.label : loc ? `Mi ubicación${loc.label ? ` · ${loc.label}` : ""}` : "Elige el origen"}</span>
              </button>
              <span className="divider" />
              <button type="button" className="route-field" onClick={() => setEditing("to")}>
                <span className="muted xs">Hasta</span>
                <span className={`b15 ellipsis${to ? "" : " muted"}`}>{to ? to.label : "¿A dónde vas?"}</span>
              </button>
            </div>
          </div>
          {data && mode === "fuel" && (
            <div className="row-between">
              <span className="b14">
                {data.distanceKm} km · {fmtMinutes(data.durationMin)} · {fuelByKey(fuel)?.label}
              </span>
              {data.average != null && <span className="muted b12">Media en ruta {fmtPrice(data.average)} €</span>}
            </div>
          )}
        </div>

        {!to && (
          <EmptyState
            icon="route"
            title={mode === "fuel" ? "Reposta en el camino" : "Carga en el camino"}
            text={
              mode === "fuel"
                ? "Dinos a dónde vas y te enseñamos las gasolineras más baratas de cada tramo del viaje, en un mapa y por kilómetro."
                : "Dinos a dónde vas y te enseñamos dónde cargar por el camino: los cargadores que le sirven a tu coche y lo que cuesta, contando el desvío."
            }
          >
            <button type="button" className="btn primary" onClick={() => setEditing("to")}>
              <Icon name="search" size={18} /> Elegir destino
            </button>
          </EmptyState>
        )}

        {mode === "charge" && origin && to && <ChargeRoute origin={origin} to={to} />}

        {mode === "fuel" && loading && !data && (
          <>
            <Skeleton h={90} r={22} />
            <Skeleton h={120} r={22} />
            <Skeleton />
          </>
        )}
        {mode === "fuel" && error && <EmptyState icon="info" title="No hemos podido calcular la ruta" text={error} />}

        {mode === "fuel" && data && origin && to && (
          <>
            {data.line.length > 1 && (
              <div className="route-map-wrap">
                <RouteMap line={data.line} points={points} selected={mapSel} onSelect={setMapSel} label="Mapa de la ruta con las gasolineras" />
                {onMap ? (
                  <div className="route-card">
                    <div className="row-10">
                      <BrandTile brand={onMap.station.brand} size={40} />
                      <span className="col-2 grow min0">
                        <span className="b15 ellipsis">{onMap.station.name}</span>
                        <span className="muted xs ellipsis">
                          {sub(onMap)} · {fill(onMap).toLowerCase()}
                        </span>
                      </span>
                      <span className="col-0 end">
                        <span className="price-sm green">{fmtPrice(paid(onMap))} €</span>
                        {onMap.bestOverall ? <span className="tag best">La más barata</span> : onMap.bestInSeg && data.segments.length > 1 ? <span className="tag best">Mejor del tramo</span> : null}
                      </span>
                      <button type="button" className="icon-btn ghost small" aria-label="Cerrar" onClick={() => setMapSel(null)}>
                        <Icon name="x" size={18} />
                      </button>
                    </div>
                    <div className="row-8">
                      <button type="button" className="btn primary small grow" onClick={() => setSelId(onMap.station.id)}>
                        <Icon name="navigate" size={16} stroke={2.4} /> Parar aquí
                      </button>
                      <Link className="btn soft small grow" href={stationHref(onMap.station)}>
                        Ver ficha
                      </Link>
                    </div>
                  </div>
                ) : (
                  stops.length > 0 && <span className="route-hint">Toca una gasolinera del mapa para ver su precio</span>
                )}
              </div>
            )}

            {!stops.length && <EmptyState icon="pump" title="Sin gasolineras en la ruta" text={`No hemos encontrado ${fuelByKey(fuel)?.label.toLowerCase()} a menos de 2,5 km del recorrido.`} />}

            {best && (
              <button type="button" className="card hero stack-12 as-button" onClick={() => setSelId(best.station.id)}>
                <span className="eyebrow green">LA MÁS BARATA DEL VIAJE</span>
                <span className="row-12">
                  <BrandTile brand={best.station.brand} size={48} />
                  <span className="col-2 grow min0 left">
                    <span className="b17 ellipsis">{best.station.name}</span>
                    <span className="muted sm">
                      {sub(best)} · {fill(best).toLowerCase()}
                    </span>
                  </span>
                  <span className="price-lg green">{fmtPrice(paid(best))} €</span>
                </span>
                {best.netSavings >= 0.1 && (
                  <span className="pill green fit">
                    Ahorras {fmtEuros(best.netSavings)} € frente a la media de la ruta
                  </span>
                )}
              </button>
            )}

            {data.segments.map((g, i) => {
              const inSeg = stops.filter((s) => s.seg === i);
              return (
                <section key={g.from} className="stack-8" aria-label={`Tramo del kilómetro ${g.from} al ${g.to}`}>
                  {data.segments.length > 1 && (
                    <div className="row-between baseline">
                      <h2 className="h2">
                        Km {g.from}–{g.to}
                      </h2>
                      <span className="muted b13">{i === 0 ? "Salida" : i === data.segments.length - 1 ? "Llegada" : `Tramo ${i + 1}`}</span>
                    </div>
                  )}
                  {!inSeg.length && <span className="muted b13">Sin gasolineras con {fuelByKey(fuel)?.label.toLowerCase()} junto a la ruta en este tramo.</span>}
                  {inSeg.map((s) => (
                    <button key={s.station.id} type="button" className={`row-card${s.station.id === mapSel ? " sel" : ""}`} onClick={() => setSelId(s.station.id)}>
                      <BrandTile brand={s.station.brand} size={40} />
                      <span className="col-2 grow min0 left">
                        <span className="b15 ellipsis">{s.station.name}</span>
                        <span className="muted sm ellipsis">{sub(s)}</span>
                        {s.station.disc && (
                          <span className="tag disc fit">
                            {s.station.disc.label} · {discText(s.station.disc)}
                          </span>
                        )}
                        {s.bestInSeg && data.segments.length > 1 && <span className="tag best fit">Mejor del tramo</span>}
                      </span>
                      <span className="col-4 end">
                        <span className="price-sm">{fmtPrice(paid(s))} €</span>
                        <span className="muted xs nowrap">{fill(s)}</span>
                      </span>
                    </button>
                  ))}
                </section>
              );
            })}
            <p className="source">
              Ruta calculada con OSRM (OpenStreetMap); puede pasar por autopistas de peaje. Se enseñan las más baratas de cada tramo a menos de 2,5 km del recorrido. Ahorro frente a la media de la ruta llenando {settings.tank} L.
            </p>
          </>
        )}
      </div>

      <Sheet open={!!sel && mode === "fuel"} onClose={() => setSelId(null)} label="Parada en la ruta">
        {sel && origin && to && (
          <div className="stack-12">
            <div className="row-12">
              <BrandTile brand={sel.station.brand} size={44} />
              <span className="col-2 grow min0">
                <span className="b16 ellipsis">{sel.station.name}</span>
                <span className="muted sm ellipsis">{sel.station.address}</span>
              </span>
              <span className="price-lg green">{fmtPrice(paid(sel))} €</span>
            </div>
            <span className="muted b13">
              {sub(sel)} · {fill(sel).toLowerCase()}
              {sel.netSavings >= 0.1 ? ` · ahorras ${fmtEuros(sel.netSavings)} € frente a la media de la ruta` : ""}
              {sel.station.disc ? ` · ${sel.station.disc.label} ${discText(sel.station.disc)}` : ""}
            </span>
            <a className="btn primary big" href={navUrl("maps", sel.station, { origin, destination: to })} target="_blank" rel="noopener" onClick={() => visit(sel)}>
              <Icon name="navigate" size={20} stroke={2.4} /> Google Maps con esta parada
            </a>
            <a className="btn soft" href={navUrl("waze", sel.station)} target="_blank" rel="noopener" onClick={() => visit(sel)}>
              Waze hasta la gasolinera
            </a>
            <span className="muted b12">Google Maps te lleva a la gasolinera y luego sigue hasta {to.label}. Waze solo admite un destino: después de repostar, pulsa aquí abajo para seguir.</span>
            <div className="stack-8">
              <a className="btn soft small grow" href={navUrl("waze", to)} target="_blank" rel="noopener">
                Seguir a destino con Waze
              </a>
              <Link className="btn soft small grow" href={stationHref(sel.station)}>
                Ver ficha y precios
              </Link>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} label={editing === "from" ? "Elegir origen" : "Elegir destino"}>
        <div className="stack-12">
          <h2 className="h-sheet">{editing === "from" ? "¿Desde dónde sales?" : "¿A dónde vas?"}</h2>
          <PlaceSearch
            autoFocus
            placeholder="Ciudad, calle o lugar"
            onUseGps={
              editing === "from"
                ? () => {
                    setFrom(null);
                    setEditing(null);
                  }
                : undefined
            }
            onPick={pick}
          />
        </div>
      </Sheet>
      <BottomNav />
    </div>
  );
}
