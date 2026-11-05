"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { lastLocationStore, settingsStore } from "@/lib/store";
import { parseFuelParam } from "@/lib/fuels";

export type Loc = {
  lat: number;
  lon: number;
  label: string | null; // nombre del sitio si se ha buscado; null si es GPS
  source: "gps" | "search" | "url" | "saved";
  accuracy?: number;
};

type Status = "idle" | "locating" | "ok" | "denied" | "error" | "unsupported";

type Ctx = {
  loc: Loc | null;
  gps: { lat: number; lon: number; accuracy: number } | null;
  status: Status;
  ready: boolean; // ya sabemos si hay ubicación o no
  locate: () => void;
  setPlace: (p: { lat: number; lon: number; label: string }) => void;
};

const LocationContext = createContext<Ctx | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState<Loc | null>(null);
  const [gps, setGps] = useState<Ctx["gps"]>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const seq = useRef(0); // cambia cada vez que el usuario elige un sitio a mano

  const save = (l: Loc) => {
    lastLocationStore.set({ lat: l.lat, lon: l.lon, label: l.label, at: Date.now() });
  };

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setReady(true);
      return;
    }
    setStatus("locating");
    const mine = ++seq.current;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const l: Loc = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: null,
          source: "gps",
          accuracy: pos.coords.accuracy,
        };
        setGps({ lat: l.lat, lon: l.lon, accuracy: pos.coords.accuracy });
        setStatus("ok");
        setReady(true);
        // Si mientras tanto ha buscado un sitio a mano, no se lo cambiamos
        if (mine !== seq.current) return;
        setLoc(l);
        save(l);
        setReady(true);
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
        setReady(true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  const setPlace = useCallback((p: { lat: number; lon: number; label: string }) => {
    seq.current++;
    const l: Loc = { ...p, source: "search" };
    setLoc(l);
    save(l);
    setReady(true);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // 1) Enlace compartido: ?lat=..&lon=..&fuel=..
    const sp = new URLSearchParams(window.location.search);
    const lat = Number(sp.get("lat"));
    const lon = Number(sp.get("lon"));
    const fuel = parseFuelParam(sp.get("fuel"));
    if (fuel) settingsStore.set((s) => ({ ...s, fuel, fuels: s.fuels.includes(fuel) ? s.fuels : [...s.fuels, fuel] }));
    if (sp.has("lat") && Number.isFinite(lat) && Number.isFinite(lon)) {
      setLoc({ lat, lon, label: null, source: "url" });
      setReady(true);
      return;
    }
    // En las páginas por ciudad (para Google) no pedimos el GPS nada más entrar
    const seoPage = window.location.pathname.startsWith("/gasolineras");
    // 2) Última ubicación conocida mientras llega el GPS
    const last = lastLocationStore.get();
    if (last) {
      setLoc({ lat: last.lat, lon: last.lon, label: last.label, source: "saved" });
      setReady(true);
      // si buscó un sitio a mano, lo respetamos; si era GPS, refrescamos
      if (last.label) return;
    }
    if (seoPage) {
      setReady(true);
      return;
    }
    locate();
  }, [locate]);

  const value = useMemo(() => ({ loc, gps, status, ready, locate, setPlace }), [loc, gps, status, ready, locate, setPlace]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): Ctx {
  const c = useContext(LocationContext);
  if (!c) throw new Error("useLocation fuera de LocationProvider");
  return c;
}
