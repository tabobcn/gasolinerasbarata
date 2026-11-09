import { NextResponse, type NextRequest } from "next/server";
import { rpc } from "@/lib/supabase";
import { groupSites, type ChargersResponse } from "@/lib/chargers";

/** Puntos de recarga cerca (datos de REVE guardados en Supabase) */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const radius = Math.min(25, Math.max(1, Number(sp.get("radius")) || 5));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 27 || lat > 44.5 || lon < -18.5 || lon > 4.6) {
    return NextResponse.json({ error: "Ubicación fuera de España" }, { status: 400 });
  }
  try {
    const data = await rpc<ChargersResponse>("chargers_near", { p_lat: lat, p_lon: lon, p_radius_km: radius, p_limit: 120 });
    // Los postes del mismo sitio (P01, P02…) se enseñan como un solo punto
    const body: ChargersResponse = { ...data, items: groupSites(data.items) };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
