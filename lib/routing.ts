import "server-only";
import { cumulativeKm, haversineKm } from "./geo";

/** "41.35,2.07" → [lat, lon] redondeado (~100 m). Solo España. */
export function parsePoint(v: string | null): [number, number] | null {
  if (!v) return null;
  const [lat, lon] = v.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 27 || lat > 44.5 || lon < -18.5 || lon > 4.6) return null;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return [r3(lat), r3(lon)];
}

export type RouteGeo = {
  distanceKm: number; // según OSRM
  durationMin: number;
  line: [number, number][]; // [lon, lat], un punto cada ~300 m
  cum: number[]; // km acumulados de la línea simplificada
  scale: number; // corrige la diferencia entre la línea simplificada y la distancia real
};

/** Ruta en coche con OSRM (servidor público de demostración; para mucho tráfico conviene uno propio). */
export async function getRoute(from: [number, number], to: [number, number]): Promise<RouteGeo> {
  const osrm = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`,
    { signal: AbortSignal.timeout(15000), next: { revalidate: 3600 } },
  );
  if (!osrm.ok) throw new Error("No se ha podido calcular la ruta");
  const rj = (await osrm.json()) as {
    code: string;
    routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (rj.code !== "Ok" || !rj.routes.length) throw new Error("No hay ruta en coche entre esos puntos");
  const route = rj.routes[0];
  const full = route.geometry.coordinates;
  const line: [number, number][] = [full[0]];
  for (const c of full.slice(1)) {
    const last = line[line.length - 1];
    if (haversineKm(last[1], last[0], c[1], c[0]) >= 0.3) line.push(c);
  }
  if (line[line.length - 1] !== full[full.length - 1]) line.push(full[full.length - 1]);
  const cum = cumulativeKm(line);
  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    line,
    cum,
    scale: route.distance / 1000 / (cum[cum.length - 1] || 1),
  };
}

/** Puntos [lat, lon] de la línea separados ~everyKm (incluye inicio y fin) */
export function samplePoints(r: RouteGeo, everyKm: number): [number, number][] {
  const out: [number, number][] = [];
  let next = 0;
  r.line.forEach(([lon, lat], i) => {
    if (r.cum[i] >= next) {
      out.push([lat, lon]);
      next = r.cum[i] + everyKm;
    }
  });
  const [lon, lat] = r.line[r.line.length - 1];
  out.push([lat, lon]);
  return out;
}

/** Pueblos de referencia a 1/3 y 2/3 del recorrido para la tira del recorrido */
export function waypointsFor(items: { along: number; dist: number; label: string }[], totalKm: number) {
  return [1 / 3, 2 / 3]
    .map((f) => {
      const target = totalKm * f;
      const near = items.filter((x) => x.dist < 1.5 && x.label).sort((a, b) => Math.abs(a.along - target) - Math.abs(b.along - target))[0];
      return near && Math.abs(near.along - target) < totalKm * 0.15 ? { km: Math.round(near.along), label: near.label } : null;
    })
    .filter((w): w is { km: number; label: string } => w !== null);
}
