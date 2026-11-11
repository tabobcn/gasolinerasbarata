"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMode } from "@/lib/store";
import { APP_NAME } from "@/lib/config";
import { Icon, type IconName } from "./Icon";

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Cerca", icon: "pump", match: (p) => p === "/" || p.startsWith("/gasolinera") || p.startsWith("/carga") },
  { href: "/mapa", label: "Mapa", icon: "map", match: (p) => p.startsWith("/mapa") },
  { href: "/ruta", label: "Ruta", icon: "route", match: (p) => p.startsWith("/ruta") },
  { href: "/favoritas", label: "Favoritas", icon: "star", match: (p) => p.startsWith("/favoritas") },
  { href: "/alertas", label: "Alertas", icon: "bell", match: (p) => p.startsWith("/alertas") },
  { href: "/repostajes", label: "Mis repostajes", icon: "trendDown", match: (p) => p.startsWith("/repostajes") },
  { href: "/descuentos", label: "Descuentos", icon: "card", match: (p) => p.startsWith("/descuentos") },
  { href: "/mi-coche", label: "Mi coche", icon: "car", match: (p) => p.startsWith("/mi-coche") },
];

/** Menú lateral: solo se ve en ordenador (en el móvil se usa la barra inferior) */
export function SideNav() {
  const path = usePathname() || "/";
  const [mode] = useMode();
  return (
    <nav aria-label="Secciones" className="side-nav">
      <Link href="/" className="side-brand">
        <img src="/icon.svg" alt="" width={36} height={36} className="side-logo" />
        {APP_NAME}
      </Link>
      <div className="side-links">
        {ITEMS.map((t) => {
          const on = t.match(path);
          const href = t.href === "/" && mode === "charge" ? "/carga" : t.href;
          return (
            <Link key={t.href} href={href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined}>
              <Icon name={t.icon} size={20} stroke={on ? 2.4 : 2} />
              {t.label}
            </Link>
          );
        })}
      </div>
      <p className="side-foot">
        Precios oficiales del Ministerio para la Transición Ecológica. Cargadores: Red Eléctrica de España.
        <br />
        <Link href="/privacidad">Fuentes y privacidad</Link>
        <br />
        <Link href="/instalar">Instalar la app y avisos</Link>
      </p>
    </nav>
  );
}
