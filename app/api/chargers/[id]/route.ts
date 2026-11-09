import { NextResponse, type NextRequest } from "next/server";
import { groupIds, rpc, validId } from "@/lib/supabase";
import { mergeChargers, sameSite, type Charger, type ChargerDetailResponse } from "@/lib/chargers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  try {
    const ids = groupIds(req.nextUrl.searchParams.get("g"), id);
    const get = (x: string) => rpc<ChargerDetailResponse | null>("charger_detail", { p_id: x });
    // Si falla el principal es un error; si falla uno de los otros postes, se enseña el resto
    const [main, ...rest] = await Promise.all([get(ids[0]), ...ids.slice(1).map((x) => get(x).catch(() => null))]);
    if (!main?.item) return NextResponse.json({ error: "No encontramos este punto de recarga" }, { status: 404 });
    // Solo se juntan los que de verdad son el mismo sitio (mismo operador y a pocos metros), venga lo que venga en la URL
    const extra = rest.map((r) => r?.item).filter((x): x is Charger => !!x && sameSite(main.item, x));
    const body: ChargerDetailResponse = { ...main, item: extra.length ? mergeChargers([main.item, ...extra]) : main.item };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
