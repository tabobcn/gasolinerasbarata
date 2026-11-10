import { NextResponse, type NextRequest } from "next/server";
import { edge, groupIds, rpc, validId } from "@/lib/supabase";
import { sameSite, type ChargerDetailResponse, type LiveResponse } from "@/lib/chargers";

export const maxDuration = 30;

/** Estado en tiempo real (libre / ocupado) de los puntos de un sitio, vía REVE */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  let ids = groupIds(req.nextUrl.searchParams.get("g"), id);
  if (ids.length > 1) {
    // Cada consulta gasta del cupo compartido de REVE: solo se aceptan postes del mismo sitio, venga lo que venga en la URL
    const get = (x: string) => rpc<ChargerDetailResponse | null>("charger_detail", { p_id: x }).catch(() => null);
    const [main, ...rest] = await Promise.all(ids.map(get));
    ids = [id, ...ids.slice(1).filter((_, i) => main?.item && rest[i]?.item && sameSite(main.item, rest[i]!.item))];
  }
  const res = await Promise.allSettled(ids.map((x) => edge<LiveResponse>("reve-live", `location=${encodeURIComponent(x)}`)));
  const ok = res.filter((r): r is PromiseFulfilledResult<LiveResponse> => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) return NextResponse.json({ error: "Ahora mismo no podemos consultar la disponibilidad" }, { status: 502 });
  const body: LiveResponse = { checked: ok[0].checked, evses: ok.flatMap((r) => r.evses) };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
