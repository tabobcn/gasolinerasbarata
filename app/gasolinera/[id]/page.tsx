import type { Metadata } from "next";
import { cache } from "react";
import { StationDetail } from "@/components/screens/StationDetail";
import { Crumbs } from "@/components/seo/SeoBits";
import { JsonLd } from "@/components/seo/JsonLd";
import { municipalityStations } from "@/lib/ministry";
import { municipalitiesOf, provinceById, provinceData, provinceSlug } from "@/lib/seo";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { fmtPrice } from "@/lib/format";
import { SITE_URL } from "@/lib/config";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> };

const SHOW: FuelKey[] = ["g95", "goa", "g98", "glp", "goap", "e10", "g95p", "gnc"];

/** La gasolinera, leída una sola vez por visita (la usan el título y la página) */
const load = cache(async (id: string, m: string | undefined) => {
  if (!/^\d{1,6}$/.test(id) || !m || !/^\d{1,5}$/.test(m)) return null;
  try {
    const ds = await municipalityStations(m);
    const station = ds.stations.find((s) => s.id === id);
    return station ? { station, updatedAt: ds.updatedAt } : null;
  } catch {
    return null;
  }
});

/** Título y descripción propios, para que al compartir el enlace (y en Google) se vea qué gasolinera es y su precio */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { m } = await searchParams;
  const r = await load(id, m);
  // Sin datos no hay nada que enseñar a Google
  if (!r) return { title: "Ficha de la gasolinera", robots: { index: false } };
  const st = r.station;
  const prices = SHOW.filter((f) => st.prices[f] != null).map((f) => `${fuelByKey(f)!.label} ${fmtPrice(st.prices[f])} €`);
  const title = prices.length ? `${st.name} · ${prices[0]}` : st.name;
  const where = [st.address, st.town || st.mun].filter(Boolean).join(", ");
  const description = `${where}. ${prices.slice(0, 4).join(" · ")}. Precios oficiales de hoy, horario y cómo llegar.`;
  return { title, description, alternates: { canonical: `/gasolinera/${id}?m=${m}` } };
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { m } = await searchParams;
  const r = await load(id, m);
  if (!r) return <StationDetail id={id} m={m ?? null} />;
  const st = r.station;

  // Migas hacia la provincia y el municipio (si no se puede averiguar su dirección, solo la provincia)
  const prov = provinceById(st.provId);
  let munHref: string | undefined;
  if (prov) {
    const mun = await provinceData(prov.id)
      .then((d) => municipalitiesOf(d.stations).find((x) => x.id === st.munId))
      .catch(() => undefined);
    if (mun) munHref = `/gasolineras/${provinceSlug(prov)}/${mun.slug}`;
  }
  const ld = {
    "@context": "https://schema.org",
    "@type": "GasStation",
    name: st.name,
    url: `${SITE_URL}/gasolinera/${st.id}?m=${st.munId}`,
    address: { "@type": "PostalAddress", streetAddress: st.address, addressLocality: st.town || st.mun, postalCode: st.cp, addressRegion: st.prov, addressCountry: "ES" },
    geo: { "@type": "GeoCoordinates", latitude: st.lat, longitude: st.lon },
  };
  return (
    <>
      <JsonLd data={ld} />
      <StationDetail id={id} m={m ?? null} initial={{ station: st, updatedAt: r.updatedAt, yesterday: null }} />
      <div className="pad-x station-crumbs">
        <Crumbs
          items={[
            { href: "/gasolineras", label: "Gasolineras" },
            ...(prov ? [{ href: `/gasolineras/${provinceSlug(prov)}`, label: prov.name }] : []),
            ...(munHref ? [{ href: munHref, label: st.mun }] : []),
            { label: st.name },
          ]}
        />
      </div>
    </>
  );
}
