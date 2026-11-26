import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { APP_NAME, CONTACT_EMAIL, OWNER_NAME, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Aviso legal",
  description: `Quién está detrás de ${APP_NAME}, condiciones de uso y de dónde salen los datos.`,
  alternates: { canonical: `${SITE_URL}/aviso-legal` },
};

const host = SITE_URL.replace(/^https?:\/\//, "");

export default function Page() {
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo legal">
        <h1 className="h1 big">Aviso legal</h1>

        <section className="stack-8" aria-labelledby="titular">
          <h2 className="h2" id="titular">
            Quién está detrás
          </h2>
          <p className="b15">
            {host} y la app {APP_NAME} son un proyecto personal de {OWNER_NAME || "su autor"}, un particular residente en España, sin ánimo de lucro, sin
            publicidad y sin compras dentro de la app. Contacto: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="uso">
          <h2 className="h2" id="uso">
            Condiciones de uso
          </h2>
          <p className="b15">
            Usar la web y la app es gratis y no hace falta registrarse. Te pedimos que no las uses para fines ilegales, que no intentes dañarlas ni
            descargar sus datos de forma masiva o automática.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="precios">
          <h2 className="h2" id="precios">
            Los precios son orientativos
          </h2>
          <p className="b15">
            Mostramos los precios tal y como los publican las fuentes oficiales, sin cambiarlos. Pueden variar a lo largo del día o tener errores de origen:
            el precio que vale es el del surtidor o el del cargador. Los cálculos de ahorro, de lo que cuesta llenar o del tiempo hasta una gasolinera son
            estimaciones. No nos hacemos responsables de decisiones tomadas solo con esta información ni de los servicios de terceros a los que enlazamos
            (Google Maps, Waze u otros).
          </p>
          <p className="b15">
            Si ves un precio que no coincide, escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> y lo revisamos.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="fuentes">
          <h2 className="h2" id="fuentes">
            Fuentes de los datos
          </h2>
          <ul className="legal-list">
            <li>
              Precios de carburantes: Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras), datos públicos y reutilizables.
            </li>
            <li>
              Puntos de recarga: Red Eléctrica de España (REVE, Registro de Vehículo Eléctrico), usados según sus condiciones: uso no comercial, citando la
              fuente, sin alterar los datos y mostrando la fecha de su última actualización.
            </li>
            <li>Mapa: OpenFreeMap con datos de © colaboradores de OpenStreetMap. Rutas: OSRM. Buscador de lugares: Photon.</li>
          </ul>
          <p className="b15">{APP_NAME} no pertenece a ningún organismo público ni a ninguna marca de carburantes o de recarga.</p>
        </section>

        <section className="stack-8" aria-labelledby="marcas">
          <h2 className="h2" id="marcas">
            Marcas y contenidos
          </h2>
          <p className="b15">
            Los nombres y logotipos de gasolineras y operadores pertenecen a sus dueños y se usan solo para que reconozcas cada estación. El diseño, los
            textos y el código de {APP_NAME} son de su autor; si quieres usarlos, pregúntanos.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="ley">
          <h2 className="h2" id="ley">
            Privacidad y ley aplicable
          </h2>
          <p className="b15">
            Lo que hacemos con tus datos está en <Link href="/privacidad">Fuentes y privacidad</Link> y cómo borrarlos, en{" "}
            <Link href="/eliminar-datos">Eliminar mis datos</Link>. Este aviso se rige por la ley española.
          </p>
        </section>

        <p className="source">
          Última revisión: 26 de noviembre de 2026. <Link href="/soporte">Ayuda y contacto</Link> · <Link href="/">Volver a la app</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
