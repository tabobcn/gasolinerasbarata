import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { Crumbs } from "@/components/seo/SeoBits";
import { PROVINCES, provinceSlug } from "@/lib/seo";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Precio de la gasolina hoy por provincias y municipios",
  description:
    "Gasolineras más baratas de España por provincia y municipio, con los precios oficiales del Ministerio actualizados cada media hora: gasolina 95, diésel, 98 y GLP.",
  alternates: { canonical: `${SITE_URL}/gasolineras` },
};

export default function Page() {
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
        <Crumbs items={[{ href: "/", label: "Inicio" }, { label: "Precios por provincia" }]} />
        <h1 className="h1 big">Precio de la gasolina hoy por provincias</h1>
        <p className="b15 lead">
          Elige tu provincia y luego tu municipio para ver las gasolineras más baratas de hoy, con los precios oficiales del Ministerio para la Transición
          Ecológica, que se actualizan cada media hora.
        </p>
        <a href="/" className="btn primary big">
          Ver las más baratas cerca de mí
        </a>
        <ul className="seo-grid">
          {PROVINCES.map((p) => (
            <li key={p.id}>
              <Link href={`/gasolineras/${provinceSlug(p)}`} className="seo-link">
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="source">
          Fuente: Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). <Link href="/cargadores">Cargadores para coche eléctrico por provincia</Link> ·{" "}
          <Link href="/privacidad">Fuentes y privacidad</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
