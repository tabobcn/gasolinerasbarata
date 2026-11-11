import { NextResponse, type NextRequest } from "next/server";
import { stationsInArea } from "@/lib/ministry";
import { bboxAround, haversineKm } from "@/lib/geo";
import type { StationsResponse } from "@/lib/types";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const radius = Math.min(25, Math.max(1, Number(sp.get("radius")) || 5));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 27 || lat > 44.5 || lon < -18.5 || lon > 4.6) {
    return NextResponse.json({ error: "Ubicación fuera de España" }, { status: 400 });
  }
  try {
    const ds = await stationsInArea(bboxAround(lat, lon, radius));
    const stations = ds.stations
      .map((s) => ({ ...s, dist: Math.round(haversineKm(lat, lon, s.lat, s.lon) * 100) / 100 }))
      .filter((s) => s.dist <= radius)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 500);
    const body: StationsResponse = { updatedAt: ds.updatedAt, center: { lat, lon }, radius, stations };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    });
  } catch (e) {
    console.error("[api]", (e as Error).message); // el detalle se queda en el registro del servidor
    return NextResponse.json({ error: "No hemos podido consultar los datos ahora mismo. Inténtalo de nuevo en un momento." }, { status: 502 });
  }
}
