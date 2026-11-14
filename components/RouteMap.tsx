"use client";

import { useEffect, useRef, useState } from "react";
import type * as ML from "maplibre-gl";
import type { FuelKey } from "@/lib/fuels";
import type { RouteStop } from "@/lib/types";
import { fmtPrice } from "@/lib/format";
import { paidPrice } from "@/lib/discounts";

const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/positron";

/** Mapa de la ruta: la línea del viaje y las paradas. Las mejores de cada tramo llevan el precio; el resto son puntos. */
export function RouteMap({ line, stops, fuel, selected, onSelect }: { line: [number, number][]; stops: RouteStop[]; fuel: FuelKey; selected: string | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ML.Map | null>(null);
  const libRef = useRef<typeof ML | null>(null);
  const markers = useRef<ML.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const pick = useRef(onSelect);
  pick.current = onSelect;

  // Crear el mapa una vez
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("maplibre-gl");
      const lib = ((mod as unknown as { default?: typeof ML }).default ?? mod) as typeof ML;
      lib.setWorkerUrl(`/maplibre/maplibre-gl-worker.mjs?v=${lib.getVersion()}`);
      if (cancelled || !el.current || mapRef.current) return;
      libRef.current = lib;
      const map = new lib.Map({ container: el.current, style: MAP_STYLE, center: [-3.7, 40.4], zoom: 5, attributionControl: false, dragRotate: false, pitchWithRotate: false });
      map.touchZoomRotate.disableRotation();
      map.addControl(new lib.AttributionControl({ compact: true }), "top-right");
      map.on("load", () => el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Línea de la ruta y encuadre
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib || line.length < 2) return;
    const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } };
    const draw = () => {
      const src = map.getSource("ruta") as ML.GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        map.addSource("ruta", { type: "geojson", data });
        map.addLayer({ id: "ruta-borde", type: "line", source: "ruta", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 7 } });
        map.addLayer({ id: "ruta", type: "line", source: "ruta", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1F4FD1", "line-width": 4 } });
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    const b = new lib.LngLatBounds(line[0], line[0]);
    line.forEach((c) => b.extend(c));
    map.resize();
    map.fitBounds(b, { padding: { top: 44, bottom: 20, left: 28, right: 28 }, duration: 0 });
  }, [ready, line]);

  // Paradas
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const dot = (cls: string, c: [number, number]) => {
      const d = document.createElement("span");
      d.className = cls;
      markers.current.push(new lib.Marker({ element: d, anchor: "center" }).setLngLat(c).addTo(map));
    };
    if (line.length > 1) {
      dot("route-end start", line[0]);
      dot("route-end", line[line.length - 1]);
    }
    // primero los puntos, luego las etiquetas y al final la mejor y la elegida, para que queden encima
    const rank = (s: RouteStop) => (s.station.id === selected ? 3 : s.bestOverall ? 2 : s.bestInSeg ? 1 : 0);
    for (const s of [...stops].sort((a, b) => rank(a) - rank(b))) {
      const on = s.station.id === selected;
      const big = on || s.bestInSeg || s.bestOverall;
      const wrap = document.createElement("div");
      const node = document.createElement("button");
      wrap.appendChild(node);
      node.type = "button";
      const price = paidPrice(s.station, fuel) ?? s.station.prices[fuel];
      node.setAttribute("aria-label", `${s.station.name}, ${fmtPrice(price)} euros, kilómetro ${s.kmAlong}`);
      if (big) {
        node.className = `pin${on ? " on" : ""}`;
        node.innerHTML = `<span class="pin-pill route${s.bestOverall && !on ? " top" : ""}"><span class="pin-price">${fmtPrice(price)}</span></span><span class="pin-tip"></span>`;
      } else {
        node.className = "pin-dot";
        node.style.background = "#5B6675";
      }
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        pick.current(s.station.id);
      });
      markers.current.push(new lib.Marker({ element: wrap, anchor: big ? "bottom" : "center" }).setLngLat([s.station.lon, s.station.lat]).addTo(map));
    }
  }, [ready, stops, fuel, selected, line]);

  return <div ref={el} className="route-map" aria-label="Mapa de la ruta con las gasolineras" />;
}
