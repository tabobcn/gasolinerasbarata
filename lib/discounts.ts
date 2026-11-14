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
export type DiscountItem = { on: boolean; cts: number; until?: string; unit?: "cts" | "pct"; kind?: "directo" | "saldo"; name?: string };
export type Applied = NonNullable<Station["disc"]>;

/** Euros por litro que supone el descuento a un precio dado */
export const discOff = (d: Applied, price: number) => (d.unit === "pct" ? (price * d.cts) / 100 : d.cts / 100);
const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
/** "−5 cts/l", "−3 %", "+5 cts/l en saldo", "3 % en saldo" */
export function discText(d: Applied): string {
  const v = d.unit === "pct" ? `${num(d.cts)} %` : `${num(d.cts)} ${d.cts === 1 ? "ct/l" : "cts/l"}`;
  return d.kind === "saldo" ? `${d.unit === "pct" ? "" : "+"}${v} en saldo` : `−${v}`;
}
/**
 * Precio que se paga en el surtidor. Con un descuento "en saldo" es el oficial (lo devuelto queda en la tarjeta);
 * `prices` lleva siempre el precio final, que es el que se usa para ordenar y elegir la mejor opción.
 */
export function paidPrice(s: Station, fuel: keyof Prices): number | undefined {
  return s.disc?.kind === "saldo" ? (s.listPrices?.[fuel] ?? s.prices[fuel]) : s.prices[fuel];
}

/** ¿Está activo hoy? (encendido, con importe y sin caducar) */
export const isLive = (i: DiscountItem | undefined, today = madridDate()): i is DiscountItem => !!i && i.on && i.cts > 0 && (!i.until || i.until >= today);

export type DiscountState = {
  enabled: boolean; // interruptor "Precios con mis descuentos"
  items: Record<string, DiscountItem>; // id de programa o "b:MARCA" para los añadidos
  custom: string[]; // marcas añadidas a mano (claves KNOWN)
  stations?: Record<string, DiscountItem>; // descuento solo en una gasolinera concreta (por su id), puesto desde su ficha
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
  return [...Object.values(d.items), ...Object.values(d.stations ?? {})].filter((i) => isLive(i)).length;
}

/** ¿Qué descuento del usuario se aplica a esta marca? */
export function discountFor(brand: string, d: DiscountState, stationId?: string): Applied | null {
  if (!d.enabled) return null;
  // lo más concreto manda: el descuento puesto a mano en esa gasolinera
  const mine = stationId ? d.stations?.[stationId] : undefined;
  if (isLive(mine)) return { label: "Descuento propio", cts: mine.cts, unit: mine.unit, kind: mine.kind };
  const k = knownBrand(brandKey(brand));
  if (!k) return null;
  // primero los añadidos a mano (más concretos)
  const own = d.items[customId(k)];
  if (d.custom.includes(k) && isLive(own)) return { label: brandName(k), cts: own.cts, unit: own.unit, kind: own.kind };
  for (const p of PROGRAMS) {
    const it = d.items[p.id];
    if (isLive(it) && p.brands.includes(k)) return { label: p.short, cts: it.cts, unit: it.unit, kind: it.kind };
  }
  return null;
}

/** Devuelve la gasolinera con los precios ya descontados (todos los combustibles) */
export function applyDiscount(s: Station, d: DiscountState): Station {
  const disc = discountFor(s.brand, d, s.id);
  if (!disc) return s;
  const prices: Prices = {};
  for (const [k, v] of Object.entries(s.prices) as [keyof Prices, number][]) {
    prices[k] = Math.max(0, Math.round((v - discOff(disc, v)) * 1000) / 1000);
  }
  return { ...s, prices, listPrices: s.prices, disc };
}

export function applyDiscounts(list: Station[], d: DiscountState): Station[] {
  if (!d.enabled || !activeCount(d)) return list;
  return list.map((s) => applyDiscount(s, d));
}

/** Para enviar a la API de rutas: "repsol:10,b:PLENERGY:5". Sufijos: "p" = porcentaje, "s" = en saldo ("repsol:3ps") */
export function encodeDiscounts(d: DiscountState): string {
  if (!d.enabled) return "";
  return [...Object.entries(d.items), ...Object.entries(d.stations ?? {}).map(([id, i]) => [`s:${id}`, i] as [string, DiscountItem])]
    .filter(([, i]) => isLive(i))
    .map(([id, i]) => `${id}:${i.cts}${i.unit === "pct" ? "p" : ""}${i.kind === "saldo" ? "s" : ""}`)
    .join(",");
}

export function decodeDiscounts(v: string | null): DiscountState {
  const d: DiscountState = { enabled: true, items: {}, custom: [] };
  for (const part of (v ?? "").split(",").filter(Boolean).slice(0, 30)) {
    const bits = part.split(":");
    const mt = /^(\d+(?:\.\d+)?)(p?)(s?)$/.exec(bits[bits.length - 1]);
    if (!mt) continue;
    const cts = Number(mt[1]);
    if (!Number.isFinite(cts) || cts <= 0 || cts > 100) continue;
    const extra = { ...(mt[2] ? { unit: "pct" as const } : {}), ...(mt[3] ? { kind: "saldo" as const } : {}) };
    if (bits[0] === "s" && bits.length === 3 && /^\d{1,8}$/.test(bits[1])) {
      (d.stations ??= {})[bits[1]] = { on: true, cts, ...extra };
    } else if (bits[0] === "b" && bits.length === 3) {
      const brand = brandKey(bits[1]);
      d.custom.push(brand);
      d.items[customId(brand)] = { on: true, cts, ...extra };
    } else if (bits.length === 2 && PROGRAMS.some((p) => p.id === bits[0])) {
      d.items[bits[0]] = { on: true, cts, ...extra };
    }
  }
  return d;
}
