import "server-only";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";
import { haversineKm } from "./geo";
import { chargerName, displayGroup, groupSites, shortAddress, summarize, type Car, type Charger, type ChargersResponse, type Summary } from "./chargers";
import type { Municipality } from "./seo";
import type { Station } from "./types";

/** Páginas de cargadores por ciudad (para Google). Datos de REVE guardados en Supabase. */

const HEADERS = { apikey: SUPABASE_KEY, "content-type": "application/json", accept: "application/json" };

// Coche "cualquiera": se enseñan todos los enchufes y el precio más barato de cada sitio
export const ANY_CAR: Car = { electric: false, plugs: [], ac: 0, dc: 0, battery: 50, label: "" };

type Grid = Map<string, [number, number][]>;
const CELL = 0.05; // ~5,5 km
const cellOf = (lat: number, lon: number) => `${Math.floor(lat / CELL)}|${Math.floor(lon / CELL)}`;

/** Todas las ubicaciones con cargador (solo coordenadas), en una rejilla para contar rápido. Se renueva cada 12 h. */
export async function chargerGrid(): Promise<Grid> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ev_points`, { headers: HEADERS, next: { revalidate: 43200 }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Base de datos de cargadores: error ${res.status}`);
  const pts = (await res.json()) as [number, number][];
  const grid: Grid = new Map();
  for (const p of pts) {
    const k = cellOf(p[0], p[1]);
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  return grid;
}

export function countNear(grid: Grid, lat: number, lon: number, km: number): number {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((lat * Math.PI) / 180));
  let n = 0;
  for (let a = Math.floor((lat - dLat) / CELL); a <= Math.floor((lat + dLat) / CELL); a++) {
    for (let b = Math.floor((lon - dLon) / CELL); b <= Math.floor((lon + dLon) / CELL); b++) {
      for (const p of grid.get(`${a}|${b}`) ?? []) if (haversineKm(lat, lon, p[0], p[1]) <= km) n++;
    }
  }
  return n;
}

/**
 * Zona de un municipio: su centro (media de sus gasolineras) y un radio que cubre el casco urbano
 * (entre 2 y 8 km). REVE no dice a qué municipio pertenece cada punto, así que se usa la distancia.
 */
export type Area = { lat: number; lon: number; km: number };
export function areasOf(muns: Municipality[], stations: Station[]): Map<string, Area> {
  const far = new Map<string, number>();
  const byId = new Map(muns.map((m) => [m.id, m]));
  for (const s of stations) {
    const m = byId.get(s.munId);
    if (m) far.set(m.id, Math.max(far.get(m.id) ?? 0, haversineKm(m.lat, m.lon, s.lat, s.lon)));
  }
  return new Map(muns.map((m) => [m.id, { lat: m.lat, lon: m.lon, km: Math.min(8, Math.max(2, Math.round(((far.get(m.id) ?? 0) + 1) * 2) / 2)) }]));
}

export type SeoSite = { s: Summary; name: string; address: string; price: number | null; doubtful: boolean; maxKw: number; points: number };
export type AreaChargers = { updated: string | null; prices: string | null; sites: SeoSite[]; points: number };

/** Sitios de recarga de una zona, ordenados por precio (primero los que publican un precio creíble) */
export async function areaChargers(a: Area): Promise<AreaChargers> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/chargers_near`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ p_lat: Math.round(a.lat * 1e4) / 1e4, p_lon: Math.round(a.lon * 1e4) / 1e4, p_radius_km: a.km, p_limit: 150 }),
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Base de datos de cargadores: error ${res.status}`);
  const data = (await res.json()) as ChargersResponse;
  const now = Date.now();
  const sites = groupSites(data.items).map((ch: Charger) => {
    const s = summarize(ch, ANY_CAR, now);
    const g = displayGroup(s, ANY_CAR);
    return { s, name: chargerName(ch), address: shortAddress(ch.address), price: g?.price ?? null, doubtful: g?.doubtful ?? false, maxKw: s.maxKw, points: ch.evses.length };
  });
  const rank = (x: SeoSite) => (x.price != null && !x.doubtful ? 0 : x.price != null ? 1 : 2);
  sites.sort((x, y) => rank(x) - rank(y) || (x.price ?? 0) - (y.price ?? 0) || (x.s.ch.dist ?? 0) - (y.s.ch.dist ?? 0));
  return { updated: data.updated, prices: data.prices ?? null, sites, points: sites.reduce((n, x) => n + x.points, 0) };
}

export const KW_BANDS: { id: string; label: string; test: (kw: number) => boolean }[] = [
  { id: "normal", label: "Carga normal (menos de 50 kW)", test: (kw) => kw < 50 },
  { id: "rapida", label: "Carga rápida (50 a 149 kW)", test: (kw) => kw >= 50 && kw < 150 },
  { id: "ultra", label: "Ultrarrápida (150 kW o más)", test: (kw) => kw >= 150 },
];
