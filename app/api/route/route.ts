import { NextResponse, type NextRequest } from "next/server";
import { stationsInArea } from "@/lib/ministry";
import { distanceToPolyline, expandBBox, haversineKm, lineBBox } from "@/lib/geo";
import { getRoute, parsePoint, waypointsFor } from "@/lib/routing";
import { isFuelKey } from "@/lib/fuels";
import { brandVisible } from "@/lib/brands";
import type { RouteResponse, RouteSegment, RouteStop } from "@/lib/types";
import { applyDiscounts, decodeDiscounts } from "@/lib/discounts";

export const maxDuration = 60;

const CORRIDOR_KM = 2.5;
const SEGMENT_KM = 90;
const MAX_STOPS = 25;

/** Gasolineras a lo largo de una ruta en coche: las más baratas de cada tramo, repartidas por todo el viaje. */
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

    // Marcas que el usuario ha ocultado en Ajustes (?h=REPSOL,BP)
    const hidden = (sp.get("h") ?? "").split(",").map((k) => k.trim().toUpperCase().slice(0, 30)).filter(Boolean).slice(0, 40);
    const visible = brandVisible(hidden);
    const withFuel = corridor.filter((x) => x.s.prices[fuel] != null && visible(x.s.brand));
    const avg = withFuel.length ? withFuel.reduce((a, x) => a + x.s.prices[fuel]!, 0) / withFuel.length : null;

    // Tramos de unos 90 km. En cada uno se enseñan sus más baratas, para que haya dónde elegir en todo el viaje
    const nSeg = Math.max(1, Math.round(distanceKm / SEGMENT_KM));
    const segLen = distanceKm / nSeg;
    const perSeg = Math.min(8, Math.max(3, Math.ceil(MAX_STOPS / nSeg)));
    const segments: RouteSegment[] = Array.from({ length: nSeg }, (_, i) => ({ from: Math.round(i * segLen), to: Math.round((i + 1) * segLen) }));

    const all = withFuel.map((x) => {
      const p = x.s.prices[fuel]!;
      const detourKm = x.dist * 2 * 1.3; // ida y vuelta, factor carretera
      return {
        station: { ...x.s, dist: Math.round(x.dist * 100) / 100 },
        kmAlong: Math.round(x.along),
        offRouteKm: Math.round(x.dist * 10) / 10,
        detourMin: Math.max(1, Math.round((detourKm / 40) * 60)),
        netSavings: avg == null ? 0 : Math.round(Math.max(0, avg - p) * tank * 100) / 100,
        seg: Math.min(nSeg - 1, Math.max(0, Math.floor(x.along / segLen))),
      } as RouteStop;
    });
    // más barata primero; a igual precio, la que menos desvía
    const cheaper = (a: RouteStop, b: RouteStop) => a.station.prices[fuel]! - b.station.prices[fuel]! || a.offRouteKm - b.offRouteKm;
    const stops: RouteStop[] = [];
    for (let i = 0; i < nSeg; i++) {
      const inSeg = all.filter((x) => x.seg === i).sort(cheaper).slice(0, perSeg);
      if (inSeg[0]) inSeg[0].bestInSeg = true;
      stops.push(...inSeg);
    }
    const top = [...stops].sort(cheaper)[0];
    if (top) top.bestOverall = true;
    stops.sort((a, b) => a.kmAlong - b.kmAlong);

    // Línea para el mapa: como mucho unos 400 puntos
    const step = Math.max(1, Math.ceil(line.length / 400));
    const drawn = line.filter((_, i) => i % step === 0 || i === line.length - 1).map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] as [number, number]);

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
      segments,
      line: drawn,
      waypoints,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=900" } });
  } catch (e) {
    console.error("[api]", (e as Error).message); // el detalle se queda en el registro del servidor
    return NextResponse.json({ error: "No hemos podido consultar los datos ahora mismo. Inténtalo de nuevo en un momento." }, { status: 502 });
  }
}
