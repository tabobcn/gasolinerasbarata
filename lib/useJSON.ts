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
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>(() => {
    const hit = url ? cache.get(url) : undefined;
    return { data: (hit?.data as T) ?? null, error: null, loading: !!url && !hit };
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    getJSON<T>(url, tick > 0)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState((s) => ({ data: s.data, error: e.message, loading: false })));
    return () => {
      alive = false;
    };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Redondea a ~100 m para que la caché (navegador y CDN) se aproveche mejor */
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function stationsUrl(lat: number, lon: number, radius: number) {
  return `/api/stations?lat=${r3(lat)}&lon=${r3(lon)}&radius=${radius}`;
}
