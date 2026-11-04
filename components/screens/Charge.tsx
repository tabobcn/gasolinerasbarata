"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocation } from "../LocationProvider";
import { useNavigate } from "../NavigateProvider";
import { PlaceSearch } from "../PlaceSearch";
import { BottomNav, EmptyState, ModeTabs, Sheet, Skeleton } from "../ui";
import { Icon } from "../Icon";
import { AvailBadge, ChargerRow, ChargerTile } from "../ChargerBits";
import { settingsStore, useSettings } from "@/lib/store";
import { r3, stationsUrl, useJSON } from "@/lib/useJSON";
import type { StationsResponse } from "@/lib/types";
import { average, CONSUMPTION_L_100KM } from "@/lib/savings";
import { fmtKm, fmtMinutes } from "@/lib/format";
import {
  carFrom,
  chargerName,
  cpoStyle,
  EV_KWH_100KM,
  fmtDateTime,
  PLUG_LABEL,
  prettyCity,
  summarize,
  type ChargersResponse,
  type Summary,
} from "@/lib/chargers";

const RADII = [2, 5, 10, 20];
const euro = (n: number) => n.toFixed(2).replace(".", ",");
const kw = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} kW`;

export function Charge() {
  const { loc, status, ready, locate, setPlace } = useLocation();
  const [settings] = useSettings();
  const car = carFrom(settings);
  const goTo = useNavigate();
  const [sheet, setSheet] = useState(false);
  const [onlyCompat, setOnlyCompat] = useState(true);
  const [onlyWorking, setOnlyWorking] = useState(false);
  const [cheapFirst, setCheapFirst] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const url = loc ? `/api/chargers?lat=${r3(loc.lat)}&lon=${r3(loc.lon)}&radius=${settings.radius}` : null;
  const { data, error, loading, reload } = useJSON<ChargersResponse>(url);

  const view = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    let list = data.items.map((ch) => summarize(ch, car, now));
    const total = list.length;
    if (car.electric && onlyCompat) list = list.filter((s) => s.compatible);
    if (onlyWorking) list = list.filter((s) => !s.allDown);

    // El mejor para tu coche: el más barato de llenar contando lo que gastas en ir y volver
    const ok = list.filter((s) => s.best && !s.allDown && (!car.electric || s.compatible));
    const score = (s: Summary) => s.best!.fill.cost! + (s.ch.dist ?? 0) * 2 * (EV_KWH_100KM / 100) * (s.best!.price ?? 0.4);
    const priced = ok.filter((s) => s.best!.fill.cost != null).sort((a, b) => score(a) - score(b));
    const hero = car.electric ? priced[0] ?? ok[0] ?? null : null;

    const priceOf = (s: Summary) => {
      const ps = (car.electric ? s.groups.filter((g) => g.compatible) : s.groups).map((g) => g.price).filter((p): p is number => p != null);
      return ps.length ? Math.min(...ps) : Infinity;
    };
    let rest = list.filter((s) => s !== hero);
    if (cheapFirst) rest = [...rest].sort((a, b) => priceOf(a) - priceOf(b) || (a.ch.dist ?? 0) - (b.ch.dist ?? 0));
    return { hero, rest, shown: list.length, total };
  }, [data, car.electric, car.plugs.join(","), car.ac, car.dc, car.battery, onlyCompat, onlyWorking, cheapFirst]); // eslint-disable-line react-hooks/exhaustive-deps

  // Para comparar con gasolina: media de la gasolina 95 en la zona
  const heroPrice = view?.hero?.best?.price ?? null;
  const fuelData = useJSON<StationsResponse>(loc && heroPrice != null ? stationsUrl(loc.lat, loc.lon, settings.radius) : null).data;
  const g95 = fuelData ? average(fuelData.stations, "g95") : null;

  const place = loc?.label ?? (prettyCity(data?.items[0]?.city ?? null) || (loc ? "Tu zona" : "¿Dónde estás?"));
  const hero = view?.hero;
  const hg = hero?.best;

  return (
    <div className="screen with-nav">
      <div className="stack-14 pad-x top">
        <div className="row-between">
          <button type="button" className="place-btn" onClick={() => setSheet(true)}>
            <span className="muted b13">
              {loc?.source === "gps" || loc?.source === "saved" ? "Cerca de ti" : "Alrededor de"} · {settings.radius} km
            </span>
            <span className="place-name">
              <span className="ellipsis">{place}</span>
              <Icon name="chevronDown" size={18} stroke={2.4} />
            </span>
          </button>
          <button type="button" aria-label="Buscar dirección" className="icon-btn round" onClick={() => setSheet(true)}>
            <Icon name="search" size={20} />
          </button>
        </div>

        <ModeTabs mode="charge" />

        {car.electric ? (
          <Link href="/mi-coche" className="note blue link">
            <Icon name="plug" size={16} stroke={2.4} />
            <span className="grow">
              Tu {car.label}: {car.battery} kWh · {car.plugs.map((p) => PLUG_LABEL[p as keyof typeof PLUG_LABEL] ?? p).join(", ") || "sin enchufes"} hasta {kw(car.ac)}
              {car.dc > 0 ? ` (rápida ${car.dc >= 150 ? "150+" : car.dc} kW)` : ""}
            </span>
            <span className="b13">Cambiar</span>
          </Link>
        ) : (
          <Link href="/mi-coche" className="note blue link">
            <Icon name="car" size={16} stroke={2.4} />
            <span className="grow">¿Tienes un eléctrico o un híbrido enchufable? Dínoslo y te enseñamos solo los compatibles y lo que cuesta llenar.</span>
            <span className="b13">Mi coche</span>
          </Link>
        )}

        {data && (
          <div className="chips scroll-x" role="group" aria-label="Filtros">
            {car.electric && (
              <button type="button" className={`chip shadow${onlyCompat ? " on" : ""}`} aria-pressed={onlyCompat} onClick={() => setOnlyCompat((v) => !v)}>
                {onlyCompat && <Icon name="check" size={14} stroke={2.8} />}
                Compatibles
              </button>
            )}
            <button type="button" className={`chip shadow${onlyWorking ? " on" : ""}`} aria-pressed={onlyWorking} onClick={() => setOnlyWorking((v) => !v)}>
              {onlyWorking && <Icon name="check" size={14} stroke={2.8} />}
              Que funcionan
            </button>
            <button type="button" className={`chip shadow${cheapFirst ? " on" : ""}`} aria-pressed={cheapFirst} onClick={() => setCheapFirst((v) => !v)}>
              {cheapFirst && <Icon name="check" size={14} stroke={2.8} />}
              Más barato
            </button>
          </div>
        )}

        {!loc && ready && (
          <EmptyState
            icon="pin"
            title={status === "denied" ? "No tenemos permiso de ubicación" : "¿Dónde buscamos?"}
            text={
              status === "denied"
                ? "Busca tu zona a mano o activa la ubicación para esta web en los ajustes del navegador."
                : "Usa tu ubicación o busca un sitio para ver los puntos de recarga cercanos."
            }
          >
            <div className="row-8 wrap center">
              <button type="button" className="btn primary" onClick={locate}>
                <Icon name="navigate" size={18} /> Usar mi ubicación
              </button>
              <button type="button" className="btn soft" onClick={() => setSheet(true)}>
                <Icon name="search" size={18} /> Buscar sitio
              </button>
            </div>
          </EmptyState>
        )}

        {(!ready || status === "locating") && !loc && <Skeleton h={160} r={24} />}

        {loc && loading && !data && (
          <>
            <Skeleton h={230} r={24} />
            <Skeleton />
            <Skeleton />
          </>
        )}

        {error && !data && (
          <EmptyState icon="info" title="No hemos podido cargar los cargadores" text={error}>
            <button type="button" className="btn soft" onClick={reload}>
              <Icon name="refresh" size={18} /> Reintentar
            </button>
          </EmptyState>
        )}

        {view && view.shown === 0 && (
          <EmptyState
            icon="plug"
            title={view.total ? "Ninguno encaja con los filtros" : `Sin puntos de recarga en ${settings.radius} km`}
            text={view.total ? `Hay ${view.total} puntos cerca, pero ninguno cumple los filtros que has elegido.` : "Prueba a ampliar el radio de búsqueda."}
          >
            {view.total ? (
              <button
                type="button"
                className="btn soft"
                onClick={() => {
                  setOnlyCompat(false);
                  setOnlyWorking(false);
                }}
              >
                Ver todos
              </button>
            ) : (
              <button type="button" className="btn soft" onClick={() => settingsStore.set((s) => ({ ...s, radius: Math.min(25, s.radius * 2) }))}>
                Ampliar a {Math.min(25, settings.radius * 2)} km
              </button>
            )}
          </EmptyState>
        )}

        {hero && hg && (
          <section className="card hero" aria-labelledby="ev-best">
            <div className="row-between">
              <span className="eyebrow blue" id="ev-best">
                {hg.fill.cost != null ? "MEJOR PARA TU COCHE" : "EL MÁS CERCANO PARA TU COCHE"}
              </span>
              <AvailBadge a={hero.avail} />
            </div>
            <Link href={`/cargador/${hero.ch.id}`} className="row-12 plain">
              <ChargerTile ch={hero.ch} size={48} />
              <span className="col-2 min0">
                <span className="b17 clamp-2">{chargerName(hero.ch)}</span>
                <span className="muted sm ellipsis">
                  {fmtKm(hero.ch.dist)} · {PLUG_LABEL[hg.kind]} · {kw(hg.kw)}
                  {hero.ch.h24 ? " · 24 h" : ""}
                </span>
              </span>
            </Link>
            {hg.price != null ? (
              <span className="big-price blue">
                <span className="num">{hg.price === 0 ? "Gratis" : euro(hg.price)}</span>
                {hg.price !== 0 && <span className="unit">€/kWh</span>}
              </span>
            ) : (
              <span className="b15 muted">Precio no disponible en REVE</span>
            )}
            <div className="saving-box">
              Llenar del 20 al 100 %:{" "}
              <strong>
                {hg.fill.cost != null ? `${hg.fill.cost === 0 ? "gratis" : `${euro(hg.fill.cost)} €`} · ` : ""}
                {fmtMinutes(hg.fill.minutes)}
              </strong>
            </div>
            {hg.kw > hg.fill.kw + 0.05 && (
              <span className="muted b12">
                El cargador da {kw(hg.kw)}, pero tu coche carga como máximo a {kw(hg.fill.kw)}
              </span>
            )}
            <div className="row-10">
              <button type="button" className="btn primary big grow" onClick={() => goTo({ lat: hero.ch.lat, lon: hero.ch.lon, dist: hero.ch.dist, name: chargerName(hero.ch), address: hero.ch.address ?? "", brand: cpoStyle(hero.ch.party, hero.ch.operator).name })}>
                <Icon name="navigate" size={20} stroke={2.4} />
                Ir ahora
              </button>
              <Link href={`/cargador/${hero.ch.id}`} className="btn soft big">
                Ver detalles
              </Link>
            </div>
          </section>
        )}

        {hero && heroPrice != null && g95 != null && (
          <div className="card tight-y stack-8">
            <span className="b13 strong">Hoy, 100 km te cuestan</span>
            <div className="grid-2">
              <span className="compare-box blue">
                <span className="b12">Cargando aquí</span>
                <span className="b20">{euro(EV_KWH_100KM * heroPrice)} €</span>
              </span>
              <span className="compare-box">
                <span className="b12 muted">Con gasolina 95</span>
                <span className="b20">{euro(CONSUMPTION_L_100KM * g95)} €</span>
              </span>
            </div>
            <span className="muted xs">
              Con un consumo medio de {EV_KWH_100KM} kWh y {CONSUMPTION_L_100KM} litros cada 100 km, y la gasolina 95 a la media de tu zona
            </span>
          </div>
        )}

        {view && view.rest.length > 0 && (
          <>
            <div className="row-between baseline">
              <h2 className="h2">{hero ? "Otros cerca" : "Cerca de ti"}</h2>
              <span className="muted b13">{cheapFirst ? "Del más barato" : "Por distancia"}</span>
            </div>
            <div className="stack-8">
              {(showAll ? view.rest : view.rest.slice(0, 15)).map((s) => (
                <ChargerRow key={s.ch.id} s={s} car={car} />
              ))}
            </div>
            {!showAll && view.rest.length > 15 && (
              <button type="button" className="btn soft" onClick={() => setShowAll(true)}>
                Ver {view.rest.length - 15} más
              </button>
            )}
          </>
        )}

        {data && (
          <p className="source">
            Fuente: Red Eléctrica de España (REVE, Registro de Vehículo Eléctrico). Datos actualizados el {fmtDateTime(data.updated)}. Precios con IVA calculados a partir de la tarifa
            que publica cada operador; el tiempo de carga es aproximado. Distancias en línea recta.
          </p>
        )}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} label="Cambiar zona">
        <div className="stack-16">
          <h2 className="h-sheet">¿Dónde buscamos?</h2>
          <div className="stack-8">
            <span className="eyebrow">RADIO</span>
            <div className="chips">
              {RADII.map((r) => (
                <button key={r} type="button" className={`chip${settings.radius === r ? " on" : ""}`} aria-pressed={settings.radius === r} onClick={() => settingsStore.set((s) => ({ ...s, radius: r }))}>
                  {r} km
                </button>
              ))}
            </div>
          </div>
          <PlaceSearch
            autoFocus
            onUseGps={() => {
              locate();
              setSheet(false);
            }}
            onPick={(p) => {
              setPlace({ lat: p.lat, lon: p.lon, label: p.label });
              setSheet(false);
            }}
          />
        </div>
      </Sheet>
      <BottomNav />
    </div>
  );
}
