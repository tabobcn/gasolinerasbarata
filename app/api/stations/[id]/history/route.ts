import { NextResponse, type NextRequest } from "next/server";
import { daysAgo, inBatches, municipalityHistory, municipalityStations } from "@/lib/ministry";
import { isFuelKey } from "@/lib/fuels";
import type { HistoryResponse } from "@/lib/types";

export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const m = sp.get("m");
  const fuel = sp.get("fuel");
  const days = Math.min(30, Math.max(3, Number(sp.get("days")) || 14));
  if (!/^\d{1,6}$/.test(id) || !m || !/^\d{1,5}$/.test(m) || !isFuelKey(fuel)) {
    return NextResponse.json({ error: "Parámetros no válidos" }, { status: 400 });
  }
  const past = Array.from({ length: days - 1 }, (_, i) => daysAgo(days - 1 - i)); // del más antiguo a ayer
  const [hist, today] = await Promise.all([
    // de 8 en 8, como el sitemap, para no saturar al Ministerio
    inBatches(past, 8, (d) =>
      municipalityHistory(m, d.key)
        .then((list) => ({ date: d.iso, price: list.find((s) => s.id === id)?.prices[fuel] ?? null, ok: true }))
        .catch(() => ({ date: d.iso, price: null, ok: false })),
    ),
    municipalityStations(m).catch(() => null),
  ]);
  const todayPrice = today?.stations.find((s) => s.id === id)?.prices[fuel] ?? null;
  const failed = !today || hist.some((h) => !h.ok);
  const body: HistoryResponse = { fuel, points: [...hist.map(({ date, price }) => ({ date, price })), { date: daysAgo(0).iso, price: todayPrice }] };
  return NextResponse.json(body, {
    headers: { "Cache-Control": failed ? "public, s-maxage=120" : "public, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
