import { madridDate } from "./format";

/**
 * Ofertas activas de las marcas. NO hay fuente oficial de promociones:
 * esta lista se revisa cada mes (tarea programada + visto bueno de Carlos). Cada oferta desaparece sola al pasar su fecha "until".
 */
export type Offer = {
  id: string;
  program: string; // id de PROGRAMS (lib/discounts)
  brand: string; // marca para el cuadrado de color
  title: string;
  detail: string;
  until: string; // AAAA-MM-DD (incluido)
  url: string;
  checked: string; // AAAA-MM-DD en que se revisó
  cts?: number; // descuento que se propone al pulsar "Activar" (céntimos por litro)
  tiers?: { label: string; cts: number }[]; // varios niveles: cada uno elige el suyo ("Solo Waylet", "Con luz"…)
  requires?: string; // qué hace falta para tenerla ("Ser de Moeve gow")
  signup?: { text: string; url: string }; // enlace para apuntarse
  draft?: boolean; // preparada pero sin publicar (pendiente del visto bueno)
  kind?: "directo" | "saldo"; // en el surtidor o como saldo para otro repostaje
};

export const OFFERS: Offer[] = [
  {
    id: "waylet-2026-11",
    program: "repsol",
    brand: "REPSOL",
    title: "Waylet: de 10 a 40 cts/l en saldo",
    detail:
      "Todos los días de noviembre, pagando con Waylet se duplica el saldo. Cuánto te toca depende de lo que tengas contratado con Repsol. Se da como saldo para otros repostajes, no como rebaja en el surtidor.",
    until: "2026-11-30",
    url: "https://www.repsol.es/particulares/asesoramiento-consumo/consigue-descuentos-en-gasolina-con-waylet/",
    checked: "2026-11-11",
    requires: "tener la app Waylet y pagar el repostaje con ella",
    tiers: [
      { label: "Coche", cts: 10 },
      { label: "Coche y luz", cts: 20 },
      { label: "Coche, luz y gas", cts: 30 },
      { label: "Coche, luz, gas y solar", cts: 40 },
    ],
    kind: "saldo",
  },
];

export function activeOffers(today = new Date()): Offer[] {
  const iso = madridDate(today);
  return OFFERS.filter((o) => !o.draft && o.until >= iso);
}

export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}
