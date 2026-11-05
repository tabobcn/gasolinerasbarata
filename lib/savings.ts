import type { FuelKey } from "./fuels";
import type { Station } from "./types";

/** Consumo medio supuesto para calcular el coste del desvío */
export const CONSUMPTION_L_100KM = 7;

export function average(stations: Station[], fuel: FuelKey, excludeId?: string): number | null {
  const vals = stations.filter((s) => s.id !== excludeId).map((s) => s.prices[fuel]).filter((p): p is number => p != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Ahorro neto de llenar el depósito aquí frente a la media de la zona,
 * descontando el combustible gastado en ir y volver (distancia × 2).
 */
export function netSavings(price: number, avg: number, tankL: number, roundTripKm: number): number {
  return (avg - price) * tankL - (roundTripKm * CONSUMPTION_L_100KM * price) / 100;
}

export function bestValue(stations: Station[], fuel: FuelKey, tankL: number) {
  let best: { station: Station; avg: number; savings: number } | null = null;
  for (const s of stations) {
    const p = s.prices[fuel];
    if (p == null) continue;
    // Si es la única de la zona, no hay media con la que comparar: se compara consigo misma
    const avg = average(stations, fuel, s.id) ?? p;
    const sv = netSavings(p, avg, tankL, (s.dist ?? 0) * 2);
    if (!best || sv > best.savings) best = { station: s, avg, savings: sv };
  }
  return best;
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
