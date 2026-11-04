import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { LocationProvider } from "@/components/LocationProvider";
import { NavigateProvider } from "@/components/NavigateProvider";
import { SwRegister } from "@/components/SwRegister";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/config";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap", variable: "--font-manrope" });

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — la más barata cerca de ti`, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { title: APP_NAME, description: APP_DESCRIPTION, locale: "es_ES", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0B7A43",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>
        <a href="#main" className="skip">Saltar al contenido</a>
        <LocationProvider>
          <NavigateProvider>
            <main id="main" className="app">{children}</main>
          </NavigateProvider>
        </LocationProvider>
        <SwRegister />
      </body>
    </html>
  );
}
