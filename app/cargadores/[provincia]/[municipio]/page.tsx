import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Crumbs } from "@/components/seo/SeoBits";
import { municipalitiesOf, provinceBySlug, provinceData, provinceSlug, type Municipality } from "@/lib/seo";
import { areaChargers, areasOf, chargerGrid, countNear, KW_BANDS, type Area, type AreaChargers } from "@/lib/seoChargers";
import { chargerHref, cpoStyle, datesText } from "@/lib/chargers";
import { haversineKm } from "@/lib/geo";
import { SITE_URL } from "@/lib/config";

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() {
  return []; // se generan al primer acceso y se guardan 1 h
}

type Props = { params: Promise<{ provincia: string; municipio: string }> };

const euro = (n: number) => n.toFixed(2).replace(".", ",");
const kwText = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} kW`;

async function load(params: Props["params"]) {
  const { provincia, municipio } = await params;
  const p = provinceBySlug(provincia);
  if (!p) return null;
  const data = await provinceData(p.id).catch(() => null);
  if (!data) return { p, ok: false as const };
  const muns = municipalitiesOf(data.stations);
  const mun = muns.find((m) => m.slug === municipio) ?? null;
  if (!mun) return { p, ok: true as const, mun: null, muns, areas: new Map<string, Area>(), ev: null as AreaChargers | null };
  const areas = areasOf(muns, data.stations);
  const ev = await areaChargers(areas.get(mun.id)!).catch(() => null);
  return { p, ok: true as const, mun, muns, areas, ev };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r?.ok || !r.mun) return {};
  const n = r.ev?.sites.length ?? 0;
  const cheapest = r.ev?.sites.find((x) => x.price != null && !x.doubtful);
  return {
    title: `Cargadores para coche eléctrico en ${r.mun.name}`,
    description:
      `Dónde cargar el coche eléctrico en ${r.mun.name} (${r.p.name}): ${n} sitios de recarga con precio por kWh, potencia y si funcionan` +
      (cheapest ? `. Desde ${euro(cheapest.price!)} €/kWh.` : "."),
    alternates: { canonical: `${SITE_URL}/cargadores/${provinceSlug(r.p)}/${r.mun.slug}` },
    // Sin cargadores (o sin datos ahora mismo) no tiene sentido que salga en Google
    ...(n === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Page({ params }: Props) {
  const r = await load(params);
  if (!r) notFound();
  if (r.ok && !r.mun) notFound();
  const { p } = r;
  const slug = provinceSlug(p);
  if (!r.ok || !r.mun || !r.ev) {
    return (
      <div className="screen with-nav">
        <div className="stack-16 pad-x top seo">
          <h1 className="h1 big">Cargadores en {r.ok && r.mun ? r.mun.name : p.name}</h1>
          <p className="b15">Ahora mismo no podemos cargar los puntos de recarga. Vuelve a intentarlo en unos minutos.</p>
        </div>
        <BottomNav />
      </div>
    );
  }
  const { mun, muns, areas, ev } = r;
  const area = areas.get(mun.id)!;
  const sites = ev.sites;
  const priced = sites.filter((x) => x.price != null && !x.doubtful);
  const cheapest = priced[0];
  const fast = sites.filter((x) => x.maxKw >= 50).length;
  const bands = KW_BANDS.map((b) => {
    const list = sites.filter((x) => b.test(x.maxKw));
    const withPrice = list.filter((x) => x.price != null && !x.doubtful);
    return { ...b, count: list.length, min: withPrice.length ? Math.min(...withPrice.map((x) => x.price!)) : null };
  }).filter((b) => b.count > 0);
  const appHere = `lat=${area.lat.toFixed(4)}&lon=${area.lon.toFixed(4)}`;

  // Municipios cercanos que también tienen cargadores
  const grid = await chargerGrid().catch(() => null);
  const near: Municipality[] = muns
    .filter((m) => m.id !== mun.id)
    .map((m) => ({ m, d: haversineKm(mun.lat, mun.lon, m.lat, m.lon) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 30)
    .filter(({ m }) => !grid || countNear(grid, areas.get(m.id)!.lat, areas.get(m.id)!.lon, areas.get(m.id)!.km) > 0)
    .slice(0, 12)
    .map((x) => x.m);

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
        <Crumbs items={[{ href: "/cargadores", label: "Cargadores" }, { href: `/cargadores/${slug}`, label: p.name }, { label: mun.name }]} />
        <h1 className="h1 big">Cargadores para coche eléctrico en {mun.name}</h1>
        <p className="muted b13">
          {sites.length} {sites.length === 1 ? "sitio" : "sitios"} de recarga · {ev.points} {ev.points === 1 ? "punto" : "puntos"} · a menos de {String(area.km).replace(".", ",")} km del centro
        </p>
        {sites.length > 0 ? (
          <p className="b15 lead">
            En {mun.name} y alrededores hay <strong>{sites.length}</strong> {sites.length === 1 ? "sitio" : "sitios"} para cargar el coche eléctrico
            {fast > 0 ? (
              <>
                , <strong>{fast}</strong> con carga rápida (50 kW o más)
              </>
            ) : (
              ", todos de carga normal"
            )}
            .
            {cheapest && (
              <>
                {" "}
                El más barato con precio publicado es <strong>{cheapest.name}</strong>, a <strong>{euro(cheapest.price!)} €/kWh</strong>.
              </>
            )}
          </p>
        ) : (
          <p className="b15 lead">No tenemos ningún punto de recarga registrado en {mun.name} ni a menos de {String(area.km).replace(".", ",")} km. Mira en los municipios cercanos.</p>
        )}
        <div className="row-10 wrap">
          <a href={`/carga?${appHere}`} className="btn primary grow">
            Abrir en la app
          </a>
          <Link href={`/gasolineras/${slug}/${mun.slug}`} className="btn soft grow">
            Gasolineras
          </Link>
        </div>

        {bands.length > 0 && (
          <div className="card tight">
            <table className="seo-table">
              <caption className="sr-only">Sitios de recarga por potencia y precio más bajo</caption>
              <thead>
                <tr>
                  <th scope="col">Potencia</th>
                  <th scope="col">Sitios</th>
                  <th scope="col">Desde</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.id}>
                    <th scope="row">{b.label}</th>
                    <td>{b.count}</td>
                    <td>{b.min != null ? <strong className="blue-ink">{euro(b.min)} €/kWh</strong> : <span className="muted">sin precio</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sites.length > 0 && (
          <section className="stack-8" aria-labelledby="lista">
            <h2 className="h2" id="lista">
              Dónde cargar, de más barato a más caro
            </h2>
            <ol className="seo-list">
              {sites.slice(0, 60).map((x, i) => {
                const st = cpoStyle(x.s.ch.party, x.s.ch.operator);
                return (
                  <li key={x.s.ch.id}>
                    <Link href={chargerHref(x.s.ch)} className="row-card">
                      <span className="seo-rank" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span aria-hidden="true" className="cpo-tile" style={{ width: 36, height: 36, borderRadius: 11, background: st.bg, color: st.fg, fontSize: st.mark.length > 2 ? 11 : 13 }}>
                        {st.mark}
                      </span>
                      <span className="col-2 grow min0">
                        <span className="b15 ellipsis">{x.name}</span>
                        <span className="muted b12 ellipsis">
                          {x.address ? `${x.address} · ` : ""}
                          {x.s.plugs || "Sin datos de enchufes"}
                        </span>
                        <span className="muted b12">
                          {x.points} {x.points === 1 ? "punto" : "puntos"}
                          {x.maxKw > 0 ? ` · hasta ${kwText(x.maxKw)}` : ""}
                          {x.s.allDown ? " · fuera de servicio" : ""}
                        </span>
                      </span>
                      <span className="col-2 end">
                        <span className={`price-sm${x.price != null ? " blue-ink" : " muted"}`}>{x.price != null ? `${euro(x.price)} €` : "—"}</span>
                        <span className="muted b12 nowrap">{x.price == null ? "sin precio" : x.doubtful ? "a confirmar" : "por kWh"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {near.length > 0 && (
          <section className="stack-8" aria-labelledby="cerca">
            <h2 className="h3" id="cerca">
              Cargadores en municipios cercanos
            </h2>
            <ul className="seo-grid">
              {near.map((m) => (
                <li key={m.id}>
                  <Link href={`/cargadores/${slug}/${m.slug}`} className="seo-link">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="source">
          Fuente: Red Eléctrica de España (REVE, Registro de Vehículo Eléctrico). {datesText(ev.updated, ev.prices)} Precio por kWh con IVA cuando el operador lo
          indica, tal como lo publica cada operador; un precio «a confirmar» es demasiado bajo para ser real. REVE no indica el municipio de cada punto: se
          muestran los que están a menos de {String(area.km).replace(".", ",")} km del centro. <Link href={`/cargadores/${slug}`}>Toda la provincia de {p.name}</Link>.
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
