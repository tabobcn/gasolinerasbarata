"use client";

import { useSyncExternalStore } from "react";
import type { FuelKey } from "./fuels";

/** Pequeño almacén persistente en localStorage (por dispositivo), con sincronización entre pestañas. */
type Store<T> = {
  get: () => T;
  getServer: () => T;
  set: (v: T | ((prev: T) => T)) => void;
  subscribe: (l: () => void) => () => void;
};

export function createPersisted<T>(key: string, initial: T, merge = false): Store<T> {
  let state = initial;
  let loaded = false;
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw) as T;
        state = merge ? { ...initial, ...parsed } : parsed;
      }
    } catch {
      /* almacenamiento no disponible: seguimos en memoria */
    }
  };
  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    read();
    window.addEventListener("storage", (e) => {
      if (e.key === key) {
        read();
        listeners.forEach((l) => l());
      }
    });
  };
  return {
    get: () => {
      load();
      return state;
    },
    getServer: () => initial,
    set: (v) => {
      load();
      state = typeof v === "function" ? (v as (p: T) => T)(state) : v;
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {
        /* ignorar */
      }
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function usePersisted<T>(store: Store<T>): [T, Store<T>["set"]] {
  const v = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  return [v, store.set];
}

// ---------- Datos de la app ----------

export type CarType = "gas" | "diesel" | "phev" | "ev";
export type NavApp = "maps" | "waze";

export type Settings = {
  carType: CarType;
  fuels: FuelKey[]; // combustibles que usa
  fuel: FuelKey; // el seleccionado ahora
  tank: number; // litros
  battery: number; // kWh
  ac: number; // kW
  dc: number; // kW (0 = no tiene)
  plugs: string[];
  navApp: NavApp | null; // recordar app para ir
  radius: number; // km
};

export const DEFAULT_SETTINGS: Settings = {
  carType: "gas",
  fuels: ["goa", "g95", "g98", "glp"],
  fuel: "g95",
  tank: 45,
  battery: 13,
  ac: 11,
  dc: 0,
  plugs: ["t2"],
  navApp: null,
  radius: 5,
};

export type Favorite = { id: string; m: string; name: string; brand: string };

export type SavedPlace = {
  id: string;
  kind: "casa" | "trabajo" | "otro";
  label: string; // "Casa"
  detail: string; // "Cornellà de Llobregat"
  lat: number;
  lon: number;
};

export type PriceAlert = {
  id: string;
  fuel: FuelKey;
  zone: string; // id de SavedPlace o "yo"
  radius: number;
  threshold: number; // €/l
  favDrop: boolean; // avisar si una favorita baja ≥ 3 cts
  createdAt: string;
  lastNotifiedKey?: string;
};

export type LastLocation = { lat: number; lon: number; label: string | null; at: number };

export const settingsStore = createPersisted<Settings>("gc.settings", DEFAULT_SETTINGS, true);
export const favoritesStore = createPersisted<Favorite[]>("gc.favorites", []);
export const placesStore = createPersisted<SavedPlace[]>("gc.places", []);
export const alertsStore = createPersisted<PriceAlert[]>("gc.alerts", []);
export const lastLocationStore = createPersisted<LastLocation | null>("gc.lastLocation", null);

export const useSettings = () => usePersisted(settingsStore);
export const useFavorites = () => usePersisted(favoritesStore);
export const usePlaces = () => usePersisted(placesStore);
export const useAlerts = () => usePersisted(alertsStore);

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
