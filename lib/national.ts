import "server-only";
import { unstable_cache } from "next/cache";
import { daysAgo, inBatches, municipalityHistory, normalizeList } from "./ministry";
import { PROVINCES, provinceData, provinceSlug } from "./seo";
import type { FuelKey } from "./fuels";
import type { Station } from "./types";

/**
 * Medias de España y de cada provincia y municipio, para la página de precios de hoy y la comparación de cada
 * municipio. Se calculan con los datos de cada provincia y solo se guarda el resumen (unos pocos KB), así las
 * páginas no tienen que bajarse los ~12 MB de toda España en cada visita.
 */

const BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes";
export const NAT_FUELS: FuelKey[] = ["g95", "goa", "g98", "glp"];

export type Avg = Partial<Record<FuelKey, number>>;
export type ProvAvg = { id: string; name: string; slug: string; count: number; avg: Avg };
/** Municipio: [id, provincia, nombre, nº de gasolineras, media 95, media diésel] (formato corto para que el resumen ocupe poco) */
export type MunAvg = [string, string, string, number, number | null, number | null];
export type DaySummary = { updatedAt: string | null; count: number; avg: Avg; provinces: ProvAvg[]; muns: MunAvg[] };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function averages(stations: Station[]): Avg {
  const out: Avg = {};
  for (const f of NAT_FUELS) {
    const ps = stations.map((s) => s.prices[f]).filter((p): p is number => p != null);
    if (ps.length) out[f] = r3(ps.reduce((a, b) => a + b, 0) / ps.length);
  }
  return out;
}

function summarize(sets: { id: string; stations: Station[]; updatedAt?: string | null }[]): DaySummary {
  const all = sets.flatMap((s) => s.stations);
  const provinces: ProvAvg[] = sets.map((s) => {
    const p = PROVINCES.find((x) => x.id === s.id)!;
    return { id: p.id, name: p.name, slug: provinceSlug(p), count: s.stations.length, avg: averages(s.stations) };
  });
  const byMun = new Map<string, Station[]>();
  for (const st of all) {
    const k = `${st.provId}|${st.munId}`;
    const l = byMun.get(k);
    if (l) l.push(st);
    else byMun.set(k, [st]);
  }
  const muns: MunAvg[] = [...byMun.values()].map((l) => {
    const a = averages(l);
    return [l[0].munId, l[0].provId, l[0].mun, l.length, a.g95 ?? null, a.goa ?? null];
  });
  const updatedAt = sets.map((s) => s.updatedAt).filter(Boolean).sort().pop() ?? null;
  return { updatedAt, count: all.length, avg: averages(all), provinces, muns };
}

/** Si faltan más de 2 provincias el resumen no sería fiable: se da por fallido y no se guarda */
function enough<T>(results: (T | null)[]): T[] {
  const ok = results.filter((r): r is T => r != null);
  if (ok.length < PROVINCES.length - 2) throw new Error("Faltan provincias del Ministerio");
  return ok;
}

/** Hoy: con los mismos datos por provincia que ya usan las páginas de cada provincia (caché de 15 min) */
export const nationalToday = unstable_cache(
  async (): Promise<DaySummary> => {
    const sets = await inBatches(PROVINCES, 8, (p) =>
      provinceData(p.id)
        .then((d) => (d.stations.length ? { id: p.id, stations: d.stations, updatedAt: d.updatedAt } : null))
        .catch(() => null),
    );
    return summarize(enough(sets));
  },
  ["national-today-v1"],
  { revalidate: 900 },
);

/** Un día pasado (dd-mm-aaaa). No cambia nunca: se guarda un mes. */
export const nationalDay = unstable_cache(
  async (ddmmyyyy: string): Promise<DaySummary> => {
    const sets = await inBatches(PROVINCES, 8, (p) =>
      fetch(`${BASE}/EstacionesTerrestresHist/FiltroProvincia/${ddmmyyyy}/${p.id}`, {
        headers: { Accept: "application/json" },
        cache: "no-store", // ya se guarda el resumen; las respuestas enteras no hace falta guardarlas
        signal: AbortSignal.timeout(25000),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((raw) => {
          if (!raw) return null;
          const d = normalizeList(raw);
          return d.stations.length ? { id: p.id, stations: d.stations } : null;
        })
        .catch(() => null),
    );
    return summarize(enough(sets));
  },
  ["national-day-v1"],
  { revalidate: 60 * 60 * 24 * 30 },
);

export type NationalView = {
  today: DaySummary;
  yesterday: DaySummary | null;
  /** Municipios donde más ha bajado la gasolina 95 en 30 días (con al menos 3 gasolineras) */
  drops: { name: string; prov: string; provSlug: string; munId: string; now: number; diff: number }[];
};

export async function nationalView(): Promise<NationalView> {
  const [today, yesterday, month] = await Promise.all([
    nationalToday(),
    nationalDay(daysAgo(1).key).catch(() => null),
    nationalDay(daysAgo(30).key).catch(() => null),
  ]);
  const before = new Map((month?.muns ?? []).map((m) => [`${m[1]}|${m[0]}`, m]));
  const drops = today.muns
    .filter((m) => m[3] >= 3 && m[4] != null)
    .map((m) => {
      const old = before.get(`${m[1]}|${m[0]}`);
      const p = PROVINCES.find((x) => x.id === m[1]);
      return old?.[4] != null && p ? { name: m[2], prov: p.name, provSlug: provinceSlug(p), munId: m[0], now: m[4]!, diff: r3(m[4]! - old[4]) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5);
  return { today, yesterday, drops };
}

/**
 * Evolución de la media de un municipio en los últimos 30 días, un punto cada 3 días. Los días elegidos son siempre
 * los mismos (múltiplos de 3 desde 1970), así lo ya descargado sirve para los días siguientes y al Ministerio
 * solo se le pide un día nuevo cada 3.
 */
export async function municipalityTrend(munId: string, today: Station[]): Promise<{ date: string; avg: Avg }[]> {
  const days = Array.from({ length: 30 }, (_, i) => daysAgo(30 - i)).filter((d) => Math.round(Date.parse(d.iso) / 86400000) % 3 === 0);
  const past = await inBatches(days, 5, (d) =>
    municipalityHistory(munId, d.key)
      .then((l) => ({ date: d.iso, avg: averages(l) }))
      .catch(() => null),
  );
  return [...past.filter((p): p is NonNullable<typeof p> => p != null && Object.keys(p.avg).length > 0), { date: daysAgo(0).iso, avg: averages(today) }];
}
