import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Crumbs } from "@/components/seo/SeoBits";
import { municipalitiesOf, provinceBySlug, provinceData, provinceSlug } from "@/lib/seo";
import { areasOf, chargerGrid, countNear } from "@/lib/seoChargers";
import { SITE_URL } from "@/lib/config";

export const revalidate = 21600; // 6 h
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ provincia: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = provinceBySlug((await params).provincia);
  if (!p) return {};
  return {
    title: `Cargadores para coche eléctrico en ${p.name}`,
    description: `Puntos de recarga para coche eléctrico en la provincia de ${p.name}, municipio a municipio: precio por kWh, potencia y si funcionan. Datos de Red Eléctrica (REVE).`,
    alternates: { canonical: `${SITE_URL}/cargadores/${provinceSlug(p)}` },
  };
}

export default async function Page({ params }: Props) {
  const p = provinceBySlug((await params).provincia);
  if (!p) notFound();
  const slug = provinceSlug(p);
  const [data, grid] = await Promise.all([provinceData(p.id).catch(() => null), chargerGrid().catch(() => null)]);
  if (!data || !grid) {
    return (
      <div className="screen with-nav">
        <div className="stack-16 pad-x top seo">
          <h1 className="h1 big">Cargadores en {p.name}</h1>
          <p className="b15">Ahora mismo no podemos cargar los puntos de recarga. Vuelve a intentarlo en unos minutos.</p>
        </div>
        <BottomNav />
      </div>
    );
  }
  const muns = municipalitiesOf(data.stations);
  const areas = areasOf(muns, data.stations);
  const rows = muns
    .map((m) => ({ m, n: countNear(grid, areas.get(m.id)!.lat, areas.get(m.id)!.lon, areas.get(m.id)!.km) }))
    .filter((x) => x.n > 0);

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
        <Crumbs items={[{ href: "/cargadores", label: "Cargadores" }, { label: p.name }]} />
        <h1 className="h1 big">Cargadores para coche eléctrico en {p.name}</h1>
        <p className="b15 lead">
          {rows.length} municipios de {p.name} tienen puntos de recarga en el casco urbano o muy cerca. Elige el tuyo para ver precios, potencia y si funcionan.
        </p>
        <ul className="seo-grid">
          {rows.map(({ m, n }) => (
            <li key={m.id}>
              <Link href={`/cargadores/${slug}/${m.slug}`} className="seo-link">
                {m.name}
                <span className="muted b12 block">
                  {n} {n === 1 ? "ubicación" : "ubicaciones"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="source">
          Fuente: Red Eléctrica de España (REVE, Registro de Vehículo Eléctrico). Se cuentan las ubicaciones a pocos kilómetros del centro de cada municipio.{" "}
          <Link href={`/gasolineras/${slug}`}>Gasolineras en {p.name}</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
