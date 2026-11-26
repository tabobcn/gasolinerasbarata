import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Crumbs, Faq, SeoStationRow, Sparkline, stationLink, SummaryTable } from "@/components/seo/SeoBits";
import { JsonLd } from "@/components/seo/JsonLd";
import { cheapestList, fmtLongDate, fuelSummary, municipalitiesOf, provinceBySlug, provinceData, provinceSlug, SEO_FUELS, type Municipality } from "@/lib/seo";
import { haversineKm } from "@/lib/geo";
import { areasOf, chargerGrid, countNear } from "@/lib/seoChargers";
import { SITE_URL } from "@/lib/config";
import { fmtEuros, fmtPrice } from "@/lib/format";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { municipalityTrend, nationalToday } from "@/lib/national";

export const revalidate = 900;
export const dynamicParams = true;
export async function generateStaticParams() {
  return []; // se generan al primer acceso y se guardan 15 min
}

type Props = { params: Promise<{ provincia: string; municipio: string }> };

async function load(params: Props["params"]) {
  const { provincia, municipio } = await params;
  // un nombre que no puede ser de un municipio se descarta sin pedir datos
  if (!/^[a-z0-9-]{1,80}$/.test(municipio)) return null;
  const p = provinceBySlug(provincia);
  if (!p) return null;
  const data = await provinceData(p.id).catch(() => null);
  if (!data) return { p, data: null, mun: null as Municipality | null, muns: [] as Municipality[] };
  const muns = municipalitiesOf(data.stations);
  const mun = muns.find((m) => m.slug === municipio) ?? null;
  return { p, data, mun, muns };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r?.mun) return {};
  const g95 = fuelSummary(r.data!.stations.filter((s) => s.munId === r.mun!.id), "g95");
  return {
    title: `Gasolineras más baratas en ${r.mun.name} hoy`,
    description:
      `Precio de la gasolina y el diésel hoy en ${r.mun.name} (${r.p.name}): ${r.mun.count} gasolineras ordenadas de más barata a más cara` +
      (g95.min != null ? `. Gasolina 95 desde ${fmtPrice(g95.min)} €/l.` : "."),
    alternates: { canonical: `${SITE_URL}/gasolineras/${provinceSlug(r.p)}/${r.mun.slug}` },
  };
}

export default async function Page({ params }: Props) {
  const r = await load(params);
  if (!r) notFound();
  const { p, data, mun, muns } = r;
  if (data && !mun) notFound();
  if (!data || !mun) {
    return (
      <div className="screen with-nav">
        <div className="stack-16 pad-x top seo">
          <h1 className="h1 big">Gasolineras en {p.name}</h1>
          <p className="b15">Ahora mismo no podemos cargar los precios del Ministerio. Vuelve a intentarlo en unos minutos.</p>
        </div>
        <BottomNav />
      </div>
    );
  }
  const slug = provinceSlug(p);
  const here = data.stations.filter((s) => s.munId === mun.id);
  const sums = SEO_FUELS.map((f) => fuelSummary(here, f));
  const provAvg = Object.fromEntries(SEO_FUELS.map((f) => [f, fuelSummary(data.stations, f).avg]));
  const [g95, goa] = sums;
  const cents = (a: number, b: number) => Math.round((b - a) * 100);
  // ¿Hay cargadores en el municipio? Entonces se enlaza su página; si no, la búsqueda de la app
  const evArea = areasOf([mun], here).get(mun.id)!;
  const evCount = await chargerGrid()
    .then((g) => countNear(g, evArea.lat, evArea.lon, evArea.km))
    .catch(() => 0);
  const near = muns
    .filter((m) => m.id !== mun.id)
    .map((m) => ({ m, d: haversineKm(mun.lat, mun.lon, m.lat, m.lon), from: fuelSummary(data.stations.filter((s) => s.munId === m.id), "g95").min }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
  // Media de España y evolución del municipio: si fallan, la página sale igual sin esas partes
  const [spain, trend] = await Promise.all([
    nationalToday()
      .then((n) => n.avg)
      .catch(() => undefined),
    municipalityTrend(mun.id, here).catch(() => []),
  ]);
  // Lo que se ahorra eligiendo bien dentro del municipio (el combustible con más diferencia de los dos principales)
  const TANK = 50;
  const spread = [g95, goa]
    .filter((s) => s.count > 1 && s.min != null && s.max != null && s.max - s.min >= 0.005)
    .sort((a, b) => b.max! - b.min! - (a.max! - a.min!))[0];
  const trendFuels: FuelKey[] = (["g95", "goa", "g98", "glp"] as FuelKey[]).filter((f) => trend.filter((t) => t.avg[f] != null).length >= 3);
  const fuelName = (f: FuelKey) => fuelByKey(f)?.label.toLowerCase() ?? f;
  const faq: { q: string; a: string }[] = [];
  if (g95.cheapest || goa.cheapest) {
    const parts = [g95, goa]
      .filter((s) => s.cheapest)
      .map((s) => `para ${fuelName(s.fuel)}, ${s.cheapest!.name} (${s.cheapest!.address}) a ${fmtPrice(s.min)} €/l`);
    faq.push({ q: `¿Cuál es la gasolinera más barata de ${mun.name}?`, a: `Con los precios oficiales de hoy, ${parts.join("; y ")}. Los precios cambian a lo largo del día.` });
  }
  if (spread) {
    faq.push({
      q: `¿Cuánto se ahorra eligiendo bien en ${mun.name}?`,
      a: `En ${fuelName(spread.fuel)} hay ${cents(spread.min!, spread.max!)} céntimos por litro entre la gasolinera más cara y la más barata del municipio: unos ${fmtEuros((spread.max! - spread.min!) * TANK)} € en un depósito de ${TANK} litros.`,
    });
  }
  if (spain?.goa != null && goa.avg != null) {
    const d = goa.avg - spain.goa;
    faq.push({
      q: `¿Es caro repostar en ${mun.name}?`,
      a: `La media del diésel en ${mun.name} es de ${fmtPrice(goa.avg)} €/l, ${Math.abs(cents(spain.goa, goa.avg))} céntimos ${d < 0 ? "por debajo" : "por encima"} de la media de España (${fmtPrice(spain.goa)} €/l).`,
    });
  }
  faq.push({
    q: "¿De dónde salen estos precios?",
    a: "Son los precios oficiales que cada gasolinera comunica al Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). Se actualizan cada media hora; el que vale es el del surtidor.",
  });
  if (evCount > 0) {
    faq.push({ q: `¿Hay cargadores para coche eléctrico en ${mun.name}?`, a: `Sí, hay ${evCount} puntos de recarga en la zona, con su precio y su estado cuando el operador lo publica (datos de Red Eléctrica de España).` });
  }
  const spot = g95.cheapest ?? goa.cheapest ?? mun;
  const appHere = `lat=${spot.lat.toFixed(4)}&lon=${spot.lon.toFixed(4)}`;

  // Las mismas gasolineras de la lista de gasolina 95 (o diésel), descritas para los buscadores
  const listFuel = g95.count > 0 ? "g95" : "goa";
  const listed = cheapestList(here, listFuel, 30);
  const listLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Gasolineras más baratas en ${mun.name}`,
    numberOfItems: listed.length,
    itemListElement: listed.map((st, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "GasStation",
        name: st.name,
        url: `${SITE_URL}${stationLink(st)}`,
        address: {
          "@type": "PostalAddress",
          streetAddress: st.address,
          addressLocality: st.town || st.mun,
          addressRegion: p.name,
          ...(st.cp ? { postalCode: st.cp } : {}),
          addressCountry: "ES",
        },
        geo: { "@type": "GeoCoordinates", latitude: st.lat, longitude: st.lon },
      },
    })),
  };

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
        <JsonLd data={listLd} />
        <Crumbs items={[{ href: "/gasolineras", label: "Provincias" }, { href: `/gasolineras/${slug}`, label: p.name }, { label: mun.name }]} />
        <h1 className="h1 big">Gasolineras más baratas en {mun.name} hoy</h1>
        <p className="muted b13">
          {mun.count} gasolinera{mun.count === 1 ? "" : "s"} · Precios oficiales actualizados el {fmtLongDate(data.updatedAt)}
        </p>
        {g95.cheapest && g95.avg != null && (
          <p className="b15 lead">
            La gasolina 95 más barata de {mun.name} hoy está en <strong>{g95.cheapest.name}</strong> ({g95.cheapest.address}), a{" "}
            <strong>{fmtPrice(g95.min)} €/l</strong>
            {g95.count > 1 && cents(g95.min!, g95.avg) > 0 ? `, ${cents(g95.min!, g95.avg)} céntimos menos que la media del municipio (${fmtPrice(g95.avg)} €)` : ""}.
            {goa.cheapest && (
              <>
                {" "}
                El diésel más barato está en <strong>{goa.cheapest.name}</strong>, a <strong>{fmtPrice(goa.min)} €/l</strong>.
              </>
            )}
          </p>
        )}
        <div className="row-10 wrap">
          <a href={`/?${appHere}`} rel="nofollow" className="btn primary grow">
            Abrir en la app
          </a>
          {evCount > 0 ? (
            <Link href={`/cargadores/${slug}/${mun.slug}`} className="btn soft grow">
              Cargadores en {mun.name}
            </Link>
          ) : (
            <a href={`/carga?${appHere}`} rel="nofollow" className="btn soft grow">
              Cargadores
            </a>
          )}
        </div>

        {spread && (
          <div className="save-card">
            <span className="eyebrow">AHORRO ELIGIENDO BIEN</span>
            <span className="big-num">{fmtEuros((spread.max! - spread.min!) * TANK)} €</span>
            <span className="b14">
              por depósito de {TANK} litros de {fuelName(spread.fuel)}: hay {cents(spread.min!, spread.max!)} céntimos por litro entre la más cara y la más barata
              de {mun.name}, sin salir del municipio.
            </span>
          </div>
        )}

        <SummaryTable rows={sums} compare={provAvg} spain={spain} />

        {trendFuels.length > 0 && (
          <section className="stack-8" aria-labelledby="evolucion">
            <h2 className="h3" id="evolucion">
              Cómo ha cambiado el precio en el último mes
            </h2>
            <div className="spark-grid">
              {trendFuels.map((f) => (
                <Sparkline key={f} label={fuelByKey(f)?.label ?? f} points={trend.filter((t) => t.avg[f] != null).map((t) => ({ date: t.date, v: t.avg[f]! }))} />
              ))}
            </div>
            <p className="muted b12">Media de las gasolineras de {mun.name}, con los precios oficiales del Ministerio de los últimos 30 días.</p>
          </section>
        )}

        {sums
          .filter((s) => s.count > 0 && (s.fuel === "g95" || s.fuel === "goa" || here.length <= 3))
          .map((s) => (
            <section key={s.fuel} className="stack-8" aria-labelledby={`l-${s.fuel}`}>
              <h2 className="h2" id={`l-${s.fuel}`}>
                {fuelByKey(s.fuel)?.label}: de más barata a más cara
              </h2>
              <ol className="seo-list">
                {cheapestList(here, s.fuel, 30).map((st, i) => (
                  <SeoStationRow key={st.id} s={st} fuel={s.fuel} avg={s.avg} rank={i + 1} />
                ))}
              </ol>
            </section>
          ))}

        {near.length > 0 && (
          <section className="stack-8" aria-labelledby="cerca">
            <h2 className="h3" id="cerca">
              Municipios cercanos
            </h2>
            <ul className="seo-grid">
              {near.map(({ m, d, from }) => (
                <li key={m.id}>
                  <Link href={`/gasolineras/${slug}/${m.slug}`} className="seo-link">
                    {m.name}
                    <span className="sub">
                      {d < 10 ? d.toFixed(1).replace(".", ",") : Math.round(d)} km{from != null ? ` · 95 desde ${fmtPrice(from)} €` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Faq items={faq} />

        <p className="source">
          Fuente: Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). Precios por litro con impuestos; pueden cambiar a
          lo largo del día. <Link href={`/gasolineras/${slug}`}>Ver toda la provincia de {p.name}</Link>.
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
