import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/config";

/** Opiniones de "Danos tu opinión". Se guardan en Supabase (tabla feedback); solo el autor de la app las lee. */

// Freno sencillo por dirección: 5 opiniones cada 10 minutos (además del límite diario de la base de datos)
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const text = await req.text();
  if (text.length > 6000) return NextResponse.json({ error: "El mensaje es demasiado largo" }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const message = clean(body.message, 2000);
  if (message.length < 3) return NextResponse.json({ error: "Escribe un poco más" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (tooMany(ip)) return NextResponse.json({ error: "Has mandado varias opiniones seguidas. Prueba otra vez en unos minutos." }, { status: 429 });
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_feedback`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        p_message: message,
        p_contact: clean(body.contact, 200) || null,
        p_app: body.app === "android" ? "android" : "web",
        p_version: clean(body.version, 20) || null,
        p_page: clean(body.page, 200) || null,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se ha podido enviar ahora mismo. Prueba en un rato." }, { status: 502 });
  }
}
