"use client";

import { useState } from "react";
import { BottomNav, BrandTile, EmptyState, Sheet, Skeleton } from "../ui";
import { Icon } from "../Icon";
import { PlaceSearch } from "../PlaceSearch";
import { useLocation } from "../LocationProvider";
import { navUrl, useNavigate } from "../NavigateProvider";
import { useMode, useSettings, useShows } from "@/lib/store";
import { brandVisible } from "@/lib/brands";
import { ChargeRoute } from "../ChargeRoute";
import { useJSON, r3 } from "@/lib/useJSON";
import type { Place, RouteResponse } from "@/lib/types";
import { fuelByKey } from "@/lib/fuels";
import { fmtEuros, fmtMinutes, fmtPrice } from "@/lib/format";
import { useDiscounts } from "@/lib/discountStore";
import { encodeDiscounts } from "@/lib/discounts";

type Pt = { lat: number; lon: number; label: string };

export function RouteScreen() {
  const { loc } = useLocation();
  const [settings] = useSettings();
  const goTo = useNavigate();
  const fuel = settings.fuel;
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
      ? `/api/route?from=${r3(origin.lat)},${r3(origin.lon)}&to=${r3(to.lat)},${r3(to.lon)}&fuel=${fuel}&tank=${settings.tank}${dParam ? `&d=${encodeURIComponent(dParam)}` : ""}`
      : null;
  const { data, error, loading } = useJSON<RouteResponse>(url);

  const pick = (p: Place) => {
    const pt = { lat: p.lat, lon: p.lon, label: p.label };
    if (editing === "from") setFrom(pt);
    else setTo(pt);
    setEditing(null);
  };

  const visible = brandVisible(settings.hiddenBrands);
  const stops = (data?.stops ?? []).filter((s) => visible(s.station.brand)); // sin las marcas ocultas en Ajustes
  const best = stops[0];
  const total = data?.distanceKm ?? 1;
  const marks = stops.slice(0, 4);

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
                ? "Dinos a dónde vas y te enseñamos las gasolineras de la ruta que más te hacen ahorrar, contando el desvío."
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
            <div className="card route-strip" role="img" aria-label={`Recorrido de ${data.distanceKm} km con ${marks.length} paradas recomendadas`}>
              <div className="strip">
                <span className="strip-line" />
                <span className="strip-end start" style={{ left: "0%" }} />
                <span className="strip-end" style={{ left: "100%" }} />
                {marks.map((s, i) => (
                  <span key={s.station.id} className={`strip-stop${i === 0 ? " best" : ""}`} style={{ left: `${Math.min(100, (s.kmAlong / total) * 100)}%` }}>
                    {i === 0 ? "1" : ""}
                  </span>
                ))}
              </div>
              <div className="strip-labels">
                <span>{origin.label.replace(/^Mi ubicación · /, "")}</span>
                {data.waypoints.map((w) => (
                  <span key={w.km}>{w.label}</span>
                ))}
                <span>{to.label}</span>
              </div>
            </div>

            <div className="row-between baseline">
              <h2 className="h2">Mejores paradas</h2>
              <span className="muted b13">Por ahorro real</span>
            </div>

            {!stops.length && <EmptyState icon="pump" title="Sin gasolineras en la ruta" text={`No hemos encontrado ${fuelByKey(fuel)?.label.toLowerCase()} a menos de 2,5 km del recorrido.`} />}

            {best && (
              <div className="card hero stack-12">
                <button type="button" className="row-12 plain" onClick={() => goTo({ ...best.station, dist: undefined })}>
                  <BrandTile brand={best.station.brand} size={48} />
                  <span className="col-2 grow min0 left">
                    <span className="b17 ellipsis">{best.station.name}</span>
                    <span className="muted sm">
                      Km {best.kmAlong} · desvío +{best.detourMin} min{best.station.disc ? ` · con ${best.station.disc.label}${best.station.disc.kind === "saldo" ? " (en saldo)" : ""}` : ""}
                    </span>
                  </span>
                  <span className="price-lg green">{fmtPrice(best.station.prices[fuel])} €</span>
                </button>
                <div className="row-between">
                  <span className="pill green">{best.netSavings > 0 ? `Ahorras ${fmtEuros(best.netSavings)} € netos` : "La mejor opción de la ruta"}</span>
                  <a className="btn soft small" href={navUrl("maps", best.station, { origin, destination: to })} target="_blank" rel="noopener">
                    <Icon name="plus" size={16} stroke={2.6} /> Añadir parada
                  </a>
                </div>
              </div>
            )}

            <div className="stack-8">
              {stops.slice(1).map((s) => (
                <button key={s.station.id} type="button" className="row-card" onClick={() => goTo({ ...s.station, dist: undefined })}>
                  <BrandTile brand={s.station.brand} size={40} />
                  <span className="col-2 grow min0 left">
                    <span className="b15 ellipsis">{s.station.name}</span>
                    <span className="muted sm ellipsis">
                      Km {s.kmAlong} · desvío +{s.detourMin} min{s.station.disc ? ` · con ${s.station.disc.label}${s.station.disc.kind === "saldo" ? " (en saldo)" : ""}` : ""}{s.netSavings > 0 ? ` · ahorras ${fmtEuros(s.netSavings)} €` : ""}
                    </span>
                  </span>
                  <span className="price-sm">{fmtPrice(s.station.prices[fuel])} €</span>
                </button>
              ))}
            </div>
            <p className="source">Ruta calculada con OSRM (OpenStreetMap). Ahorro frente a la media de la ruta llenando {settings.tank} L, descontando el desvío.</p>
          </>
        )}
      </div>

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
