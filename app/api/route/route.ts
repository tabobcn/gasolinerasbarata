import { NextResponse, type NextRequest } from "next/server";
import { stationsInArea } from "@/lib/ministry";
import { distanceToPolyline, expandBBox, haversineKm, lineBBox } from "@/lib/geo";
import { getRoute, parsePoint, waypointsFor } from "@/lib/routing";
import { isFuelKey } from "@/lib/fuels";
import { CONSUMPTION_L_100KM } from "@/lib/savings";
import type { RouteResponse, RouteStop } from "@/lib/types";
import { applyDiscounts, decodeDiscounts } from "@/lib/discounts";

export const maxDuration = 60;

const CORRIDOR_KM = 2.5;

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
    const { line, cum, scale, distanceKm, durationMin } = await getRoute(from, to);

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

    const waypoints = waypointsFor(
      corridor.map((x) => ({ along: x.along, dist: x.dist, label: x.s.mun })),
      distanceKm,
    );

    const body: RouteResponse = {
      distanceKm: Math.round(distanceKm),
      durationMin: Math.round(durationMin),
      fuel,
      average: avg,
      stops,
      waypoints,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=900" } });
  } catch (e) {
    console.error("[api]", (e as Error).message); // el detalle se queda en el registro del servidor
    return NextResponse.json({ error: "No hemos podido consultar los datos ahora mismo. Inténtalo de nuevo en un momento." }, { status: 502 });
  }
}
