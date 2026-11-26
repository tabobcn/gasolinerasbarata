import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { Crumbs, Faq } from "@/components/seo/SeoBits";
import { fmtLongDate, PROVINCES, provinceSlug, slugify } from "@/lib/seo";
import { NAT_FUELS, nationalView, type NationalView } from "@/lib/national";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { fmtPrice } from "@/lib/format";
import { SITE_URL } from "@/lib/config";

export const revalidate = 900;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Precio de la gasolina y el diésel hoy en España",
  description:
    "Precio medio de la gasolina y el diésel hoy en España y en cada provincia, cuánto ha cambiado desde ayer y dónde ha bajado más este mes. Precios oficiales del Ministerio, actualizados cada media hora.",
  alternates: { canonical: `${SITE_URL}/gasolineras` },
};

const signed = (d: number) => `${d < 0 ? "−" : "+"}${fmtPrice(Math.abs(d))}`;

export default async function Page() {
  const view: NationalView | null = await nationalView().catch(() => null);
  const t = view?.today;
  const y = view?.yesterday;
  const fuels = NAT_FUELS.filter((f) => t?.avg[f] != null);
  const rank = (f: FuelKey) =>
    [...(t?.provinces ?? [])]
      .filter((p) => p.avg[f] != null)
      .sort((a, b) => a.avg[f]! - b.avg[f]!)
      .slice(0, 5);
  const faq =
    t?.avg.g95 != null && t.avg.goa != null
      ? [
          {
            q: "¿Cuánto cuesta hoy la gasolina en España?",
            a: `El precio medio de la gasolina 95 hoy en España es de ${fmtPrice(t.avg.g95)} €/l y el del diésel, de ${fmtPrice(t.avg.goa)} €/l, con los precios oficiales de ${t.count.toLocaleString("es-ES")} gasolineras.`,
          },
          {
            q: "¿Dónde es más barata la gasolina?",
            a: `Hoy la provincia con la gasolina 95 más barata de media es ${rank("g95")[0]?.name ?? "—"} y con el diésel más barato, ${rank("goa")[0]?.name ?? "—"}. Dentro de cada municipio puede haber varios céntimos de diferencia entre gasolineras.`,
          },
          {
            q: "¿De dónde salen estos precios?",
            a: "Son los precios que cada gasolinera comunica al Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). Se actualizan cada media hora.",
          },
        ]
      : [];

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
        <Crumbs items={[{ href: "/", label: "Inicio" }, { label: "Precio de la gasolina hoy" }]} />
        <h1 className="h1 big">Precio de la gasolina y el diésel hoy en España</h1>
        {t ? (
          <>
            <p className="muted b13">
              Media de {t.count.toLocaleString("es-ES")} gasolineras · Precios oficiales actualizados el {fmtLongDate(t.updatedAt)}
            </p>
            <div className="spark-grid">
              {fuels.map((f) => {
                const d = y?.avg[f] != null ? t.avg[f]! - y.avg[f]! : null;
                return (
                  <div key={f} className="spark">
                    <span className="eyebrow">{fuelByKey(f)?.label}</span>
                    <span className="price-sm">{fmtPrice(t.avg[f])} €/l</span>
                    {d != null && (
                      <span className="b12" style={{ color: d < -0.0005 ? "#0B7A43" : d > 0.0005 ? "#B5341A" : "#5B6675" }}>
                        {Math.abs(d) < 0.0005 ? "Igual que ayer" : `${signed(d)} desde ayer`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="b15 lead">
            Elige tu provincia y luego tu municipio para ver las gasolineras más baratas de hoy, con los precios oficiales del Ministerio para la Transición
            Ecológica, que se actualizan cada media hora.
          </p>
        )}
        <a href="/" className="btn primary big">
          Ver las más baratas cerca de mí
        </a>

        {t && (
          <section className="stack-8" aria-labelledby="baratas">
            <h2 className="h3" id="baratas">
              Provincias más baratas hoy
            </h2>
            <div className="stack-10">
              {(["g95", "goa"] as FuelKey[]).map((f) => (
                <div key={f} className="card tight">
                  <span className="eyebrow">{fuelByKey(f)?.label}</span>
                  <ol className="rank-list">
                    {rank(f).map((p) => (
                      <li key={p.id}>
                        <Link href={`/gasolineras/${p.slug}`}>{p.name}</Link>
                        <span className="b14 nowrap">{fmtPrice(p.avg[f])} €</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {view && view.drops.length > 0 && (
          <section className="stack-8" aria-labelledby="bajadas">
            <h2 className="h3" id="bajadas">
              Dónde más ha bajado la gasolina 95 este mes
            </h2>
            <div className="card tight">
              <ol className="rank-list">
                {view.drops.map((d) => (
                  <li key={`${d.provSlug}-${d.munId}`}>
                    <Link href={`/gasolineras/${d.provSlug}/${slugify(d.name)}`}>
                      {d.name} <span className="muted b12">({d.prov})</span>
                    </Link>
                    <span className="b14 nowrap">
                      <strong className="green">{signed(d.diff)}</strong> · {fmtPrice(d.now)} €
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="muted b12">Media de las gasolineras de cada municipio (con 3 o más) hoy frente a hace 30 días.</p>
          </section>
        )}

        <section className="stack-8" aria-labelledby="provincias">
          <h2 className="h3" id="provincias">
            Precios por provincia
          </h2>
          <ul className="seo-grid">
            {PROVINCES.map((p) => {
              const a = t?.provinces.find((x) => x.id === p.id)?.avg;
              return (
                <li key={p.id}>
                  <Link href={`/gasolineras/${provinceSlug(p)}`} className="seo-link">
                    {p.name}
                    {a?.g95 != null && <span className="sub">95 de media {fmtPrice(a.g95)} €</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <Faq items={faq} />

        <p className="source">
          Fuente: Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). <Link href="/cargadores">Cargadores para coche eléctrico por provincia</Link> ·{" "}
          <Link href="/privacidad">Fuentes y privacidad</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
