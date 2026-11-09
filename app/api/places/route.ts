import { NextResponse, type NextRequest } from "next/server";
import type { Place } from "@/lib/types";

/**
 * Buscador de sitios y direcciones con Photon (OpenStreetMap, gratuito).
 * Si algún día se queda corto, se cambia aquí por otro geocodificador sin tocar el front.
 */
type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ places: [] });
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "15");
  url.searchParams.set("bbox", "-18.5,27.5,4.6,44");
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "gasolineras-cerca/0.1 (app de precios de carburantes)" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const json = (await res.json()) as { features: PhotonFeature[] };
    const seen = new Set<string>();
    const places: Place[] = [];
    // Primero ciudades y pueblos, luego barrios y calles, y al final sitios concretos (estaciones, tiendas…)
    const rank = (f: PhotonFeature) => {
      const t = f.properties.type;
      return t === "city" ? 0 : t === "district" || t === "locality" ? 1 : t === "street" ? 2 : 3;
    };
    const features = json.features.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i);
    for (const { f } of features) {
      const p = f.properties;
      if (p.countrycode && p.countrycode !== "ES") continue;
      // Provincias, comarcas y comunidades: su "centro" cae en mitad del campo y no sirve como destino
      if (p.type === "county" || p.type === "state" || p.type === "country") continue;
      if (p.osm_key === "emergency" || p.osm_key === "man_made" || p.osm_key === "power") continue;
      const street = [p.street, p.housenumber].filter(Boolean).join(" ");
      const label = p.name || street || p.city || "";
      if (!label) continue;
      const detail = [p.name && street ? street : null, p.city && p.city !== label ? p.city : null, p.county ?? p.state]
        .filter(Boolean)
        .join(", ");
      const key = `${label}|${detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({ label, detail, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
      if (places.length >= 6) break;
    }
    return NextResponse.json({ places }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (e) {
    return NextResponse.json({ places: [], error: (e as Error).message }, { status: 502 });
  }
}
