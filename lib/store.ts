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

export type CarType = "gas" | "diesel" | "glp" | "phev" | "ev";
export type NavApp = "maps" | "waze";

export type Settings = {
  carName?: string; // nombre que le pone el usuario ("Cupra Formentor híbrido")
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
  configured?: boolean; // el usuario ya ha guardado su coche (bienvenida o "Mi coche")
  hiddenBrands?: string[]; // marcas donde no quiere repostar (claves de lib/brands)
  showAll?: boolean; // ver gasolineras y cargadores aunque su coche no use una de las dos cosas
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
  radius?: number; // km alrededor del sitio (5 si no se indica)
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

/** Repostaje apuntado por el usuario (se guarda solo en su navegador) */
export type Refuel = {
  id: string;
  date: string; // AAAA-MM-DD
  name: string; // gasolinera
  brand: string;
  stationId?: string;
  munId?: string;
  fuel: FuelKey;
  liters: number;
  price: number; // €/l
  total: number; // €
  km?: number; // cuentakilómetros (opcional, para el consumo)
};

export const settingsStore = createPersisted<Settings>("gc.settings", DEFAULT_SETTINGS, true);
export const favoritesStore = createPersisted<Favorite[]>("gc.favorites", []);
export const placesStore = createPersisted<SavedPlace[]>("gc.places", []);
export const alertsStore = createPersisted<PriceAlert[]>("gc.alerts", []);
export const lastLocationStore = createPersisted<LastLocation | null>("gc.lastLocation", null);

export const refuelsStore = createPersisted<Refuel[]>("gc.refuels", []);
export const useRefuels = () => usePersisted(refuelsStore);
export const useSettings = () => usePersisted(settingsStore);
export const useFavorites = () => usePersisted(favoritesStore);
export const usePlaces = () => usePersisted(placesStore);
export const useAlerts = () => usePersisted(alertsStore);

/** Gasolineras por las que ha pasado (para apuntar el repostaje sin buscar). Solo en su móvil. */
export type Visit = { id: string; m: string; name: string; brand: string; at: number; how: "ir" | "cerca" | "ficha" };
export const visitsStore = createPersisted<Visit[]>("gc.visits", []);
export const useVisits = () => usePersisted(visitsStore);
const HOW_RANK = { ficha: 0, ir: 1, cerca: 2 } as const;
export function recordVisit(v: Omit<Visit, "at">) {
  if (!v.id || !v.m) return;
  visitsStore.set((list) => {
    const prev = list.find((x) => x.id === v.id);
    // "estuviste al lado" o "fuiste" pesan más que haber mirado la ficha (durante 12 horas)
    const how = prev && Date.now() - prev.at < 12 * 3600e3 && HOW_RANK[prev.how] > HOW_RANK[v.how] ? prev.how : v.how;
    return [{ ...v, how, at: Date.now() }, ...list.filter((x) => x.id !== v.id)].slice(0, 15);
  });
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Último modo usado (gasolina o carga), para que el mapa abra en el mismo */
export type AppMode = "fuel" | "charge";
export const modeStore = createPersisted<AppMode>("gc.mode", "fuel");

/**
 * Qué enseña la app según el coche: un eléctrico no necesita gasolineras y un coche de combustión
 * no necesita cargadores. Mientras no se haya configurado el coche (o si lo pide en Ajustes) se ve todo.
 */
export function carShows(s: Pick<Settings, "carType" | "configured" | "showAll">): { fuel: boolean; charge: boolean } {
  if (!s.configured || s.showAll) return { fuel: true, charge: true };
  if (s.carType === "ev") return { fuel: false, charge: true };
  if (s.carType === "phev") return { fuel: true, charge: true };
  return { fuel: true, charge: false };
}
export function useShows() {
  const [s] = useSettings();
  return carShows(s);
}

/** La bienvenida sigue pendiente: aún no ha dicho qué coche lleva ni la ha saltado */
export function onboardingPending(): boolean {
  try {
    return window.localStorage.getItem("gc.welcome") !== "1" && !settingsStore.get().configured;
  } catch {
    return false;
  }
}
export function onboardingDone() {
  try {
    window.localStorage.setItem("gc.welcome", "1");
  } catch {
    /* nada */
  }
}

/** Modo en uso, ajustado a lo que el coche puede usar */
export function useMode(): [AppMode, (v: AppMode | ((prev: AppMode) => AppMode)) => void] {
  const [stored, set] = usePersisted(modeStore);
  const shows = useShows();
  const mode: AppMode = !shows.charge ? "fuel" : !shows.fuel ? "charge" : stored;
  return [mode, set];
}
