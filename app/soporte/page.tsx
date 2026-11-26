import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { Faq } from "@/components/seo/SeoBits";
import { APP_NAME, CONTACT_EMAIL, contactHref, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Ayuda y contacto",
  description: `Respuestas a las dudas más habituales sobre ${APP_NAME} y cómo escribirnos.`,
  alternates: { canonical: `${SITE_URL}/soporte` },
};

const FAQ = [
  {
    q: "¿Cada cuánto se actualizan los precios?",
    a: "Los de las gasolineras, cada media hora, con los datos oficiales del Ministerio. Los de los cargadores, cuando cada operador los comunica a Red Eléctrica de España. El precio que vale siempre es el del surtidor o el del cargador.",
  },
  {
    q: "Un precio no coincide con el de la gasolinera. ¿Qué hago?",
    a: "Las gasolineras comunican sus precios al Ministerio y a veces tardan en actualizarlos. Desde la ficha de la gasolinera o del cargador toca «¿Algún precio no coincide? Avísanos» y lo revisamos.",
  },
  {
    q: "No me sale ninguna gasolinera cerca.",
    a: "Comprueba que has dado permiso de ubicación y prueba a ampliar el radio en Ajustes. Si has elegido ver solo algunas marcas o has ocultado otras, revisa también ese filtro en Ajustes.",
  },
  {
    q: "No me llegan los avisos de precio.",
    a: "Entra en Alertas y comprueba que los avisos están activados. En Android, mira también que las notificaciones de la app no estén desactivadas en los ajustes del móvil y que el ahorro de batería no la cierre.",
  },
  {
    q: "¿Cuánto tardo en llegar a una gasolinera?",
    a: "Junto a la distancia verás «≈ minutos». Es una estimación hecha en tu propio móvil, sin enviar tu ubicación a nadie: suele acertar en ciudad, pero el tráfico puede cambiarla.",
  },
  {
    q: "¿Cómo pongo mis tarjetas de descuento?",
    a: "En Ajustes › Mis descuentos puedes apuntar el descuento de cada marca (en céntimos o en %) o el de una gasolinera concreta desde su ficha. La app ordena con el precio que pagas tú.",
  },
  {
    q: "¿Cómo borro mis datos?",
    a: "Casi todo está solo en tu móvil. Lo explicamos paso a paso en la página «Eliminar mis datos».",
  },
];

export default function Page() {
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo legal">
        <h1 className="h1 big">Ayuda y contacto</h1>
        <p className="b15 lead">
          ¿Algo no funciona, falta una gasolinera o tienes una idea para mejorar {APP_NAME}? Escríbenos y te contestamos lo antes posible.
        </p>
        <a href={contactHref(`${APP_NAME}: ayuda`)} className="btn primary big">
          Escribir a {CONTACT_EMAIL}
        </a>

        <Faq items={FAQ} />

        <p className="source">
          <Link href="/eliminar-datos">Eliminar mis datos</Link> · <Link href="/privacidad">Fuentes y privacidad</Link> · <Link href="/aviso-legal">Aviso legal</Link>{" "}
          · <Link href="/">Volver a la app</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
