import "server-only";
import { inBatches, daysAgo, municipalityHistory, municipalityStations, stationsInArea } from "./ministry";
import { bboxAround, haversineKm } from "./geo";
import { applyDiscounts, decodeDiscounts } from "./discounts";
import { fuelByKey, isFuelKey, type FuelKey } from "./fuels";
import { fmtKm, fmtPrice, madridDate } from "./format";

/**
 * Comprobación de alertas en el servidor (la usa la función "push" de Supabase cada media hora).
 * Misma lógica y mismos textos que la comprobación que hace la app al abrirse (lib/alerts.ts).
 */
export type AlertSpec = { id: string; fuel: FuelKey; threshold: number; radius: number; lat: number; lon: number; label: string };
export type AlertResult = { id: string; hit: boolean; price: number | null; title?: string; body?: string; url?: string };
export type FavResult = { key: string; title: string; body: string; url: string };

const inSpain = (lat: number, lon: number) => lat >= 27 && lat <= 44.5 && lon >= -18.5 && lon <= 4.6;

export function parseAlertSpecs(raw: unknown): AlertSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: AlertSpec[] = [];
  for (const x of raw.slice(0, 10)) {
    const id = typeof x?.id === "string" && /^[A-Za-z0-9]{1,20}$/.test(x.id) ? x.id : null;
    const threshold = Number(x?.threshold);
    const radius = Number(x?.radius);
    const lat = Number(x?.lat);
    const lon = Number(x?.lon);
    if (!id || !isFuelKey(x?.fuel) || !(threshold > 0.2 && threshold < 5) || !(radius >= 1 && radius <= 25)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inSpain(lat, lon)) continue;
    const label = typeof x?.label === "string" ? x.label.replace(/[\u0000-\u001f<>]/g, "").slice(0, 40) : "";
    out.push({ id, fuel: x.fuel, threshold, radius, lat, lon, label: label || "ti" });
  }
  return out;
}

export function parseFavItems(raw: unknown): { id: string; m: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 30)
    .map((x) => ({ id: String(x?.id ?? ""), m: String(x?.m ?? "") }))
    .filter((x) => /^\d{1,6}$/.test(x.id) && /^\d{1,5}$/.test(x.m));
}

/** Las alertas que no se pueden comprobar (fallo del Ministerio) no salen en el resultado */
export async function checkAlerts(alerts: AlertSpec[], disc: string): Promise<AlertResult[]> {
  const d = decodeDiscounts(disc);
  const out: AlertResult[] = [];
  for (const a of alerts) {
    try {
      const ds = await stationsInArea(bboxAround(a.lat, a.lon, a.radius));
      const near = ds.stations
        .map((s) => ({ ...s, dist: Math.round(haversineKm(a.lat, a.lon, s.lat, s.lon) * 100) / 100 }))
        .filter((s) => s.dist <= a.radius);
      const withFuel = applyDiscounts(near, d).filter((s) => s.prices[a.fuel] != null);
      const cheapest = withFuel.sort((x, y) => x.prices[a.fuel]! - y.prices[a.fuel]!)[0] ?? null;
      const price = cheapest?.prices[a.fuel] ?? null;
      const hit = price != null && price < a.threshold - 0.00001;
      out.push(
        hit && cheapest
          ? {
              id: a.id,
              hit: true,
              price,
              title: `${fuelByKey(a.fuel)?.label ?? ""} a ${fmtPrice(price)} € cerca de ${a.label}`,
              body: `${cheapest.name}${cheapest.dist != null ? ` · a ${fmtKm(cheapest.dist)}` : ""} · toca para ir`,
              url: `/gasolinera/${cheapest.id}?m=${cheapest.munId}`,
            }
          : { id: a.id, hit: false, price },
      );
    } catch {
      /* sin datos ahora: se comprobará en la siguiente pasada */
    }
  }
  return out;
}

/** Favoritas que han bajado 3 céntimos o más respecto a ayer */
export async function checkFavDrops(favs: { id: string; m: string }[], fuels: FuelKey[]): Promise<FavResult[]> {
  if (!favs.length || !fuels.length) return [];
  const today = madridDate();
  const yKey = daysAgo(1).key;
  const muns = [...new Set(favs.map((f) => f.m))].slice(0, 10);
  const data = await inBatches(muns, 4, async (m) => {
      const [cur, yest] = await Promise.all([municipalityStations(m).catch(() => null), municipalityHistory(m, yKey).catch(() => null)]);
      return { m, cur, yest };
  });
  const out: FavResult[] = [];
  for (const f of favs) {
    const d = data.find((x) => x.m === f.m);
    const st = d?.cur?.stations.find((s) => s.id === f.id);
    const before = d?.yest?.find((s) => s.id === f.id)?.prices;
    if (!st || !before) continue;
    for (const fuel of fuels) {
      const now = st.prices[fuel];
      const prev = before[fuel];
      if (now != null && prev != null && prev - now >= 0.03) {
        out.push({
          key: `${today}:fav:${st.id}:${fuel}`,
          title: `${st.name} ha bajado ${Math.round((prev - now) * 100)} cts`,
          body: `${fuelByKey(fuel)?.label} a ${fmtPrice(now)} € (ayer ${fmtPrice(prev)} €)`,
          url: `/gasolinera/${st.id}?m=${st.munId}`,
        });
      }
    }
  }
  return out;
}
