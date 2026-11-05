import { NextResponse, type NextRequest } from "next/server";
import { edge, validId } from "@/lib/supabase";
import type { LiveResponse } from "@/lib/chargers";

export const maxDuration = 30;

/** Estado en tiempo real (libre / ocupado) de los puntos de una ubicación, vía REVE */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  try {
    const r = await edge<LiveResponse>("reve-live", `location=${encodeURIComponent(id)}`);
    const body: LiveResponse = { checked: r.checked, evses: r.evses };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ error: "Ahora mismo no podemos consultar la disponibilidad" }, { status: 502 });
  }
}
