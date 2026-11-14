"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "../LocationProvider";
import { useNavigate } from "../NavigateProvider";
import { PlaceSearch } from "../PlaceSearch";
import { DeskSearch } from "../DeskSearch";
import { MapScreen } from "./MapScreen";
import { useDesktop } from "@/lib/useDesktop";
import { StationRow, stationHref } from "../StationRow";
import { AlertsBanner } from "../AlertsBanner";
import { InstallHint } from "../InstallHint";
import { Welcome } from "../Welcome";
import { BottomNav, BrandTile, EmptyState, FuelChips, ModeTabs, Sheet, Skeleton } from "../ui";
import { Icon } from "../Icon";
import { favoritesStore, modeStore, settingsStore, useFavorites, useRefuels, useSettings, useShows } from "@/lib/store";
import { brandVisible } from "@/lib/brands";
import { stationsUrl, useJSON } from "@/lib/useJSON";
import type { StationsResponse } from "@/lib/types";
import { average, bestValue } from "@/lib/savings";
import { fmtCents, fmtEuros, fmtKm, fmtPrice, madridDate, timeAgo } from "@/lib/format";
import { fuelByKey } from "@/lib/fuels";
import { openStatus } from "@/lib/hours";
import { useDiscounts } from "@/lib/discountStore";
import { applyDiscounts } from "@/lib/discounts";
import { DiscountToggle } from "../DiscountToggle";

const RADII = [2, 5, 10, 20];

export function Home() {
  const { loc, status, ready, locate, setPlace } = useLocation();
  const desktop = useDesktop();
  const [settings, setSettings] = useSettings();
  const shows = useShows();
  const router = useRouter();
  // Un eléctrico no usa gasolineras: su pantalla de inicio son los cargadores
  useEffect(() => {
    if (shows.fuel) modeStore.set("fuel");
    else router.replace("/carga");
  }, [shows.fuel, router]);
  const [favs] = useFavorites();
  const [sheet, setSheet] = useState(false);
  const fuel = settings.fuels.includes(settings.fuel) ? settings.fuel : settings.fuels[0] ?? "g95";
  const { data, error, loading, reload } = useJSON<StationsResponse>(loc ? stationsUrl(loc.lat, loc.lon, settings.radius) : null);
  const [disc] = useDiscounts();

  const view = useMemo(() => {
    if (!data) return null;
    const visible = brandVisible(settings.hiddenBrands);
    const withFuel = applyDiscounts(data.stations, disc).filter((s) => s.prices[fuel] != null && visible(s.brand));
    const openOnes = withFuel.filter((s) => openStatus(s.hours, s.provId).open !== false);
    const best = bestValue(openOnes.length ? openOnes : withFuel, fuel, settings.tank);
    const avg = average(withFuel, fuel);
    const others = withFuel
      .filter((s) => s.id !== best?.station.id)
      .sort((a, b) => a.prices[fuel]! - b.prices[fuel]! || (a.dist ?? 0) - (b.dist ?? 0))
      .slice(0, 12);
    return { best, avg, others, count: withFuel.length };
  }, [data, fuel, settings.tank, disc, settings.hiddenBrands]);

  const place = loc?.label ?? data?.stations[0]?.mun ?? (loc ? "Tu zona" : "¿Dónde estás?");
  const best = view?.best;
  const bestPrice = best ? best.station.prices[fuel]! : null;
  const isFav = best ? favs.some((f) => f.id === best.station.id) : false;
  const goTo = useNavigate();
  const carName = settings.carName?.trim();
  const [refuels] = useRefuels();
  const ym = madridDate(new Date()).slice(0, 7);
  const monthSpend = refuels.length ? refuels.filter((r) => r.date.startsWith(ym)).reduce((a, r) => a + r.total, 0) : null;

  const toggleFav = () => {
    if (!best) return;
    const s = best.station;
    favoritesStore.set((list) => (list.some((f) => f.id === s.id) ? list.filter((f) => f.id !== s.id) : [...list, { id: s.id, m: s.munId, name: s.name, brand: s.brand }]));
  };

  return (
    <div className="screen with-nav split">
      <div className="stack-16 pad-x top">
        <DeskSearch title="¿Dónde quieres repostar?" />
        <h1 className="sr-only">Gasolineras baratas cerca de ti</h1>
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

        <Welcome />

        <ModeTabs mode="fuel" />

        <FuelChips fuels={settings.fuels} value={fuel} onChange={(f) => setSettings((s) => ({ ...s, fuel: f }))} />

        {data && <DiscountToggle />}

        <AlertsBanner />

        {!loc && ready && (
          <EmptyState
            icon="pin"
            title={status === "denied" ? "No tenemos permiso de ubicación" : "¿Dónde buscamos?"}
            text={
              status === "denied"
                ? "Busca tu zona a mano o activa la ubicación para esta web en los ajustes del navegador."
                : "Usa tu ubicación o busca un sitio para ver las gasolineras más baratas."
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

        {(!ready || status === "locating") && !loc && (
          <div className="card stack-12">
            <span className="muted b13">Buscando estaciones cerca de ti…</span>
            <Skeleton h={120} />
          </div>
        )}

        {loc && loading && !data && (
          <>
            <Skeleton h={300} r={24} />
            <Skeleton />
            <Skeleton />
          </>
        )}

        {error && !data && (
          <EmptyState icon="info" title="No hemos podido cargar los precios" text={error}>
            <button type="button" className="btn soft" onClick={reload}>
              <Icon name="refresh" size={18} /> Reintentar
            </button>
          </EmptyState>
        )}

        {data && view && !best && (
          <EmptyState
            icon="pump"
            title={`Sin ${fuelByKey(fuel)?.label.toLowerCase()} en ${settings.radius} km`}
            text="Prueba con otro combustible o amplía el radio de búsqueda."
          >
            {settings.radius < 25 && (
              <button type="button" className="btn soft" onClick={() => setSettings((s) => ({ ...s, radius: Math.min(25, s.radius * 2) }))}>
                Ampliar a {Math.min(25, settings.radius * 2)} km
              </button>
            )}
          </EmptyState>
        )}

        {best && bestPrice != null && (
          <section className="card hero" aria-labelledby="best-title">
            <div className="row-between">
              <span className="eyebrow green" id="best-title">
                {best.station.disc ? "MEJOR OPCIÓN CON TUS TARJETAS" : "MEJOR OPCIÓN AHORA"}
              </span>
              <span className="muted b12">{timeAgo(data!.updatedAt)}</span>
            </div>
            <Link href={stationHref(best.station)} className="row-12 plain">
              <BrandTile brand={best.station.brand} size={48} />
              <span className="col-2 min0">
                <span className="b17 clamp-2">{best.station.name}</span>
                <span className="muted sm ellipsis">
                  {best.station.address} · {fmtKm(best.station.dist)} · {openStatus(best.station.hours, best.station.provId).label}
                </span>
              </span>
            </Link>
            <div className="row-between end">
              <span className="col-2">
                {best.station.disc && best.station.listPrices?.[fuel] != null && (
                  <span className="strike b15">{fmtPrice(best.station.listPrices[fuel])} €</span>
                )}
                <span className="big-price green">
                  <span className="num">{fmtPrice(bestPrice)}</span>
                  <span className="unit">€/l</span>
                </span>
              </span>
              {best.station.disc ? (
                <span className="pill amber">
                  Con {best.station.disc.label} −{best.station.disc.cts} cts
                </span>
              ) : best.avg - bestPrice >= 0.005 ? (
                <span className="pill green">
                  <Icon name="trendDown" size={14} stroke={2.6} />
                  {fmtCents(best.avg - bestPrice)} bajo la media
                </span>
              ) : (
                <span className="pill amber">En la media de la zona</span>
              )}
            </div>
            <div className="saving-box">
              <span className="row-between">
                <span>
                  Llenar {settings.tank} litros{carName ? ` · ${carName}` : ""}
                </span>
                <strong>{fmtEuros(bestPrice * settings.tank)} €</strong>
              </span>
              {best.savings >= 0.1 ? (
                <span className="muted xs block">
                  Ahorras <strong className="green">{fmtEuros(best.savings)} €</strong> frente al precio medio de las otras gasolineras de tu zona ({fmtPrice(best.avg)} €/l), ya
                  descontado lo que gastas en ir y volver
                </span>
              ) : (
                <span className="muted xs block">La mejor relación precio-distancia de tu zona</span>
              )}
            </div>
            <div className="row-10">
              <button type="button" className="btn primary big grow" onClick={() => goTo(best.station)}>
                <Icon name="navigate" size={20} stroke={2.4} />
                Ir ahora
              </button>
              <button
                type="button"
                aria-label={isFav ? "Quitar de favoritas" : "Guardar en favoritas"}
                aria-pressed={isFav}
                className={`btn square-56${isFav ? " fav-on" : " soft"}`}
                onClick={toggleFav}
              >
                <Icon name="star" size={22} fill={isFav ? "currentColor" : "none"} />
              </button>
            </div>
          </section>
        )}

        {data && (
          <Link href="/repostajes" className="card row-12 tight-y plain">
            <span className="soft-icon green" aria-hidden="true">
              <Icon name="trendDown" size={20} />
            </span>
            <span className="col-2 grow min0">
              <span className="b14">Mis repostajes</span>
              <span className="muted b12">{monthSpend != null ? `Este mes llevas ${fmtEuros(monthSpend)} € en combustible` : "Apunta lo que echas y mira cuánto gastas al mes"}</span>
            </span>
            <span className="link-btn">{monthSpend != null ? "Ver" : "Empezar"}</span>
          </Link>
        )}

        {best && <InstallHint />}

        {view && view.others.length > 0 && (
          <>
            <div className="row-between baseline">
              <h2 className="h2">Otras cerca</h2>
              {view.avg != null && <span className="muted b13">Media zona {fmtPrice(view.avg)} €</span>}
            </div>
            <div className="stack-8">
              {view.others.map((s) => (
                <StationRow key={s.id} s={s} fuel={fuel} avg={view.avg} />
              ))}
            </div>
            <Link href="/mapa" className="btn soft">
              <Icon name="map" size={18} /> Ver las {view.count} en el mapa
            </Link>
          </>
        )}

        {data && (
          <p className="source">
            Precios oficiales del Ministerio (Geoportal de Gasolineras), se actualizan cada media hora. Distancias en línea recta.{" "}
            <Link href="/gasolineras" className="green">
              Precios por provincia y municipio
            </Link>
            {" · "}
            <Link href="/privacidad">Fuentes y privacidad</Link>
            {" · "}
            <Link href="/instalar">Instalar la app y avisos</Link>
          </p>
        )}
      </div>

      {desktop && (
        <div className="split-map">
          <MapScreen embedded="fuel" />
        </div>
      )}

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
