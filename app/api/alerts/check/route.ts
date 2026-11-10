import { NextResponse, type NextRequest } from "next/server";
import { checkAlerts, checkFavDrops, parseAlertSpecs, parseFavItems } from "@/lib/alertCheck";
import { isFuelKey, type FuelKey } from "@/lib/fuels";
import { madridDate } from "@/lib/format";

export const maxDuration = 60;

/**
 * Comprueba un grupo de alertas de precio y devuelve las que se cumplen, con el texto del aviso.
 * No guarda nada: la llama la función "push" de Supabase para los avisos con la app cerrada.
 */
export async function POST(req: NextRequest) {
  const text = await req.text();
  if (text.length > 20_000) return NextResponse.json({ error: "Petición demasiado grande" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const alerts = parseAlertSpecs(body?.alerts);
  const favs = parseFavItems(body?.favs);
  const favFuels = (Array.isArray(body?.favFuels) ? body.favFuels : []).filter(isFuelKey).slice(0, 8) as FuelKey[];
  const disc = typeof body?.disc === "string" ? body.disc.slice(0, 600) : "";
  const [a, f] = await Promise.all([checkAlerts(alerts, disc), checkFavDrops(favs, favFuels).catch(() => [])]);
  return NextResponse.json({ day: madridDate(), alerts: a, favs: f }, { headers: { "Cache-Control": "no-store" } });
}
