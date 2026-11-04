/**
 * Ofertas activas de las marcas. NO hay fuente oficial de promociones:
 * esta lista se mantiene A MANO. Cada oferta desaparece sola al pasar su fecha "until".
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
};

export const OFFERS: Offer[] = [
  {
    id: "waylet-2026-11",
    program: "repsol",
    brand: "REPSOL",
    title: "Waylet: de 10 a 45 cts/l en saldo",
    detail:
      "Depende de los servicios que tengas con Repsol (luz, gas, solar…). Pagando con la Tarjeta Waylet se duplica el saldo hasta el 30 de noviembre. Se da como saldo, no como rebaja en el surtidor.",
    until: "2026-11-30",
    url: "https://www.repsol.es/particulares/asesoramiento-consumo/consigue-descuentos-en-gasolina-con-waylet/",
    checked: "2026-11-04",
  },
];

export function activeOffers(today = new Date()): Offer[] {
  const iso = today.toISOString().slice(0, 10);
  return OFFERS.filter((o) => o.until >= iso);
}

export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}
