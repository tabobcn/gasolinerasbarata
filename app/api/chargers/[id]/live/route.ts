import { NextResponse, type NextRequest } from "next/server";
import { edge, groupIds, validId } from "@/lib/supabase";
import type { LiveResponse } from "@/lib/chargers";

export const maxDuration = 30;

/** Estado en tiempo real (libre / ocupado) de los puntos de un sitio, vía REVE */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  const ids = groupIds(req.nextUrl.searchParams.get("g"), id);
  const res = await Promise.allSettled(ids.map((x) => edge<LiveResponse>("reve-live", `location=${encodeURIComponent(x)}`)));
  const ok = res.filter((r): r is PromiseFulfilledResult<LiveResponse> => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) return NextResponse.json({ error: "Ahora mismo no podemos consultar la disponibilidad" }, { status: 502 });
  const body: LiveResponse = { checked: ok[0].checked, evses: ok.flatMap((r) => r.evses) };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
