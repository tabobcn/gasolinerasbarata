import "server-only";
import { normalizeList } from "./ministry";
import type { FuelKey } from "./fuels";
import type { Station } from "./types";

/** Provincias (los IDs del Ministerio no cambian; así no dependemos de una llamada para el índice) */
export const PROVINCES: { id: string; name: string }[] = [
  { id: "15", name: "A Coruña" },
  { id: "01", name: "Araba/Álava" },
  { id: "02", name: "Albacete" },
  { id: "03", name: "Alicante" },
  { id: "04", name: "Almería" },
  { id: "33", name: "Asturias" },
  { id: "05", name: "Ávila" },
  { id: "06", name: "Badajoz" },
  { id: "08", name: "Barcelona" },
  { id: "48", name: "Bizkaia" },
  { id: "09", name: "Burgos" },
  { id: "10", name: "Cáceres" },
  { id: "11", name: "Cádiz" },
  { id: "39", name: "Cantabria" },
  { id: "12", name: "Castellón/Castelló" },
  { id: "51", name: "Ceuta" },
  { id: "13", name: "Ciudad Real" },
  { id: "14", name: "Córdoba" },
  { id: "16", name: "Cuenca" },
  { id: "20", name: "Gipuzkoa" },
  { id: "17", name: "Girona" },
  { id: "18", name: "Granada" },
  { id: "19", name: "Guadalajara" },
  { id: "21", name: "Huelva" },
  { id: "22", name: "Huesca" },
  { id: "07", name: "Illes Balears" },
  { id: "23", name: "Jaén" },
  { id: "26", name: "La Rioja" },
  { id: "35", name: "Las Palmas" },
  { id: "24", name: "León" },
  { id: "25", name: "Lleida" },
  { id: "27", name: "Lugo" },
  { id: "28", name: "Madrid" },
  { id: "29", name: "Málaga" },
  { id: "52", name: "Melilla" },
  { id: "30", name: "Murcia" },
  { id: "31", name: "Navarra" },
  { id: "32", name: "Ourense" },
  { id: "34", name: "Palencia" },
  { id: "36", name: "Pontevedra" },
  { id: "37", name: "Salamanca" },
  { id: "38", name: "Santa Cruz de Tenerife" },
  { id: "40", name: "Segovia" },
  { id: "41", name: "Sevilla" },
  { id: "42", name: "Soria" },
  { id: "43", name: "Tarragona" },
  { id: "44", name: "Teruel" },
  { id: "45", name: "Toledo" },
  { id: "46", name: "Valencia/València" },
  { id: "47", name: "Valladolid" },
  { id: "49", name: "Zamora" },
  { id: "50", name: "Zaragoza" },
];

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’·]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const provinceSlug = (p: { name: string }) => slugify(p.name);
export const provinceBySlug = (slug: string) => PROVINCES.find((p) => provinceSlug(p) === slug) ?? null;
export const provinceById = (id: string) => PROVINCES.find((p) => p.id === id) ?? null;

const BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes";

export type ProvinceData = { updatedAt: string | null; stations: Station[] };

/**
 * Precios de una provincia para las páginas por ciudad. Usa la caché de datos de Next (30 min),
 * así las páginas se pueden servir ya hechas (ISR) sin llamar al Ministerio en cada visita.
 */
export async function provinceData(provId: string): Promise<ProvinceData> {
  const res = await fetch(`${BASE}/EstacionesTerrestres/FiltroProvincia/${provId}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Ministerio respondió ${res.status}`);
  return normalizeList(await res.json());
}

export type Municipality = { id: string; name: string; slug: string; count: number; lat: number; lon: number };

/** Municipios con gasolinera de una provincia (con un slug único dentro de la provincia) */
export function municipalitiesOf(stations: Station[]): Municipality[] {
  const map = new Map<string, { name: string; n: number; lat: number; lon: number }>();
  for (const s of stations) {
    const m = map.get(s.munId) ?? { name: s.mun, n: 0, lat: 0, lon: 0 };
    m.n++;
    m.lat += s.lat;
    m.lon += s.lon;
    map.set(s.munId, m);
  }
  const list = [...map.entries()].map(([id, m]) => ({ id, name: m.name, count: m.n, lat: m.lat / m.n, lon: m.lon / m.n, slug: slugify(m.name) }));
  const seen = new Map<string, number>();
  for (const m of list) seen.set(m.slug, (seen.get(m.slug) ?? 0) + 1);
  for (const m of list) if ((seen.get(m.slug) ?? 0) > 1) m.slug = `${m.slug}-${m.id}`;
  return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export const SEO_FUELS: FuelKey[] = ["g95", "goa", "g98", "glp"];

export type FuelSummary = { fuel: FuelKey; count: number; avg: number | null; cheapest: Station | null; min: number | null; max: number | null };

export function fuelSummary(stations: Station[], fuel: FuelKey): FuelSummary {
  const withFuel = stations.filter((s) => s.prices[fuel] != null);
  if (!withFuel.length) return { fuel, count: 0, avg: null, cheapest: null, min: null, max: null };
  const prices = withFuel.map((s) => s.prices[fuel]!);
  const cheapest = [...withFuel].sort((a, b) => a.prices[fuel]! - b.prices[fuel]!)[0];
  return {
    fuel,
    count: withFuel.length,
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    cheapest,
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

export function cheapestList(stations: Station[], fuel: FuelKey, n: number): Station[] {
  return stations
    .filter((s) => s.prices[fuel] != null)
    .sort((a, b) => a.prices[fuel]! - b.prices[fuel]!)
    .slice(0, n);
}

/** "5 de noviembre de 2026, 01:00" (hora de Madrid) */
export function fmtLongDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
