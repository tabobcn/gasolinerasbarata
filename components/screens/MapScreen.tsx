"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as ML from "maplibre-gl";
import { useLocation } from "../LocationProvider";
import { useNavigate } from "../NavigateProvider";
import { PlaceSearch } from "../PlaceSearch";
import { stationHref } from "../StationRow";
import { BottomNav, BrandTile, Sheet } from "../ui";
import { Icon, LocateIcon } from "../Icon";
import { settingsStore, useSettings } from "@/lib/store";
import { stationsUrl, useJSON } from "@/lib/useJSON";
import type { Station, StationsResponse } from "@/lib/types";
import { average, levelFor } from "@/lib/savings";
import { fmtKm, fmtPrice } from "@/lib/format";
import { FUELS, fuelByKey } from "@/lib/fuels";
import { openStatus } from "@/lib/hours";
import { brandStyle } from "@/lib/brands";
import { haversineKm } from "@/lib/geo";

const RADII = [2, 5, 10, 20];
const FALLBACK = { lat: 40.4168, lon: -3.7038 }; // Puerta del Sol

/** Mapa base gratuito y sin clave (OpenFreeMap, datos de OpenStreetMap). Se puede cambiar con NEXT_PUBLIC_MAP_STYLE. */
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/positron";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function MapScreen() {
  const { loc, gps, locate, setPlace } = useLocation();
  const [settings, setSettings] = useSettings();
  const fuel = settings.fuel;
  const goTo = useNavigate();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ML.Map | null>(null);
  const libRef = useRef<typeof ML | null>(null);
  const markersRef = useRef<ML.Marker[]>([]);
  const meRef = useRef<ML.Marker | null>(null);
  const [zoom, setZoom] = useState(13);
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null); // centro de la consulta
  const [moved, setMoved] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [sheet, setSheet] = useState<null | "search" | "fuel">(null);
  const [ready, setReady] = useState(false);

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

  const { data, loading } = useJSON<StationsResponse>(center ? stationsUrl(center.lat, center.lon, settings.radius) : null);

  const stations = useMemo(() => {
    const list = (data?.stations ?? []).filter((s) => s.prices[fuel] != null);
    return openOnly ? list.filter((s) => openStatus(s.hours, s.provId).open !== false) : list;
  }, [data, fuel, openOnly]);
  const avg = useMemo(() => average(stations, fuel), [stations, fuel]);
  const cheapestId = useMemo(() => [...stations].sort((a, b) => a.prices[fuel]! - b.prices[fuel]!)[0]?.id, [stations, fuel]);
  const selected: Station | undefined = stations.find((s) => s.id === sel) ?? stations.find((s) => s.id === cheapestId);

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
      map.on("zoomend", () => setZoom(map.getZoom()));
      map.on("moveend", () => setMoved(true));
      map.on("load", () => {
        // atribución plegada en el botón "i" para no tapar el mapa en el móvil
        el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        setReady(true);
      });
      mapRef.current = map;
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
    const compact = zoom < 12.5;
    // primero las caras y al final las baratas y la seleccionada, para que queden encima
    const ordered = [...stations].sort((a, b) => b.prices[fuel]! - a.prices[fuel]!);
    const selId = selected?.id;
    ordered.sort((a, b) => (a.id === selId ? 1 : 0) - (b.id === selId ? 1 : 0));
    for (const s of ordered) {
      const p = s.prices[fuel]!;
      const lv = levelFor(p, avg);
      const on = s.id === selId;
      const b = brandStyle(s.brand);
      const wrap = document.createElement("div");
      const node = document.createElement("button");
      wrap.appendChild(node);
      node.type = "button";
      node.className = compact && !on ? "pin-dot" : `pin${on ? " on" : ""}`;
      node.setAttribute("aria-label", `${s.name}, ${fmtPrice(p)} euros`);
      if (compact && !on) {
        node.style.background = lv.color;
      } else {
        node.innerHTML = `<span class="pin-pill">
            <span class="pin-tile" style="background:${b.bg};color:${b.fg};${b.stripe ? `box-shadow:inset 0 -4px 0 ${b.stripe}` : ""}">${esc(b.mark)}</span>
            <span class="pin-price" style="${on ? "" : `color:${lv.color}`}">${fmtPrice(p)}</span>
          </span><span class="pin-tip"></span>`;
      }
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        setSel(s.id);
      });
      const m = new lib.Marker({ element: wrap, anchor: compact && !on ? "center" : "bottom" }).setLngLat([s.lon, s.lat]).addTo(map);
      markersRef.current.push(m);
    }
  }, [stations, fuel, avg, selected?.id, zoom, ready]);

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
    }
  }, [gps, loc?.source]);

  const selPrice = selected?.prices[fuel];
  const selLv = selPrice != null ? levelFor(selPrice, avg) : null;
  const selDist = selected && gps ? haversineKm(gps.lat, gps.lon, selected.lat, selected.lon) : selected?.dist;

  return (
    <div className="map-screen">
      <div ref={el} className="map" aria-label="Mapa de gasolineras" />
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
        <button type="button" className="search-box as-button" onClick={() => setSheet("search")}>
          <Icon name="search" size={20} color="#5B6675" />
          <span className="muted b15">Buscar zona o dirección</span>
        </button>
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
        </div>
        {farAway && (
          <button type="button" className="btn dark small center-self" onClick={searchHere}>
            <Icon name="search" size={16} /> Buscar en esta zona
          </button>
        )}
        {loading && <span className="loading-pill">Cargando precios…</span>}
      </div>

      <div className="map-side" style={{ bottom: selected ? 300 : 104 }}>
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

      {selected && selPrice != null && selLv && (
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
              <span className="price-lg" style={{ color: selLv.color }}>
                {fmtPrice(selPrice)} €
              </span>
              <span className="b12" style={{ color: selLv.color }}>
                {selected.id === cheapestId ? "La más barata" : selLv.label}
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
                  setSettings((s) => ({ ...s, fuel: f.key }));
                  setSheet(null);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <BottomNav />
    </div>
  );
}
