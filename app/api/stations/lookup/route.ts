import { NextResponse, type NextRequest } from "next/server";
import { inBatches, daysAgo, municipalityHistory, municipalityStations } from "@/lib/ministry";
import type { Prices, Station } from "@/lib/types";

export const maxDuration = 30;

/** Varias gasolineras a la vez (favoritas): ?items=1736:861,4410:937 → precio actual y de ayer */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("items") ?? "";
  const items = raw
    .split(",")
    .map((p) => p.split(":"))
    .filter(([id, m]) => /^\d{1,6}$/.test(id ?? "") && /^\d{1,5}$/.test(m ?? ""))
    .slice(0, 40);
  // Como mucho 10 municipios por petición (cada uno son 2 consultas al Ministerio)
  const muns = [...new Set(items.map(([, m]) => m))].slice(0, 10);
  const yKey = daysAgo(1).key;
  const data = await inBatches(muns, 4, async (m) => {
      const [cur, yest] = await Promise.all([
        municipalityStations(m).catch(() => null),
        municipalityHistory(m, yKey).catch(() => null),
      ]);
      return { m, cur, yest };
  });
  const out: { station: Station; yesterday: Prices | null }[] = [];
  let updatedAt: string | null = null;
  for (const [id, m] of items) {
    const d = data.find((x) => x.m === m);
    const st = d?.cur?.stations.find((s) => s.id === id);
    if (!st) continue;
    updatedAt = d?.cur?.updatedAt ?? updatedAt;
    out.push({ station: st, yesterday: d?.yest?.find((s) => s.id === id)?.prices ?? null });
  }
  // Si el Ministerio ha fallado en algún municipio, no guardar la respuesta incompleta mucho rato
  const failed = data.some((d) => !d.cur);
  return NextResponse.json(
    { updatedAt, items: out, partial: failed },
    { headers: { "Cache-Control": failed ? "public, s-maxage=60" : "public, s-maxage=600, stale-while-revalidate=1800" } },
  );
}
