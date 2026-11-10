import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { APP_NAME, CONTACT_EMAIL, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Fuentes de los datos y privacidad",
  description: `De dónde salen los precios de ${APP_NAME}, qué se guarda en tu móvil y qué no guardamos nosotros.`,
  alternates: { canonical: `${SITE_URL}/privacidad` },
};

export default function Page() {
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo legal">
        <h1 className="h1 big">Fuentes y privacidad</h1>
        <p className="b15 lead">
          {APP_NAME} es un proyecto personal, gratuito y sin publicidad. No hace falta registrarse y no usamos cookies.
        </p>

        <section className="stack-8" aria-labelledby="fuentes">
          <h2 className="h2" id="fuentes">
            De dónde salen los datos
          </h2>
          <ul className="legal-list">
            <li>
              <strong>Gasolineras y precios:</strong> Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). Son los
              precios que comunica cada gasolinera; los consultamos cada media hora.
            </li>
            <li>
              <strong>Puntos de recarga:</strong> Red Eléctrica de España (REVE, Registro de Vehículo Eléctrico). Mostramos sus datos sin modificarlos, con la
              fecha de la última actualización, y solo para uso no comercial.
            </li>
            <li>
              <strong>Mapa, buscador de lugares y rutas:</strong> © colaboradores de OpenStreetMap, servido por OpenFreeMap (mapa), Photon de Komoot (buscador)
              y OSRM (rutas).
            </li>
          </ul>
          <p className="b13 muted">
            Los precios pueden cambiar a lo largo del día y alguno puede estar desactualizado en origen: el que vale es el del surtidor o el del cargador. Los
            descuentos de «Mis descuentos» son los que tú escribes; no los comprobamos. No tenemos relación con ninguna marca: los colores de cada una solo
            sirven para distinguirlas.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="movil">
          <h2 className="h2" id="movil">
            Qué se queda en tu móvil
          </h2>
          <p className="b15">
            Tu coche, tus favoritas, Casa y Trabajo, tus alertas y tus descuentos se guardan <strong>solo en tu navegador</strong>. Nosotros no los vemos. Si
            borras los datos de la web o desinstalas la app, desaparecen.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="servidor">
          <h2 className="h2" id="servidor">
            Qué llega a nuestro servidor
          </h2>
          <ul className="legal-list">
            <li>
              <strong>Tu ubicación aproximada</strong> (redondeada a unos 100 metros) cuando buscas gasolineras o cargadores cerca. Se usa para responderte y
              no se guarda en ninguna base de datos.
            </li>
            <li>
              <strong>Lo que escribes en el buscador</strong> y el origen y destino de una ruta, que pasamos a Photon y a OSRM para obtener el resultado. Ellos
              reciben la consulta desde nuestro servidor, no desde tu móvil.
            </li>
            <li>
              <strong>Registros técnicos</strong> del alojamiento (Vercel): dirección IP, página pedida y hora, como en cualquier web. Se usan para detectar
              fallos y se borran solos.
            </li>
            <li>
              <strong>Estadísticas de visitas</strong> anónimas (Vercel Web Analytics): qué páginas se abren y desde qué tipo de dispositivo. Sin cookies y sin
              identificarte.
            </li>
          </ul>
        </section>

        <section className="stack-8" aria-labelledby="avisos">
          <h2 className="h2" id="avisos">
            Si activas los avisos con la app cerrada
          </h2>
          <p className="b15">
            Solo entonces guardamos en nuestra base de datos (Supabase, en la Unión Europea) lo necesario para avisarte: la dirección de avisos que genera tu
            navegador (un código que no dice quién eres), tus alertas con la zona que elegiste (para «Donde esté», el último sitio donde abriste la app,
            redondeado a 1 km), los descuentos que tengas activos y qué gasolineras son tus favoritas. No guardamos nombre, correo ni teléfono.
          </p>
          <p className="b15">
            Se borra al desactivar los avisos en la pantalla de Alertas, y también sola cuando tu navegador da de baja la suscripción. El aviso viaja cifrado
            por el servicio de tu navegador (Google, Apple, Mozilla o Microsoft).
          </p>
        </section>

        <section className="stack-8" aria-labelledby="terceros">
          <h2 className="h2" id="terceros">
            Servicios de otros
          </h2>
          <ul className="legal-list">
            <li>El dibujo del mapa lo descarga tu navegador directamente de OpenFreeMap, que ve tu IP y la zona que miras.</li>
            <li>Al tocar «Ir» se abre Google Maps o Waze con el destino. A partir de ahí se aplican sus condiciones.</li>
          </ul>
        </section>

        <section className="stack-8" aria-labelledby="contacto">
          <h2 className="h2" id="contacto">
            Contacto
          </h2>
          <p className="b15">
            Para cualquier duda, para avisar de un dato equivocado o para pedir que borremos algo, escribe a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <p className="source">
          Última revisión: 10 de noviembre de 2026. <Link href="/">Volver a la app</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
