import { NextResponse, type NextRequest } from "next/server";
import { stationsInArea } from "@/lib/ministry";
import { cumulativeKm, distanceToPolyline, expandBBox, haversineKm, lineBBox } from "@/lib/geo";
import { isFuelKey } from "@/lib/fuels";
import { CONSUMPTION_L_100KM } from "@/lib/savings";
import type { RouteResponse, RouteStop } from "@/lib/types";
import { applyDiscounts, decodeDiscounts } from "@/lib/discounts";

export const maxDuration = 60;

const CORRIDOR_KM = 2.5;

function parsePoint(v: string | null): [number, number] | null {
  if (!v) return null;
  const [lat, lon] = v.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 27 || lat > 44.5 || lon < -18.5 || lon > 4.6) return null; // solo España
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return [r3(lat), r3(lon)];
}

/** Gasolineras a lo largo de una ruta en coche, ordenadas por ahorro neto (contando el desvío). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = parsePoint(sp.get("from"));
  const to = parsePoint(sp.get("to"));
  const fuel = sp.get("fuel");
  const tank = Math.min(120, Math.max(10, Number(sp.get("tank")) || 45));
  if (!from || !to || !isFuelKey(fuel)) return NextResponse.json({ error: "Parámetros no válidos" }, { status: 400 });
  if (haversineKm(from[0], from[1], to[0], to[1]) > 1100) {
    return NextResponse.json({ error: "La ruta es demasiado larga (máx. ~1.100 km)" }, { status: 400 });
  }

  try {
    // Ruta con OSRM (servidor público de demostración; para producción conviene uno propio u OpenRouteService)
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

    // Simplificamos la línea: un punto cada ~300 m es suficiente para el pasillo
    const full = route.geometry.coordinates;
    const line: [number, number][] = [full[0]];
    for (const c of full.slice(1)) {
      const last = line[line.length - 1];
      if (haversineKm(last[1], last[0], c[1], c[0]) >= 0.3) line.push(c);
    }
    if (line[line.length - 1] !== full[full.length - 1]) line.push(full[full.length - 1]);
    const cum = cumulativeKm(line);
    const scale = route.distance / 1000 / (cum[cum.length - 1] || 1);

    const ds = await stationsInArea(expandBBox(lineBBox(line), CORRIDOR_KM));
    const corridor = applyDiscounts(ds.stations, decodeDiscounts(sp.get("d")))
      .map((s) => {
        const { dist, along } = distanceToPolyline(s.lat, s.lon, line, cum);
        return { s, dist, along: along * scale };
      })
      .filter((x) => x.dist <= CORRIDOR_KM);

    const withFuel = corridor.filter((x) => x.s.prices[fuel] != null);
    const avg = withFuel.length ? withFuel.reduce((a, x) => a + x.s.prices[fuel]!, 0) / withFuel.length : null;

    const stops: RouteStop[] = withFuel
      .map((x) => {
        const p = x.s.prices[fuel]!;
        const detourKm = x.dist * 2 * 1.3; // ida y vuelta, factor carretera
        const detourMin = Math.max(1, Math.round((detourKm / 40) * 60));
        const net = avg == null ? 0 : (avg - p) * tank - (detourKm * CONSUMPTION_L_100KM * p) / 100;
        return {
          station: { ...x.s, dist: Math.round(x.dist * 100) / 100 },
          kmAlong: Math.round(x.along),
          offRouteKm: Math.round(x.dist * 10) / 10,
          detourMin,
          netSavings: Math.round(net * 100) / 100,
        };
      })
      .sort((a, b) => b.netSavings - a.netSavings)
      .slice(0, 8);

    // Pueblos de referencia a 1/3 y 2/3 del recorrido para la tira del recorrido
    const total = route.distance / 1000;
    const waypoints = [1 / 3, 2 / 3]
      .map((f) => {
        const target = total * f;
        const near = corridor.filter((x) => x.dist < 1.5).sort((a, b) => Math.abs(a.along - target) - Math.abs(b.along - target))[0];
        return near && Math.abs(near.along - target) < total * 0.15 ? { km: Math.round(near.along), label: near.s.mun } : null;
      })
      .filter((w): w is { km: number; label: string } => w !== null);

    const body: RouteResponse = {
      distanceKm: Math.round(total),
      durationMin: Math.round(route.duration / 60),
      fuel,
      average: avg,
      stops,
      waypoints,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=900" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
