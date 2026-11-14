import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { LocationProvider } from "@/components/LocationProvider";
import { NavigateProvider } from "@/components/NavigateProvider";
import { SwRegister } from "@/components/SwRegister";
import { SideNav } from "@/components/SideNav";
import { PushSync } from "@/components/PushSync";
import { Analytics } from "@vercel/analytics/next";
import { APP_NAME, APP_DESCRIPTION, SITE_URL } from "@/lib/config";
import { JsonLd } from "@/components/seo/JsonLd";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap", variable: "--font-manrope" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${APP_NAME} — gasolina y cargadores más baratos cerca de ti`, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // El título y la descripción de cada página se copian solos a la vista previa al compartir (WhatsApp, etc.)
  openGraph: { siteName: APP_NAME, locale: "es_ES", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0B7A43",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const SITE_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE_URL}/#web`, url: SITE_URL, name: APP_NAME, description: APP_DESCRIPTION, inLanguage: "es-ES" },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: APP_NAME,
      url: SITE_URL,
      description: APP_DESCRIPTION,
      applicationCategory: "TravelApplication",
      operatingSystem: "Android, iOS, Web",
      inLanguage: "es-ES",
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>
        <JsonLd data={SITE_LD} />
        <a href="#main" className="skip">Saltar al contenido</a>
        <LocationProvider>
          <NavigateProvider>
            <SideNav />
            <main id="main" className="app">{children}</main>
          </NavigateProvider>
        </LocationProvider>
        <SwRegister />
        <PushSync />
        {/* Estadísticas de visitas anónimas y sin cookies (hay que activarlas en el panel de Vercel) */}
        <Analytics />
      </body>
    </html>
  );
}
