import { NextResponse, type NextRequest } from "next/server";
import { daysAgo, municipalityHistory, municipalityStations } from "@/lib/ministry";
import type { StationDetailResponse } from "@/lib/types";

export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = req.nextUrl.searchParams.get("m");
  if (!/^\d{1,6}$/.test(id) || !m || !/^\d{1,5}$/.test(m)) {
    return NextResponse.json({ error: "Faltan datos de la gasolinera" }, { status: 400 });
  }
  try {
    const [today, yest] = await Promise.all([
      municipalityStations(m),
      municipalityHistory(m, daysAgo(1).key).catch(() => null),
    ]);
    const station = today.stations.find((s) => s.id === id);
    if (!station) return NextResponse.json({ error: "Gasolinera no encontrada" }, { status: 404 });
    const body: StationDetailResponse = {
      updatedAt: today.updatedAt,
      station,
      yesterday: yest?.find((s) => s.id === id)?.prices ?? null,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch (e) {
    console.error("[api]", (e as Error).message); // el detalle se queda en el registro del servidor
    return NextResponse.json({ error: "No hemos podido consultar los datos ahora mismo. Inténtalo de nuevo en un momento." }, { status: 502 });
  }
}
