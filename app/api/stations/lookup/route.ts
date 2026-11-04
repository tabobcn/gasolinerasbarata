import { NextResponse, type NextRequest } from "next/server";
import { daysAgo, municipalityHistory, municipalityStations } from "@/lib/ministry";
import type { Prices, Station } from "@/lib/types";

export const maxDuration = 30;

/** Varias gasolineras a la vez (favoritas): ?items=1736:861,4410:937 → precio actual y de ayer */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("items") ?? "";
  const items = raw
    .split(",")
    .map((p) => p.split(":"))
    .filter(([id, m]) => /^\d+$/.test(id ?? "") && /^\d+$/.test(m ?? ""))
    .slice(0, 40);
  const muns = [...new Set(items.map(([, m]) => m))];
  const yKey = daysAgo(1).key;
  const data = await Promise.all(
    muns.map(async (m) => {
      const [cur, yest] = await Promise.all([
        municipalityStations(m).catch(() => null),
        municipalityHistory(m, yKey).catch(() => null),
      ]);
      return { m, cur, yest };
    }),
  );
  const out: { station: Station; yesterday: Prices | null }[] = [];
  let updatedAt: string | null = null;
  for (const [id, m] of items) {
    const d = data.find((x) => x.m === m);
    const st = d?.cur?.stations.find((s) => s.id === id);
    if (!st) continue;
    updatedAt = d?.cur?.updatedAt ?? updatedAt;
    out.push({ station: st, yesterday: d?.yest?.find((s) => s.id === id)?.prices ?? null });
  }
  return NextResponse.json({ updatedAt, items: out }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
}
