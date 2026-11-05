import { NextResponse, type NextRequest } from "next/server";
import { distanceToPolyline, haversineKm } from "@/lib/geo";
import { getRoute, parsePoint, samplePoints, waypointsFor } from "@/lib/routing";
import { rpc } from "@/lib/supabase";
import {
  EV_KWH_100KM,
  prettyCity,
  routeGroup,
  summarize,
  type Car,
  type Charger,
  type ChargerRouteResponse,
  type ChargerRouteStop,
  type ChargersResponse,
} from "@/lib/chargers";

export const maxDuration = 60;

const CORRIDOR_KM = 3;

/** Todos los puntos de recarga a menos de CORRIDOR_KM del recorrido */
async function chargersAlong(points: [number, number][]): Promise<ChargersResponse> {
  try {
    return await rpc<ChargersResponse>("chargers_in_boxes", { p_points: points, p_km: CORRIDOR_KM, p_limit: 3000 });
  } catch {
    // Plan B (si la función SQL aún no existe): búsquedas circulares a lo largo de la ruta
    const sparse = points.filter((_, i) => i % 3 === 0);
    const seen = new Map<string, Charger>();
    let updated: string | null = null;
    for (let i = 0; i < sparse.length; i += 8) {
      const batch = await Promise.all(
        sparse.slice(i, i + 8).map(([lat, lon]) =>
          rpc<ChargersResponse>("chargers_near", { p_lat: lat, p_lon: lon, p_radius_km: CORRIDOR_KM + 3, p_limit: 150 }).catch(() => null),
        ),
      );
      for (const r of batch) {
        if (!r) continue;
        updated = r.updated ?? updated;
        for (const it of r.items) seen.set(it.id, it);
      }
    }
    return { updated, items: [...seen.values()] };
  }
}

/** Puntos de recarga a lo largo de una ruta, ordenados por lo que cuesta cargar contando el desvío. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = parsePoint(sp.get("from"));
  const to = parsePoint(sp.get("to"));
  if (!from || !to) return NextResponse.json({ error: "Parámetros no válidos" }, { status: 400 });
  if (haversineKm(from[0], from[1], to[0], to[1]) > 1100) {
    return NextResponse.json({ error: "La ruta es demasiado larga (máx. ~1.100 km)" }, { status: 400 });
  }
  const num = (k: string, def: number, min: number, max: number) => Math.min(max, Math.max(min, Number(sp.get(k)) || def));
  const plugs = (sp.get("plugs") ?? "").split(",").filter((p) => /^[a-z0-9]{2,8}$/.test(p)).slice(0, 6);
  const car: Car = {
    electric: sp.get("ev") === "1",
    plugs,
    ac: num("ac", 11, 2, 22),
    dc: sp.get("dc") === "0" ? 0 : num("dc", 0, 0, 350),
    battery: num("battery", 50, 5, 150),
    label: "coche",
  };
  const fast = sp.get("fast") === "1";

  try {
    const route = await getRoute(from, to);
    const data = await chargersAlong(samplePoints(route, 2));
    const now = Date.now();
    const corridor = data.items
      .map((ch) => {
        const { dist, along } = distanceToPolyline(ch.lat, ch.lon, route.line, route.cum);
        return { ch: { ...ch, dist: Math.round(dist * 100) / 100 }, dist, along: along * route.scale };
      })
      .filter((x) => x.dist <= CORRIDOR_KM);

    const scored = corridor
      .map((x) => {
        const s = summarize(x.ch, car, now);
        const g = routeGroup(s, car, fast, now);
        if (!g || s.allDown) return null;
        const detourKm = x.dist * 2 * 1.3; // ida y vuelta, factor carretera
        const detourCost = (detourKm * EV_KWH_100KM * (g.price ?? 0.45)) / 100;
        // Los precios dudosos (demasiado bajos) van detrás de los normales; los que no tienen precio, al final
        const score = g.trip.cost == null ? Number.POSITIVE_INFINITY : g.trip.cost + detourCost + (g.doubtful ? 1e6 : 0);
        return { x, g, detourKm, score };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => a.score - b.score || b.g.kw - a.g.kw || a.x.dist - b.x.dist);

    const stops: ChargerRouteStop[] = scored.slice(0, 8).map(({ x, detourKm }) => ({
      charger: x.ch,
      kmAlong: Math.round(x.along),
      offRouteKm: Math.round(x.dist * 10) / 10,
      detourMin: Math.max(1, Math.round((detourKm / 40) * 60)),
    }));

    const body: ChargerRouteResponse = {
      distanceKm: Math.round(route.distanceKm),
      durationMin: Math.round(route.durationMin),
      updated: data.updated,
      considered: corridor.length,
      stops,
      waypoints: waypointsFor(
        corridor.map((x) => ({ along: x.along, dist: x.dist, label: prettyCity(x.ch.city) })),
        route.distanceKm,
      ),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=900" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
