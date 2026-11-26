import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { APP_NAME, CONTACT_EMAIL, contactHref, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Eliminar mis datos",
  description: `Cómo borrar todo lo que ${APP_NAME} guarda en tu móvil y en nuestro servidor.`,
  alternates: { canonical: `${SITE_URL}/eliminar-datos` },
};

const host = SITE_URL.replace(/^https?:\/\//, "");

export default function Page() {
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo legal">
        <h1 className="h1 big">Eliminar mis datos</h1>
        <p className="b15 lead">
          {APP_NAME} no tiene cuentas: no sabemos tu nombre, tu correo ni tu teléfono. Casi todo lo tuyo está en tu móvil y lo borras tú en un momento.
        </p>

        <section className="stack-8" aria-labelledby="movil">
          <h2 className="h2" id="movil">
            1. Lo que está en tu móvil
          </h2>
          <p className="b15">
            Tu coche, favoritas, Casa y Trabajo, alertas, descuentos y repostajes se guardan solo en el navegador de tu móvil. Para borrarlo todo:
          </p>
          <ul className="legal-list">
            <li>
              <strong>App de Android:</strong> abre Chrome › menú ⋮ › Configuración › Configuración de sitios › Todos los sitios › {host} › Borrar datos.
              Desinstalar la app también ayuda, pero los datos viven en Chrome.
            </li>
            <li>
              <strong>En el navegador (móvil u ordenador):</strong> en los ajustes del navegador, borra los datos del sitio {host}.
            </li>
          </ul>
        </section>

        <section className="stack-8" aria-labelledby="servidor">
          <h2 className="h2" id="servidor">
            2. Lo que está en nuestro servidor (solo si activaste los avisos)
          </h2>
          <p className="b15">
            Si activaste los avisos con la app cerrada, guardamos la dirección de avisos de tu navegador junto con tus alertas, descuentos y favoritas. Para
            borrarlo, entra en <Link href="/alertas">Alertas</Link> y desactiva los avisos: se elimina al momento de nuestra base de datos. Si ya no tienes la
            app, se borra solo cuando tu navegador da de baja la suscripción.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="correo">
          <h2 className="h2" id="correo">
            3. ¿Prefieres que lo hagamos nosotros?
          </h2>
          <p className="b15">
            Escríbenos a <a href={contactHref("Eliminar mis datos")}>{CONTACT_EMAIL}</a> y lo borramos en un mes como máximo. Como no hay cuentas, dinos
            más o menos cuándo activaste los avisos y en qué zona, para encontrar tu suscripción.
          </p>
        </section>

        <p className="b15">
          Los registros técnicos del alojamiento (dirección IP, página y hora) no van asociados a ti y se borran solos. Más detalles en{" "}
          <Link href="/privacidad">Fuentes y privacidad</Link>.
        </p>

        <p className="source">
          <Link href="/soporte">Ayuda y contacto</Link> · <Link href="/aviso-legal">Aviso legal</Link> · <Link href="/">Volver a la app</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
