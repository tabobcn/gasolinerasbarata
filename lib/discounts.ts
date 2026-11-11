import { brandKey, brandName, knownBrand } from "./brands";
import type { Prices, Station } from "./types";
import { madridDate } from "./format";

/**
 * Descuentos de fidelización del usuario (céntimos por litro).
 * Lógica pura: se usa en el navegador y en el servidor (ruta).
 */

export type Program = {
  id: string;
  name: string; // "Waylet / Solred"
  short: string; // etiqueta corta en precios: "Waylet"
  sub: string; // "Repsol, Campsa y Petronor"
  brands: string[]; // claves de marca (lib/brands KNOWN)
  tileBrand: string; // marca para el cuadrado de color
};

export const PROGRAMS: Program[] = [
  { id: "repsol", name: "Waylet / Solred", short: "Waylet", sub: "Repsol, Campsa y Petronor", brands: ["REPSOL", "CAMPSA", "CAMPSA EXPRESS", "PETRONOR"], tileBrand: "REPSOL" },
  { id: "moeve", name: "Tarjeta o app de Moeve", short: "Moeve", sub: "Moeve (antes Cepsa)", brands: ["MOEVE", "CEPSA"], tileBrand: "MOEVE" },
  { id: "bp", name: "Tarjeta o app de BP", short: "BP", sub: "Gasolineras BP", brands: ["BP"], tileBrand: "BP" },
  { id: "galp", name: "Tarjeta o app de Galp", short: "Galp", sub: "Gasolineras Galp", brands: ["GALP"], tileBrand: "GALP" },
  { id: "shell", name: "Tarjeta o app de Shell", short: "Shell", sub: "Gasolineras Shell", brands: ["SHELL"], tileBrand: "SHELL" },
  { id: "superm", name: "Tarjeta de supermercado", short: "Súper", sub: "Carrefour, Alcampo, Eroski y E.Leclerc", brands: ["CARREFOUR", "ALCAMPO", "EROSKI", "E.LECLERC"], tileBrand: "SUPER" },
];

/** `until` (AAAA-MM-DD): el descuento viene de una oferta con fecha de fin; pasado ese día deja de aplicarse solo */
export type DiscountItem = { on: boolean; cts: number; until?: string };

/** ¿Está activo hoy? (encendido, con importe y sin caducar) */
export const isLive = (i: DiscountItem | undefined, today = madridDate()): i is DiscountItem => !!i && i.on && i.cts > 0 && (!i.until || i.until >= today);

export type DiscountState = {
  enabled: boolean; // interruptor "Precios con mis descuentos"
  items: Record<string, DiscountItem>; // id de programa o "b:MARCA" para los añadidos
  custom: string[]; // marcas añadidas a mano (claves KNOWN)
};

export const DEFAULT_DISCOUNTS: DiscountState = { enabled: true, items: {}, custom: [] };

export const customId = (brand: string) => `b:${brand}`;

/** Todos los programas: los fijos + los añadidos a mano */
export function allPrograms(d: DiscountState): Program[] {
  return [
    ...PROGRAMS,
    ...d.custom.map((b) => ({ id: customId(b), name: `Descuento en ${brandName(b)}`, short: brandName(b), sub: `Gasolineras ${brandName(b)}`, brands: [b], tileBrand: b })),
  ];
}

export function activeCount(d: DiscountState): number {
  return Object.values(d.items).filter((i) => isLive(i)).length;
}

/** ¿Qué descuento del usuario se aplica a esta marca? */
export function discountFor(brand: string, d: DiscountState): { label: string; cts: number } | null {
  if (!d.enabled) return null;
  const k = knownBrand(brandKey(brand));
  if (!k) return null;
  // primero los añadidos a mano (más concretos)
  const own = d.items[customId(k)];
  if (d.custom.includes(k) && isLive(own)) return { label: brandName(k), cts: own.cts };
  for (const p of PROGRAMS) {
    const it = d.items[p.id];
    if (isLive(it) && p.brands.includes(k)) return { label: p.short, cts: it.cts };
  }
  return null;
}

/** Devuelve la gasolinera con los precios ya descontados (todos los combustibles) */
export function applyDiscount(s: Station, d: DiscountState): Station {
  const disc = discountFor(s.brand, d);
  if (!disc) return s;
  const prices: Prices = {};
  for (const [k, v] of Object.entries(s.prices) as [keyof Prices, number][]) {
    prices[k] = Math.max(0, Math.round((v - disc.cts / 100) * 1000) / 1000);
  }
  return { ...s, prices, listPrices: s.prices, disc };
}

export function applyDiscounts(list: Station[], d: DiscountState): Station[] {
  if (!d.enabled || !activeCount(d)) return list;
  return list.map((s) => applyDiscount(s, d));
}

/** Para enviar a la API de rutas: "repsol:10,b:PLENERGY:5" */
export function encodeDiscounts(d: DiscountState): string {
  if (!d.enabled) return "";
  return Object.entries(d.items)
    .filter(([, i]) => isLive(i))
    .map(([id, i]) => `${id}:${i.cts}`)
    .join(",");
}

export function decodeDiscounts(v: string | null): DiscountState {
  const d: DiscountState = { enabled: true, items: {}, custom: [] };
  for (const part of (v ?? "").split(",").filter(Boolean).slice(0, 30)) {
    const bits = part.split(":");
    const cts = Number(bits[bits.length - 1]);
    if (!Number.isFinite(cts) || cts <= 0 || cts > 100) continue;
    if (bits[0] === "b" && bits.length === 3) {
      const brand = brandKey(bits[1]);
      d.custom.push(brand);
      d.items[customId(brand)] = { on: true, cts };
    } else if (bits.length === 2 && PROGRAMS.some((p) => p.id === bits[0])) {
      d.items[bits[0]] = { on: true, cts };
    }
  }
  return d;
}
