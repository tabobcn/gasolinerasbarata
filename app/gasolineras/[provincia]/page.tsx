import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Crumbs, SeoStationRow, SummaryTable } from "@/components/seo/SeoBits";
import { cheapestList, fmtLongDate, fuelSummary, municipalitiesOf, PROVINCES, provinceBySlug, provinceData, provinceSlug, SEO_FUELS } from "@/lib/seo";
import { SITE_URL } from "@/lib/config";
import { fmtPrice } from "@/lib/format";

export const revalidate = 1800;
export const dynamicParams = true;
export async function generateStaticParams() {
  return []; // se generan al primer acceso y se guardan 30 min
}

type Props = { params: Promise<{ provincia: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = provinceBySlug((await params).provincia);
  if (!p) return {};
  return {
    title: `Gasolineras más baratas en ${p.name} hoy`,
    description: `Precio de la gasolina y el diésel hoy en la provincia de ${p.name}: las gasolineras más baratas y la media por municipio, con datos oficiales del Ministerio.`,
    alternates: { canonical: `${SITE_URL}/gasolineras/${provinceSlug(p)}` },
  };
}

export default async function Page({ params }: Props) {
  const p = provinceBySlug((await params).provincia);
  if (!p) notFound();
  const data = await provinceData(p.id).catch(() => null);
  if (!data) {
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
  const muns = municipalitiesOf(data.stations);
  const sums = SEO_FUELS.map((f) => fuelSummary(data.stations, f));
  const g95 = sums[0];
  const goa = sums[1];
  const slug = provinceSlug(p);

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
        <Crumbs items={[{ href: "/gasolineras", label: "Provincias" }, { label: p.name }]} />
        <h1 className="h1 big">Gasolineras más baratas en {p.name} hoy</h1>
        <p className="muted b13">
          {data.stations.length} gasolineras · Precios oficiales actualizados el {fmtLongDate(data.updatedAt)}
        </p>
        {g95.cheapest && goa.cheapest && (
          <p className="b15 lead">
            Hoy la gasolina 95 más barata de la provincia está a <strong>{fmtPrice(g95.min)} €/l</strong> en {g95.cheapest.name} ({g95.cheapest.mun}), y el diésel a{" "}
            <strong>{fmtPrice(goa.min)} €/l</strong> en {goa.cheapest.name} ({goa.cheapest.mun}). La media es de {fmtPrice(g95.avg)} € y {fmtPrice(goa.avg)} €.
          </p>
        )}
        <a href="/" className="btn primary big">
          Ver las más baratas cerca de mí
        </a>
        <SummaryTable rows={sums} />

        {[g95, goa].map((s) =>
          s.count ? (
            <section key={s.fuel} className="stack-8" aria-labelledby={`top-${s.fuel}`}>
              <h2 className="h2" id={`top-${s.fuel}`}>
                Las 10 más baratas de {s.fuel === "g95" ? "gasolina 95" : "diésel"}
              </h2>
              <ol className="seo-list">
                {cheapestList(data.stations, s.fuel, 10).map((st, i) => (
                  <SeoStationRow key={st.id} s={st} fuel={s.fuel} avg={s.avg} rank={i + 1} />
                ))}
              </ol>
            </section>
          ) : null,
        )}

        <section className="stack-8" aria-labelledby="muns">
          <h2 className="h2" id="muns">
            Precios por municipio
          </h2>
          <ul className="seo-grid">
            {muns.map((m) => (
              <li key={m.id}>
                <Link href={`/gasolineras/${slug}/${m.slug}`} className="seo-link">
                  {m.name} <span className="muted b12">({m.count})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="stack-8" aria-labelledby="otras">
          <h2 className="h3" id="otras">
            Otras provincias
          </h2>
          <p className="b13 seo-inline">
            {PROVINCES.filter((x) => x.id !== p.id).map((x, i) => (
              <span key={x.id}>
                {i > 0 && " · "}
                <Link href={`/gasolineras/${provinceSlug(x)}`}>{x.name}</Link>
              </span>
            ))}
          </p>
        </section>
        <p className="source">
          Fuente: Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). Precios por litro con impuestos.{" "}
          <Link href={`/cargadores/${slug}`}>Cargadores para coche eléctrico en {p.name}</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
