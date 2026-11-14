"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as ML from "maplibre-gl";
import { useLocation } from "../LocationProvider";
import { useNavigate } from "../NavigateProvider";
import { PlaceSearch } from "../PlaceSearch";
import { stationHref } from "../StationRow";
import { BottomNav, BrandTile, Sheet } from "../ui";
import { ChargerTile } from "../ChargerBits";
import { Icon, LocateIcon } from "../Icon";
import { settingsStore, useFavorites, useMode, useSettings, useShows } from "@/lib/store";
import { brandVisible } from "@/lib/brands";
import { r3, stationsUrl, useJSON } from "@/lib/useJSON";
import type { Station, StationsResponse } from "@/lib/types";
import { average, levelFor } from "@/lib/savings";
import { fmtKm, fmtPrice } from "@/lib/format";
import { FUELS, fuelByKey } from "@/lib/fuels";
import { openStatus } from "@/lib/hours";
import { brandStyle } from "@/lib/brands";
import { haversineKm } from "@/lib/geo";
import { useDiscounts } from "@/lib/discountStore";
import { activeCount, applyDiscounts, discText, paidPrice } from "@/lib/discounts";
import { availText, carFrom, chargerHref, chargerName, cpoStyle, displayGroup, EV_KWH_100KM, summarize, type Car, type ChargersResponse, type Summary } from "@/lib/chargers";

const RADII = [2, 5, 10, 20];
const FALLBACK = { lat: 40.4168, lon: -3.7038 }; // Puerta del Sol

/** Mapa base gratuito y sin clave (OpenFreeMap, datos de OpenStreetMap). Se puede cambiar con NEXT_PUBLIC_MAP_STYLE. */
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/positron";

const euro = (n: number) => n.toFixed(2).replace(".", ",");
const BOLT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`;

/** Precio que enseñamos de un punto de recarga: el del enchufe que le va a tu coche */
function chargerPrice(s: Summary, car: Car): number | null {
  return displayGroup(s, car)?.price ?? null;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** embedded: mapa metido al lado de la lista (ordenador). Sigue la zona de la lista y no lleva barra ni buscador propios. */
export function MapScreen({ embedded }: { embedded?: "fuel" | "charge" } = {}) {
  const { loc, gps, locate, setPlace } = useLocation();
  const [settings, setSettings] = useSettings();
  const fuel = settings.fuel;
  const goTo = useNavigate();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ML.Map | null>(null);
  const libRef = useRef<typeof ML | null>(null);
  const markersRef = useRef<ML.Marker[]>([]);
  const meRef = useRef<ML.Marker | null>(null);
  const [compact, setCompact] = useState(false); // con el mapa alejado, puntos en vez de etiquetas
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null); // centro de la consulta
  const [moved, setMoved] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [sheet, setSheet] = useState<null | "search" | "fuel">(null);
  const [ready, setReady] = useState(false);
  // Gasolineras o cargadores (nunca mezclados). Recuerda el último modo usado.
  const [storeMode, setMode] = useMode();
  const shows = useShows();
  const [favs] = useFavorites();
  const favIds = favs.map((f) => f.id).join(",");
  const mode = embedded ?? storeMode;
  const car = carFrom(settings);
  const [onlyCompat, setOnlyCompat] = useState(true);
  const [onlyWorking, setOnlyWorking] = useState(false);
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("modo");
    if (m === "carga") setMode("charge");
    else if (m === "combustible") setMode("fuel");
  }, [setMode]);
  const switchMode = (m: "fuel" | "charge") => {
    setMode(m);
    setSel(null);
  };

  // Centro inicial: ?lat&lon (desde la ficha) o la ubicación actual
  useEffect(() => {
    if (center) return;
    const sp = new URLSearchParams(window.location.search);
    const lat = Number(sp.get("lat"));
    const lon = Number(sp.get("lon"));
    if (sp.has("lat") && Number.isFinite(lat) && Number.isFinite(lon)) {
      setCenter({ lat, lon });
      setSel(sp.get("sel"));
    } else if (loc) setCenter({ lat: loc.lat, lon: loc.lon });
  }, [loc, center]);

  // Al lado de la lista, el mapa se mueve cuando cambia la zona buscada
  const locLat = loc?.lat;
  const locLon = loc?.lon;
  useEffect(() => {
    if (!embedded || locLat == null || locLon == null) return;
    setCenter((c) => (c && c.lat === locLat && c.lon === locLon ? c : { lat: locLat, lon: locLon }));
    setSel(null);
    mapRef.current?.jumpTo({ center: [locLon, locLat] });
  }, [embedded, locLat, locLon]);

  const { data, loading } = useJSON<StationsResponse>(center && mode === "fuel" ? stationsUrl(center.lat, center.lon, settings.radius) : null);
  const chRes = useJSON<ChargersResponse>(center && mode === "charge" ? `/api/chargers?lat=${r3(center.lat)}&lon=${r3(center.lon)}&radius=${settings.radius}` : null);

  const [disc, setDisc] = useDiscounts();
  const stations = useMemo(() => {
    if (mode !== "fuel") return [];
    const visible = brandVisible(settings.hiddenBrands, settings.onlyBrands);
    const list = applyDiscounts(data?.stations ?? [], disc).filter((s) => s.prices[fuel] != null && visible(s.brand));
    return openOnly ? list.filter((s) => openStatus(s.hours, s.provId).open !== false) : list;
  }, [data, fuel, openOnly, disc, mode, settings.hiddenBrands, settings.onlyBrands]);
  const avg = useMemo(() => average(stations, fuel), [stations, fuel]);
  const cheapestId = useMemo(() => [...stations].sort((a, b) => a.prices[fuel]! - b.prices[fuel]!)[0]?.id, [stations, fuel]);
  const selected: Station | undefined = stations.find((s) => s.id === sel) ?? stations.find((s) => s.id === cheapestId);

  // ----- Modo carga -----
  const carKey = `${car.electric}|${car.plugs.join(",")}|${car.ac}|${car.dc}|${car.battery}`;
  const chargers = useMemo(() => {
    if (mode !== "charge" || !chRes.data) return [];
    const now = Date.now();
    let list = chRes.data.items.map((c) => summarize(c, car, now));
    if (car.electric && onlyCompat) list = list.filter((x) => x.compatible);
    if (onlyWorking) list = list.filter((x) => !x.allDown);
    return list;
  }, [chRes.data, mode, carKey, onlyCompat, onlyWorking]); // eslint-disable-line react-hooks/exhaustive-deps
  const bestChId = useMemo(() => {
    const ok = chargers.filter((x) => x.best && !x.allDown && x.best.fill.cost != null && !x.best.doubtful && (!car.electric || x.compatible));
    const score = (x: Summary) => x.best!.fill.cost! + (x.ch.dist ?? 0) * 2 * (EV_KWH_100KM / 100) * (x.best!.price ?? 0.4);
    return (car.electric ? ok.sort((a, b) => score(a) - score(b))[0] : undefined)?.ch.id ?? chargers[0]?.ch.id;
  }, [chargers, car.electric]);
  const selCh: Summary | undefined = chargers.find((x) => x.ch.id === sel) ?? chargers.find((x) => x.ch.id === bestChId);

  // Crear el mapa
  useEffect(() => {
    if (!center || mapRef.current || !el.current) return;
    let cancelled = false;
    (async () => {
      const mod = await import("maplibre-gl");
      const lib = ((mod as unknown as { default?: typeof ML }).default ?? mod) as typeof ML;
      lib.setWorkerUrl(`/maplibre/maplibre-gl-worker.mjs?v=${lib.getVersion()}`);
      if (cancelled || !el.current || mapRef.current) return;
      libRef.current = lib;
      const map = new lib.Map({
        container: el.current,
        style: MAP_STYLE,
        center: [center.lon, center.lat],
        zoom: 13,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new lib.AttributionControl({ compact: true }), "top-right");
      // Solo se repintan los pines al cruzar el umbral, no en cada cambio de zoom
      map.on("zoomend", () => setCompact(map.getZoom() < 12.5));
      map.on("moveend", () => setMoved(true));
      map.on("load", () => {
        // atribución plegada en el botón "i" para no tapar el mapa en el móvil
        el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      });
      mapRef.current = map;
      // Los pines con los precios no esperan a que se descargue el dibujo del mapa (en móviles lentos tarda)
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [center]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  // ¿Se ha movido lo bastante como para ofrecer "Buscar en esta zona"?
  const [farAway, setFarAway] = useState(false);
  useEffect(() => {
    if (!moved || !mapRef.current || !center) return;
    const c = mapRef.current.getCenter();
    setFarAway(haversineKm(c.lat, c.lng, center.lat, center.lon) > settings.radius * 0.45);
    setMoved(false);
  }, [moved, center, settings.radius]);

  // Pintar marcadores
  useEffect(() => {
    const lib = libRef.current;
    const map = mapRef.current;
    if (!lib || !map || !ready) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (mode === "charge") {
      const selId = selCh?.ch.id;
      const ordered = [...chargers].sort((a, b) => (a.ch.id === selId ? 1 : 0) - (b.ch.id === selId ? 1 : 0));
      for (const x of ordered) {
        const price = chargerPrice(x, car);
        const on = x.ch.id === selId;
        const st = cpoStyle(x.ch.party, x.ch.operator);
        const off = (car.electric && !x.compatible) || x.allDown;
        const doubt = displayGroup(x, car)?.doubtful ?? false;
        const color = x.allDown ? "#B5341A" : off || doubt ? "#5B6675" : price != null ? "#1F4FD1" : "#5B6675";
        const wrap = document.createElement("div");
        const node = document.createElement("button");
        wrap.appendChild(node);
        node.type = "button";
        node.className = compact && !on ? "pin-dot" : `pin ev${on ? " on" : ""}${off ? " off" : ""}`;
        node.setAttribute("aria-label", `${chargerName(x.ch)}, ${price != null ? `${euro(price)} euros el kWh` : "precio no disponible"}`);
        if (compact && !on) {
          node.style.background = color;
        } else {
          node.innerHTML = `<span class="pin-pill">
              <span class="pin-tile" style="background:${st.bg};color:${st.fg}">${esc(st.mark)}</span>
              <span class="pin-price" style="${on ? "" : `color:${color}`}">${price != null ? euro(price) : BOLT}</span>
            </span><span class="pin-tip"></span>`;
        }
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          setSel(x.ch.id);
        });
        const m = new lib.Marker({ element: wrap, anchor: compact && !on ? "center" : "bottom" }).setLngLat([x.ch.lon, x.ch.lat]).addTo(map);
        markersRef.current.push(m);
      }
      return;
    }
    // primero las caras y al final las baratas y la seleccionada, para que queden encima
    const ordered = [...stations].sort((a, b) => b.prices[fuel]! - a.prices[fuel]!);
    const selId = selected?.id;
    ordered.sort((a, b) => (a.id === selId ? 1 : 0) - (b.id === selId ? 1 : 0));
    for (const s of ordered) {
      const p = s.prices[fuel]!;
      const lv = levelFor(p, avg);
      const on = s.id === selId;
      const fav = favIds.split(",").includes(s.id);
      const b = brandStyle(s.brand);
      const wrap = document.createElement("div");
      const node = document.createElement("button");
      wrap.appendChild(node);
      node.type = "button";
      node.className = compact && !on ? `pin-dot${fav ? " fav" : ""}` : `pin${on ? " on" : ""}`;
      const shown = paidPrice(s, fuel) ?? p; // con descuento en saldo se enseña lo que se paga
      node.setAttribute("aria-label", `${s.name}, ${fmtPrice(shown)} euros${fav ? ", favorita" : ""}`);
      if (compact && !on) {
        node.style.background = lv.color;
      } else {
        node.innerHTML = `<span class="pin-pill">
            ${
              b.logo
                ? `<span class="pin-tile logo"><img src="${b.logo}" alt="" loading="lazy" decoding="async"></span>`
                : `<span class="pin-tile" style="background:${b.bg};color:${b.fg};${b.stripe ? `box-shadow:inset 0 -4px 0 ${b.stripe}` : ""}">${esc(b.mark)}</span>`
            }
            <span class="pin-price" style="${on ? "" : `color:${lv.color}`}">${fmtPrice(shown)}</span>${fav ? `<span class="pin-star" aria-hidden="true">★</span>` : ""}
          </span><span class="pin-tip"></span>`;
      }
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        setSel(s.id);
      });
      const m = new lib.Marker({ element: wrap, anchor: compact && !on ? "center" : "bottom" }).setLngLat([s.lon, s.lat]).addTo(map);
      markersRef.current.push(m);
    }
  }, [stations, fuel, avg, selected?.id, compact, ready, mode, chargers, selCh?.ch.id, favIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mi posición
  useEffect(() => {
    const lib = libRef.current;
    const map = mapRef.current;
    if (!lib || !map || !ready) return;
    meRef.current?.remove();
    meRef.current = null;
    if (!gps) return;
    const wrap = document.createElement("div");
    const node = document.createElement("span");
    wrap.appendChild(node);
    node.className = "me-dot";
    wrap.setAttribute("aria-hidden", "true");
    meRef.current = new lib.Marker({ element: wrap, anchor: "center" }).setLngLat([gps.lon, gps.lat]).addTo(map);
  }, [gps, ready]);

  const searchHere = () => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    setCenter({ lat: c.lat, lon: c.lng });
    setSel(null);
    setFarAway(false);
    if (embedded) setPlace({ lat: c.lat, lon: c.lng, label: "Zona del mapa" }); // la lista de al lado busca en el mismo sitio
  };

  const recenter = useCallback(() => {
    if (gps) {
      mapRef.current?.easeTo({ center: [gps.lon, gps.lat], zoom: 15 });
      setCenter({ lat: gps.lat, lon: gps.lon });
      setSel(null);
    } else locate();
  }, [gps, locate]);

  // Cuando llega el GPS por primera vez sin centro de URL
  useEffect(() => {
    if (gps && mapRef.current && loc?.source === "gps" && !new URLSearchParams(window.location.search).has("lat")) {
      mapRef.current.jumpTo({ center: [gps.lon, gps.lat] });
      setCenter((c) => (c && haversineKm(c.lat, c.lon, gps.lat, gps.lon) < 0.3 ? c : { lat: gps.lat, lon: gps.lon }));
    }
  }, [gps, loc?.source]);

  const selPrice = selected?.prices[fuel];
  const selLv = selPrice != null ? levelFor(selPrice, avg) : null;
  const selDist = selected && gps ? haversineKm(gps.lat, gps.lon, selected.lat, selected.lon) : selected?.dist;
  const chDist = selCh && gps ? haversineKm(gps.lat, gps.lon, selCh.ch.lat, selCh.ch.lon) : selCh?.ch.dist;
  const chPrice = selCh ? chargerPrice(selCh, car) : null;
  const chDoubt = selCh ? displayGroup(selCh, car)?.doubtful ?? false : false;
  const chCost = selCh && car.electric && !chDoubt ? selCh.best?.fill.cost ?? null : null;
  const chAvail = selCh ? availText(selCh.avail) : null;
  const showCard = mode === "fuel" ? !!(selected && selPrice != null && selLv) : !!selCh;

  return (
    <div className={`map-screen${embedded ? " embedded" : ""}`}>
      <div ref={el} className="map" aria-label={mode === "fuel" ? "Mapa de gasolineras" : "Mapa de puntos de recarga"} />
      {!center && (
        <div className="map-empty">
          <p className="b15">Activa la ubicación o busca un sitio</p>
          <div className="row-8">
            <button type="button" className="btn primary" onClick={locate}>
              Usar mi ubicación
            </button>
            <button type="button" className="btn soft" onClick={() => setCenter(FALLBACK)}>
              Ver Madrid
            </button>
          </div>
        </div>
      )}

      <div className="map-top">
        {shows.fuel && shows.charge && (
        <div role="tablist" aria-label="Qué ver en el mapa" className="mode-tabs floating">
          <button type="button" role="tab" aria-selected={mode === "fuel"} className={mode === "fuel" ? "on" : undefined} onClick={() => switchMode("fuel")}>
            <Icon name="pump" size={16} stroke={2.4} color={mode === "fuel" ? "#0B7A43" : "currentColor"} />
            Gasolineras
          </button>
          <button type="button" role="tab" aria-selected={mode === "charge"} className={mode === "charge" ? "on" : undefined} onClick={() => switchMode("charge")}>
            <Icon name="bolt" size={16} stroke={mode === "charge" ? 1.6 : 2.2} fill={mode === "charge" ? "#1F4FD1" : "none"} color={mode === "charge" ? "#1F4FD1" : "currentColor"} />
            Cargadores
          </button>
        </div>
        )}
        <button type="button" className="search-box as-button" onClick={() => setSheet("search")}>
          <Icon name="search" size={20} color="#5B6675" />
          <span className="muted b15">Buscar zona o dirección</span>
        </button>
        {mode === "charge" ? (
          <div className="chips scroll-x">
            {car.electric ? (
              <button type="button" className={`chip shadow${onlyCompat ? " on" : ""}`} aria-pressed={onlyCompat} onClick={() => setOnlyCompat((v) => !v)}>
                Compatibles con mi coche
              </button>
            ) : (
              <Link href="/mi-coche" className="chip shadow">
                <Icon name="car" size={14} stroke={2.4} /> Mi coche
              </Link>
            )}
            <button type="button" className={`chip shadow${onlyWorking ? " on" : ""}`} aria-pressed={onlyWorking} onClick={() => setOnlyWorking((v) => !v)}>
              Que funcionan
            </button>
            <button
              type="button"
              className="chip shadow"
              onClick={() => settingsStore.set((s) => ({ ...s, radius: RADII[(RADII.indexOf(s.radius) + 1) % RADII.length] ?? 5 }))}
              aria-label={`Radio ${settings.radius} km, toca para cambiar`}
            >
              {settings.radius} km
            </button>
          </div>
        ) : (
        <div className="chips scroll-x">
          <button type="button" className="chip on shadow" onClick={() => setSheet("fuel")}>
            {fuelByKey(fuel)?.chip}
            <Icon name="chevronDown" size={14} stroke={2.6} />
          </button>
          <button type="button" className={`chip shadow${openOnly ? " on" : ""}`} aria-pressed={openOnly} onClick={() => setOpenOnly((o) => !o)}>
            Abiertas ahora
          </button>
          <button
            type="button"
            className="chip shadow"
            onClick={() => settingsStore.set((s) => ({ ...s, radius: RADII[(RADII.indexOf(s.radius) + 1) % RADII.length] ?? 5 }))}
            aria-label={`Radio ${settings.radius} km, toca para cambiar`}
          >
            {settings.radius} km
          </button>
          {activeCount(disc) > 0 && (
            <button type="button" className={`chip shadow${disc.enabled ? " on" : ""}`} aria-pressed={disc.enabled} onClick={() => setDisc((s) => ({ ...s, enabled: !s.enabled }))}>
              Con mis descuentos
            </button>
          )}
        </div>
        )}
        {farAway && (
          <button type="button" className="btn dark small center-self" onClick={searchHere}>
            <Icon name="search" size={16} /> Buscar en esta zona
          </button>
        )}
        {(loading || chRes.loading) && <span className="loading-pill">{mode === "fuel" ? "Cargando precios…" : "Cargando cargadores…"}</span>}
      </div>

      {mode === "fuel" && stations.length > 0 && !embedded && (
        <div className="map-legend" style={{ bottom: showCard ? 300 : 104 }} aria-label="Colores de los precios frente a la media de la zona">
          <span><i style={{ background: "#0B7A43" }} />Barato</span>
          <span><i style={{ background: "#8A4F00" }} />En la media</span>
          <span><i style={{ background: "#B5341A" }} />Caro</span>
        </div>
      )}
      <div className="map-side" style={embedded ? { bottom: 24 } : { bottom: showCard ? 300 : 104 }}>
        {gps && (
          <span className="gps-chip">
            <span className="dot" aria-hidden="true" />
            GPS · ±{Math.round(gps.accuracy)} m
          </span>
        )}
        <button type="button" aria-label="Centrar en mi ubicación" className="fab" onClick={recenter}>
          <LocateIcon />
        </button>
      </div>

      {mode === "fuel" && selected && selPrice != null && selLv && (
        <div className="map-card">
          <span aria-hidden="true" className="sheet-grip" />
          <div className="row-12">
            <BrandTile brand={selected.brand} size={44} />
            <div className="col-2 grow min0">
              <span className="b16 ellipsis">{selected.name}</span>
              <span className="muted sm ellipsis">
                {fmtKm(selDist)} · {openStatus(selected.hours, selected.provId).label}
              </span>
            </div>
            <div className="col-2 end">
              {selected.disc && selected.disc.kind !== "saldo" && selected.listPrices?.[fuel] != null && <span className="strike b12">{fmtPrice(selected.listPrices[fuel])} €</span>}
              <span className="price-lg" style={{ color: selLv.color }}>
                {fmtPrice(paidPrice(selected, fuel) ?? selPrice)} €
              </span>
              <span className="b12" style={{ color: selLv.color }}>
                {selected.id === cheapestId ? "La más barata" : selLv.label}
                {selected.disc ? ` · ${selected.disc.label} ${discText(selected.disc)}` : ""}
              </span>
            </div>
          </div>
          <span className="muted b12 ellipsis">{selected.address}</span>
          <div className="row-10">
            <button type="button" className="btn primary grow h52" onClick={() => goTo({ ...selected, dist: selDist })}>
              <Icon name="navigate" size={18} stroke={2.4} /> Ir
            </button>
            <Link href={stationHref(selected)} className="btn soft grow h52">
              Ver precios
            </Link>
          </div>
        </div>
      )}

      {mode === "charge" && selCh && chAvail && (
        <div className="map-card">
          <span aria-hidden="true" className="sheet-grip" />
          <div className="row-12">
            <ChargerTile ch={selCh.ch} size={44} />
            <div className="col-2 grow min0">
              <span className="b16 ellipsis">{chargerName(selCh.ch)}</span>
              <span className="muted sm ellipsis">
                {fmtKm(chDist)} · {selCh.plugs}
              </span>
            </div>
            <div className="col-2 end">
              <span className={`price-lg${chPrice != null ? " blue-ink" : " muted"}`}>{chPrice != null ? `${euro(chPrice)} €` : "—"}</span>
              <span className="b12 muted nowrap">{chDoubt ? "a confirmar" : chCost != null ? `${euro(chCost)} € lleno` : chPrice != null ? "por kWh" : "sin precio"}</span>
            </div>
          </div>
          <span className={`b12 tone-${car.electric && !selCh.compatible ? "muted" : chAvail.tone}`}>
            {selCh.ch.id === bestChId && car.electric ? "El mejor para tu coche · " : ""}
            {car.electric && !selCh.compatible ? "No compatible con tu coche" : chAvail.text}
          </span>
          <div className="row-10">
            <button
              type="button"
              className="btn primary grow h52"
              onClick={() =>
                goTo({ lat: selCh.ch.lat, lon: selCh.ch.lon, dist: chDist, name: chargerName(selCh.ch), address: selCh.ch.address ?? "", brand: cpoStyle(selCh.ch.party, selCh.ch.operator).name })
              }
            >
              <Icon name="navigate" size={18} stroke={2.4} /> Ir
            </button>
            <Link href={chargerHref(selCh.ch)} className="btn soft grow h52">
              Ver ficha
            </Link>
          </div>
        </div>
      )}

      <Sheet open={sheet === "search"} onClose={() => setSheet(null)} label="Buscar zona">
        <PlaceSearch
          autoFocus
          onUseGps={() => {
            setSheet(null);
            recenter();
          }}
          onPick={(p) => {
            setSheet(null);
            setPlace({ lat: p.lat, lon: p.lon, label: p.label });
            mapRef.current?.jumpTo({ center: [p.lon, p.lat], zoom: 14 });
            setCenter({ lat: p.lat, lon: p.lon });
            setSel(null);
          }}
        />
      </Sheet>

      <Sheet open={sheet === "fuel"} onClose={() => setSheet(null)} label="Elegir combustible">
        <div className="stack-12">
          <h2 className="h-sheet">Combustible</h2>
          <div className="chips wrap">
            {FUELS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`chip${f.key === fuel ? " on" : ""}`}
                aria-pressed={f.key === fuel}
                onClick={() => {
                  setSettings((s) => ({ ...s, fuel: f.key, fuels: s.fuels.includes(f.key) ? s.fuels : [...s.fuels, f.key] }));
                  setSheet(null);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      {!embedded && <BottomNav />}
    </div>
  );
}
