import { NextResponse, type NextRequest } from "next/server";
import { rpc, validId } from "@/lib/supabase";
import type { ChargerDetailResponse } from "@/lib/chargers";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  try {
    const body = await rpc<ChargerDetailResponse | null>("charger_detail", { p_id: id });
    if (!body?.item) return NextResponse.json({ error: "No encontramos este punto de recarga" }, { status: 404 });
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
