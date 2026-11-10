import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { PROVINCES, provinceSlug } from "@/lib/seo";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Cargadores para coche eléctrico por provincia",
  description: "Puntos de recarga para coche eléctrico en España, por provincia y municipio: precio por kWh, potencia y si están en funcionamiento. Datos de Red Eléctrica (REVE).",
  alternates: { canonical: `${SITE_URL}/cargadores` },
};

export default function Page() {
  const list = [...PROVINCES].sort((a, b) => a.name.localeCompare(b.name, "es"));
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo">
        <h1 className="h1 big">Cargadores para coche eléctrico por provincia</h1>
        <p className="b15 lead">Elige tu provincia para ver los puntos de recarga de cada municipio, con el precio por kWh que publica cada operador.</p>
        <a href="/carga" className="btn primary">
          Ver los que tengo cerca
        </a>
        <ul className="seo-grid">
          {list.map((p) => (
            <li key={p.id}>
              <Link href={`/cargadores/${provinceSlug(p)}`} className="seo-link">
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="source">
          Fuente: Red Eléctrica de España (REVE, Registro de Vehículo Eléctrico). <Link href="/gasolineras">Precios de gasolineras por provincia</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
