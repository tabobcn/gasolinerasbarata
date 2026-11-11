import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { municipalitiesOf, PROVINCES, provinceData, provinceSlug } from "@/lib/seo";
import { areasOf, chargerGrid, countNear } from "@/lib/seoChargers";

export const revalidate = 86400; // una vez al día

/** Mapa del sitio para Google: páginas de la app, provincias y municipios con gasolinera o con cargadores */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const out: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1, lastModified: now },
    { url: `${SITE_URL}/carga`, changeFrequency: "daily", priority: 0.6, lastModified: now },
    { url: `${SITE_URL}/gasolineras`, changeFrequency: "daily", priority: 0.8, lastModified: now },
    { url: `${SITE_URL}/cargadores`, changeFrequency: "weekly", priority: 0.6, lastModified: now },
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/instalar`, changeFrequency: "yearly", priority: 0.3 },
  ];
  for (const p of PROVINCES) {
    out.push({ url: `${SITE_URL}/gasolineras/${provinceSlug(p)}`, changeFrequency: "hourly", priority: 0.7, lastModified: now });
    out.push({ url: `${SITE_URL}/cargadores/${provinceSlug(p)}`, changeFrequency: "daily", priority: 0.5, lastModified: now });
  }
  // Para saber qué municipios tienen cargadores (si falla, hoy no salen esas páginas)
  const grid = await chargerGrid().catch(() => null);
  // Municipios: de 8 en 8 provincias para no saturar al Ministerio. Si falla alguna, se queda sin sus municipios hoy.
  for (let i = 0; i < PROVINCES.length; i += 8) {
    const batch = await Promise.all(PROVINCES.slice(i, i + 8).map((p) => provinceData(p.id).then((d) => ({ p, d })).catch(() => null)));
    for (const r of batch) {
      if (!r) continue;
      const muns = municipalitiesOf(r.d.stations);
      const areas = grid ? areasOf(muns, r.d.stations) : null;
      for (const m of muns) {
        out.push({ url: `${SITE_URL}/gasolineras/${provinceSlug(r.p)}/${m.slug}`, changeFrequency: "hourly", priority: 0.6, lastModified: now });
        const a = areas?.get(m.id);
        if (grid && a && countNear(grid, a.lat, a.lon, a.km) > 0) {
          out.push({ url: `${SITE_URL}/cargadores/${provinceSlug(r.p)}/${m.slug}`, changeFrequency: "daily", priority: 0.5, lastModified: now });
        }
      }
    }
  }
  return out;
}
