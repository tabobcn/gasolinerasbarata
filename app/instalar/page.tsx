import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { APP_NAME, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Instalar la app y activar los avisos",
  description: `Cómo poner ${APP_NAME} en la pantalla de inicio de tu iPhone, Android u ordenador y recibir avisos cuando baje el precio.`,
  alternates: { canonical: `${SITE_URL}/instalar` },
};

export default function Page() {
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top seo legal">
        <h1 className="h1 big">Instalar la app y activar los avisos</h1>
        <p className="b15 lead">Es gratis, no hay que registrarse y no ocupa casi nada: es esta misma web guardada como app.</p>

        <section className="stack-8" aria-labelledby="iphone">
          <h2 className="h2" id="iphone">
            En iPhone
          </h2>
          <ol className="legal-list">
            <li>
              Abre esta web en <strong>Safari</strong>.
            </li>
            <li>
              Pulsa el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba).
            </li>
            <li>
              Elige <strong>Añadir a pantalla de inicio</strong> y pulsa Añadir.
            </li>
          </ol>
          <p className="b13 muted">Para los avisos hace falta iOS 16.4 o posterior y abrir la app desde el icono nuevo, no desde Safari.</p>
        </section>

        <section className="stack-8" aria-labelledby="android">
          <h2 className="h2" id="android">
            En Android
          </h2>
          <ol className="legal-list">
            <li>
              Abre esta web en <strong>Chrome</strong>.
            </li>
            <li>
              Pulsa los <strong>tres puntos</strong> de arriba a la derecha.
            </li>
            <li>
              Elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.
            </li>
          </ol>
        </section>

        <section className="stack-8" aria-labelledby="ordenador">
          <h2 className="h2" id="ordenador">
            En ordenador
          </h2>
          <p className="legal-text">
            En Chrome o Edge, pulsa el icono de <strong>instalar</strong> que aparece al final de la barra de direcciones. También puedes usarla sin instalar
            nada.
          </p>
        </section>

        <section className="stack-8" aria-labelledby="avisos">
          <h2 className="h2" id="avisos">
            Activar los avisos de precio
          </h2>
          <ol className="legal-list">
            <li>
              Entra en <Link href="/alertas">Alertas</Link> y crea una: combustible, zona y precio a partir del cual quieres que te avisemos.
            </li>
            <li>
              Activa <strong>Avisarme con la app cerrada</strong> y acepta el permiso de notificaciones.
            </li>
            <li>Pulsa «Enviar aviso de prueba» para comprobar que te llega.</li>
          </ol>
          <p className="b13 muted">Como mucho recibirás un aviso al día por alerta, y nunca entre las 23:00 y las 7:00. Puedes desactivarlos cuando quieras.</p>
        </section>

        <p className="b13">
          <Link href="/">Volver al inicio</Link> · <Link href="/privacidad">Fuentes y privacidad</Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
