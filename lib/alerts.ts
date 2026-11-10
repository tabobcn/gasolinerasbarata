"use client";

import { useEffect, useState } from "react";
import { fuelByKey } from "./fuels";
import { fmtKm, fmtPrice, madridDate } from "./format";
import { getJSON, stationsUrl } from "./useJSON";
import { alertsStore, createPersisted, favoritesStore, placesStore, type PriceAlert, type SavedPlace } from "./store";
import type { Prices, Station, StationsResponse } from "./types";
import { discountsStore } from "./discountStore";
import { applyDiscounts } from "./discounts";
import { pushStore } from "./push";

export type AlertMatch = {
  key: string;
  title: string;
  body: string;
  station: Station;
  alertId?: string;
};

export type AlertState = {
  alert: PriceAlert;
  zoneLabel: string;
  cheapest: Station | null;
  cheapestPrice: number | null;
  count: number;
  hit: boolean;
};

export function zoneOf(alert: PriceAlert, places: SavedPlace[], here: { lat: number; lon: number } | null) {
  if (alert.zone === "yo") return here ? { lat: here.lat, lon: here.lon, label: "ti" } : null;
  const p = places.find((x) => x.id === alert.zone);
  return p ? { lat: p.lat, lon: p.lon, label: p.label.toLowerCase() } : null;
}

export async function evaluateAlert(alert: PriceAlert, places: SavedPlace[], here: { lat: number; lon: number } | null): Promise<AlertState | null> {
  const z = zoneOf(alert, places, here);
  if (!z) return null;
  const data = await getJSON<StationsResponse>(stationsUrl(z.lat, z.lon, alert.radius));
  const withFuel = applyDiscounts(data.stations, discountsStore.get()).filter((s) => s.prices[alert.fuel] != null);
  const cheapest = withFuel.sort((a, b) => a.prices[alert.fuel]! - b.prices[alert.fuel]!)[0] ?? null;
  const price = cheapest?.prices[alert.fuel] ?? null;
  return {
    alert,
    zoneLabel: z.label,
    cheapest,
    cheapestPrice: price,
    count: withFuel.length,
    hit: price != null && price < alert.threshold - 0.00001,
  };
}

/** Avisos de "tu favorita ha bajado" ya enviados (para no repetirlos) */
const favNotified = createPersisted<string[]>("gc.favNotified", []);

function notify(m: AlertMatch) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // Con los avisos push activados ya avisa el servidor (así no llega el mismo aviso dos veces)
    if (pushStore.get().on) return;
    const url = `/gasolinera/${m.station.id}?m=${m.station.munId}`;
    if (navigator.serviceWorker?.controller || navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.showNotification(m.title, { body: m.body, tag: m.key, data: { url }, icon: "/pwa-icon/192?v=2" });
        else new Notification(m.title, { body: m.body, tag: m.key });
      });
    } else {
      new Notification(m.title, { body: m.body, tag: m.key });
    }
  } catch {
    /* sin notificaciones en este navegador */
  }
}

/** Comprueba las alertas guardadas (al abrir la app) y devuelve las que se cumplen. */
export function useAlertMatches(here: { lat: number; lon: number } | null) {
  const [matches, setMatches] = useState<AlertMatch[]>([]);
  const hereKey = here ? `${here.lat.toFixed(2)},${here.lon.toFixed(2)}` : "";

  useEffect(() => {
    const alerts = alertsStore.get();
    const places = placesStore.get();
    if (!alerts.length) {
      setMatches([]);
      return;
    }
    let alive = true;
    (async () => {
      const out: AlertMatch[] = [];
      const today = madridDate();
      for (const a of alerts) {
        const st = await evaluateAlert(a, places, here).catch(() => null);
        if (!alive) return; // ha cambiado la ubicación: esta comprobación ya no vale
        if (st?.hit && st.cheapest && st.cheapestPrice != null) {
          const f = fuelByKey(a.fuel)?.label ?? "";
          const key = `${today}:${a.id}:${st.cheapest.id}:${st.cheapestPrice}`;
          out.push({
            key,
            alertId: a.id,
            station: st.cheapest,
            title: `${f} a ${fmtPrice(st.cheapestPrice)} € cerca de ${st.zoneLabel}`,
            body: `${st.cheapest.name}${st.cheapest.dist != null ? ` · a ${fmtKm(st.cheapest.dist)}` : ""} · toca para ir`,
          });
          if (a.lastNotifiedKey !== key) {
            notify(out[out.length - 1]);
            alertsStore.set((list) => list.map((x) => (x.id === a.id ? { ...x, lastNotifiedKey: key } : x)));
          }
        }
      }
      // Favoritas que bajan 3 cts o más respecto a ayer
      const wantsFav = alerts.filter((a) => a.favDrop);
      const favs = favoritesStore.get();
      if (wantsFav.length && favs.length) {
        const items = favs.map((f) => `${f.id}:${f.m}`).join(",");
        const res = await getJSON<{ items: { station: Station; yesterday: Prices | null }[] }>(`/api/stations/lookup?items=${items}`).catch(() => null);
        if (!alive) return;
        const fuels = [...new Set(wantsFav.map((a) => a.fuel))];
        const sent = favNotified.get();
        const newlySent: string[] = [];
        for (const it of res?.items ?? []) {
          for (const fuel of fuels) {
            const now = it.station.prices[fuel];
            const before = it.yesterday?.[fuel];
            if (now != null && before != null && before - now >= 0.03) {
              const m: AlertMatch = {
                key: `${today}:fav:${it.station.id}:${fuel}`,
                station: it.station,
                title: `${it.station.name} ha bajado ${Math.round((before - now) * 100)} cts`,
                body: `${fuelByKey(fuel)?.label} a ${fmtPrice(now)} € (ayer ${fmtPrice(before)} €)`,
              };
              out.push(m);
              if (!sent.includes(m.key)) {
                notify(m);
                newlySent.push(m.key);
              }
            }
          }
        }
        if (newlySent.length) favNotified.set((l) => [...l, ...newlySent].slice(-50));
      }
      if (alive) setMatches(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereKey]);

  return matches;
}
