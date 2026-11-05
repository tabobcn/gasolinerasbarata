"use client";

import { useCallback, useEffect, useState } from "react";

const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const TTL = 5 * 60 * 1000;

export async function getJSON<T>(url: string, force = false): Promise<T> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data as T;
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;
  const p = fetch(url)
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as { error?: string }).error || `Error ${r.status}`);
      cache.set(url, { at: Date.now(), data: body });
      return body as T;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export function useJSON<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null; loading: boolean }>(() => {
    const hit = url ? cache.get(url) : undefined;
    return { url, data: (hit?.data as T) ?? null, error: null, loading: !!url && !hit };
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setState({ url, data: null, error: null, loading: false });
      return;
    }
    let alive = true;
    setState((s) => (s.url === url ? { ...s, loading: true, error: null } : { url, data: (cache.get(url)?.data as T) ?? null, error: null, loading: true }));
    getJSON<T>(url, tick > 0)
      .then((data) => alive && setState({ url, data, error: null, loading: false }))
      .catch((e: Error) => alive && setState((s) => ({ url, data: s.url === url ? s.data : null, error: e.message, loading: false })));
    return () => {
      alive = false;
    };
  }, [url, tick]);

  // Al volver a la app después de un rato (app instalada abierta en segundo plano), refresca lo caducado
  useEffect(() => {
    if (!url) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const hit = cache.get(url);
      if (!hit || Date.now() - hit.at > TTL) setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [url]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  // Nunca devolver los datos de otra URL (p. ej. los de la ciudad anterior mientras carga la nueva)
  if (state.url === url) return { data: state.data, error: state.error, loading: state.loading, reload };
  const hit = url ? cache.get(url) : undefined;
  return { data: (hit?.data as T) ?? null, error: null, loading: !!url && !hit, reload };
}

/** Redondea a ~100 m para que la caché (navegador y CDN) se aproveche mejor */
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function stationsUrl(lat: number, lon: number, radius: number) {
  return `/api/stations?lat=${r3(lat)}&lon=${r3(lon)}&radius=${radius}`;
}
