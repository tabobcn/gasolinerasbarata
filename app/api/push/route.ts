import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/config";

const FN = `${SUPABASE_URL}/functions/v1/push`;
const ACTIONS = new Set(["save", "remove", "test"]);
const DOWN = "Los avisos no están disponibles ahora mismo";

/** Clave pública del servidor de avisos (hace falta para suscribir el navegador) */
export async function GET() {
  try {
    const res = await fetch(`${FN}?action=key`, { headers: { apikey: SUPABASE_KEY }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const body = (await res.json()) as { key?: string };
    if (!res.ok || !body.key) throw new Error("sin clave");
    return NextResponse.json({ key: body.key }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: DOWN }, { status: 502 });
  }
}

/** Guardar, borrar o probar la suscripción de avisos de este navegador (lo hace la función "push" de Supabase) */
export async function POST(req: NextRequest) {
  const text = await req.text();
  if (text.length > 20_000) return NextResponse.json({ error: "Petición demasiado grande" }, { status: 413 });
  let action = "";
  try {
    action = String((JSON.parse(text) as { action?: unknown })?.action ?? "");
  } catch {
    /* se rechaza abajo */
  }
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  try {
    const res = await fetch(`${FN}?action=${action}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: text,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const out = await res.json().catch(() => ({ error: DOWN }));
    return NextResponse.json(out, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: DOWN }, { status: 502 });
  }
}
