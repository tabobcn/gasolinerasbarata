import type { FuelKey } from "./fuels";
import type { Station } from "./types";

/** Consumo medio supuesto (solo para el desvío en ruta y la comparación con el eléctrico) */
export const CONSUMPTION_L_100KM = 7;

export function average(stations: Station[], fuel: FuelKey, excludeId?: string): number | null {
  const vals = stations.filter((s) => s.id !== excludeId).map((s) => s.prices[fuel]).filter((p): p is number => p != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Mejor opción: la más barata (a igual precio, la más cercana). No se descuenta el trayecto:
 * cada coche gasta distinto y a pocos kilómetros la diferencia es mínima.
 * `avg` es la media de la zona, la misma que se enseña en la lista.
 */
export function bestValue(stations: Station[], fuel: FuelKey, tankL: number, avg: number | null) {
  let best: Station | null = null;
  for (const s of stations) {
    const p = s.prices[fuel];
    if (p == null) continue;
    const bp = best?.prices[fuel];
    if (bp == null || p < bp || (p === bp && (s.dist ?? 0) < (best!.dist ?? 0))) best = s;
  }
  if (!best) return null;
  const p = best.prices[fuel]!;
  const a = avg ?? p;
  return { station: best, avg: a, savings: Math.max(0, (a - p) * tankL) };
}

export type Level = { key: "cheap" | "mid" | "high"; label: string; color: string; bg: string };

export const LEVELS: Record<Level["key"], Level> = {
  cheap: { key: "cheap", label: "Barato", color: "#0B7A43", bg: "#E6F4EC" },
  mid: { key: "mid", label: "En la media", color: "#8A4F00", bg: "#FBF0DC" },
  high: { key: "high", label: "Caro", color: "#B5341A", bg: "#FBE6DE" },
};

export function levelFor(price: number, avg: number | null): Level {
  if (avg == null) return LEVELS.mid;
  if (price <= avg - 0.025) return LEVELS.cheap;
  if (price >= avg + 0.025) return LEVELS.high;
  return LEVELS.mid;
}
