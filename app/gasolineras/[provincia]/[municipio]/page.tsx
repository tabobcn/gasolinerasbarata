import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Crumbs, SeoStationRow, SummaryTable } from "@/components/seo/SeoBits";
import { cheapestList, fmtLongDate, fuelSummary, municipalitiesOf, provinceBySlug, provinceData, provinceSlug, SEO_FUELS, type Municipality } from "@/lib/seo";
import { haversineKm } from "@/lib/geo";
import { areasOf, chargerGrid, countNear } from "@/lib/seoChargers";
import { SITE_URL } from "@/lib/config";
import { fmtPrice } from "@/lib/format";
import { fuelByKey } from "@/lib/fuels";

export const revalidate = 1800;
export const dynamicParams = true;
export async function generateStaticParams() {
  return []; // se generan al primer acceso y se guardan 30 min
}

type Props = { params: Promise<{ provincia: string; municipio: string }> };

async function load(params: Props["params"]) {
  const { provincia, municipio } = await params;
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
  const near = muns
    .filter((m) => m.id !== mun.id)
    .map((m) => ({ m, d: haversineKm(mun.lat, mun.lon, m.lat, m.lon) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 12)
    .map((x) => x.m);
  const spot = g95.cheapest ?? goa.cheapest ?? mun;
  const appHere = `lat=${spot.lat.toFixed(4)}&lon=${spot.lon.toFixed(4)}`;
  const cents = (a: number, b: number) => Math.round((b - a) * 100);
  // ¿Hay cargadores en el municipio? Entonces se enlaza su página; si no, la búsqueda de la app
  const evArea = areasOf([mun], here).get(mun.id)!;
  const evCount = await chargerGrid()
    .then((g) => countNear(g, evArea.lat, evArea.lon, evArea.km))
    .catch(() => 0);

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
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
          <a href={`/?${appHere}`} className="btn primary grow">
            Abrir en la app
          </a>
          {evCount > 0 ? (
            <Link href={`/cargadores/${slug}/${mun.slug}`} className="btn soft grow">
              Cargadores en {mun.name}
            </Link>
          ) : (
            <a href={`/carga?${appHere}`} className="btn soft grow">
              Cargadores
            </a>
          )}
        </div>

        <SummaryTable rows={sums} compare={provAvg} />

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
              {near.map((m) => (
                <li key={m.id}>
                  <Link href={`/gasolineras/${slug}/${m.slug}`} className="seo-link">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="source">
          Fuente: Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). Precios por litro con impuestos; pueden cambiar a
          lo largo del día. <Link href={`/gasolineras/${slug}`}>Ver toda la provincia de {p.name}</Link>.
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
