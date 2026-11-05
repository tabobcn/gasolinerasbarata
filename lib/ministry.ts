import "server-only";
import { FUELS } from "./fuels";
import type { Prices, Station } from "./types";
import { brandKey, fixMunicipality, stationName } from "./brands";
import { titleCase } from "./format";
import { bboxIntersects, type BBox } from "./geo";
import PROVINCE_BBOX from "./province-bbox.json";

/**
 * API pública del Ministerio (precios de carburantes). Gratuita, sin clave.
 * https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/help
 */
const BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes";
const TTL_MS = 20 * 60 * 1000; // el Ministerio actualiza cada ~30 min

type RawStation = Record<string, string>;
type RawResponse = { Fecha: string; ListaEESSPrecio: RawStation[]; ResultadoConsulta: string };

export type Dataset = { updatedAt: string | null; stations: Station[] };

const num = (v: string | undefined) => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Desfase de Madrid respecto a UTC (en horas) en un instante dado */
function madridOffsetH(ms: number): number {
  const tz = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
    .formatToParts(new Date(ms))
    .find((p) => p.type === "timeZoneName")?.value;
  const off = tz?.match(/GMT([+-]\d+)/)?.[1];
  return off ? Number(off) : 1;
}

/** "04/11/2026 2:14:32" (hora peninsular) → ISO. Correcto también en los días de cambio de hora. */
export function madridDateToISO(fecha: string | undefined): string | null {
  if (!fecha) return null;
  const m = fecha.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m.map(Number) as unknown as number[];
  const asUTC = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = madridOffsetH(asUTC);
  let t = asUTC - first * 3600 * 1000;
  const second = madridOffsetH(t);
  if (second !== first) t = asUTC - second * 3600 * 1000;
  return new Date(t).toISOString();
}

export function normalize(r: RawStation): Station | null {
  const lat = num(r["Latitud"]);
  const lonRaw = r["Longitud (WGS84)"];
  const lon = lonRaw ? Number(lonRaw.replace(",", ".")) : NaN;
  if (lat == null || !Number.isFinite(lon)) return null;
  if (lat < 27 || lat > 44.5 || lon < -18.5 || lon > 4.6) return null;
  const prices: Prices = {};
  for (const f of FUELS) {
    const p = num(r[f.field]);
    if (p != null) prices[f.key] = p;
  }
  const brand = brandKey(r["Rótulo"] || "");
  const mun = fixMunicipality(r["Municipio"] || "");
  return {
    id: r["IDEESS"],
    brand,
    name: stationName(brand, mun),
    address: titleCase(r["Dirección"] || ""),
    town: titleCase(r["Localidad"] || ""),
    mun,
    munId: r["IDMunicipio"],
    prov: titleCase(r["Provincia"] || ""),
    provId: r["IDProvincia"],
    cp: r["C.P."] || "",
    lat,
    lon,
    hours: r["Horario"] || "",
    prices,
  };
}

async function getJSON(url: string, revalidate: number | false): Promise<RawResponse> {
  // Precios de hoy: siempre frescos (ya hay caché en memoria de 20 min y en la CDN).
  // Históricos: caché larga de Next, porque los días pasados no cambian.
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(revalidate === 0 ? { cache: "no-store" as const } : { next: { revalidate } }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Ministerio respondió ${res.status}`);
  return (await res.json()) as RawResponse;
}

// Caché en memoria por provincia (vive mientras la función está "caliente")
const memo = new Map<string, { at: number; data: Dataset; pending?: Promise<Dataset> }>();

async function cached(key: string, load: () => Promise<Dataset>): Promise<Dataset> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  if (hit?.pending) return hit.pending;
  const pending = load()
    .then((data) => {
      memo.set(key, { at: Date.now(), data });
      return data;
    })
    .catch((e) => {
      // si falla pero tenemos datos antiguos, los seguimos sirviendo
      if (hit) {
        memo.set(key, { ...hit, pending: undefined });
        return hit.data;
      }
      memo.delete(key);
      throw e;
    });
  memo.set(key, { at: hit?.at ?? 0, data: hit?.data ?? { updatedAt: null, stations: [] }, pending });
  return pending;
}

function toDataset(raw: RawResponse): Dataset {
  return {
    updatedAt: madridDateToISO(raw.Fecha),
    stations: raw.ListaEESSPrecio.map(normalize).filter((s): s is Station => s !== null),
  };
}

export function provinceStations(provId: string): Promise<Dataset> {
  return cached(`p:${provId}`, async () =>
    toDataset(await getJSON(`${BASE}/EstacionesTerrestres/FiltroProvincia/${provId}`, 0)),
  );
}

export function municipalityStations(munId: string): Promise<Dataset> {
  return cached(`m:${munId}`, async () =>
    toDataset(await getJSON(`${BASE}/EstacionesTerrestres/FiltroMunicipio/${munId}`, 0)),
  );
}

/** Precios de un municipio en un día pasado (dd-mm-aaaa). Los días pasados no cambian: caché larga. */
export async function municipalityHistory(munId: string, ddmmyyyy: string): Promise<Station[]> {
  const raw = await getJSON(`${BASE}/EstacionesTerrestresHist/FiltroMunicipio/${ddmmyyyy}/${munId}`, 60 * 60 * 24 * 30);
  return raw.ListaEESSPrecio.map(normalize).filter((s): s is Station => s !== null);
}

const BBOXES = PROVINCE_BBOX as unknown as Record<string, BBox>;

export function provincesFor(area: BBox): string[] {
  return Object.entries(BBOXES)
    .filter(([, b]) => bboxIntersects(b, area))
    .map(([id]) => id);
}

export async function stationsInArea(area: BBox): Promise<Dataset> {
  const ids = provincesFor(area);
  const sets = await Promise.allSettled(ids.map(provinceStations));
  const ok = sets.filter((s): s is PromiseFulfilledResult<Dataset> => s.status === "fulfilled").map((s) => s.value);
  if (!ok.length && ids.length) throw new Error("No se han podido cargar los precios del Ministerio");
  const updatedAt = ok.map((d) => d.updatedAt).filter(Boolean).sort().pop() ?? null;
  return { updatedAt, stations: ok.flatMap((d) => d.stations) };
}

/** Fecha en formato dd-mm-aaaa, n días naturales atrás (hora de Madrid, sin fallos en los cambios de hora) */
export function daysAgo(n: number): { key: string; iso: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const dt = new Date(Date.UTC(get("year"), get("month") - 1, get("day") - n));
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const y = dt.getUTCFullYear();
  return { key: `${d}-${m}-${y}`, iso: `${y}-${m}-${d}` };
}

/** Convierte una respuesta del Ministerio (ya descargada) en el formato de la app */
export function normalizeList(raw: RawResponse): Dataset {
  return toDataset(raw);
}
