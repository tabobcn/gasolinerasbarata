import type { Settings } from "./store";
import { titleCase } from "./format";
import { haversineKm } from "./geo";

// ---------- Tipos (lo que devuelven las funciones de Supabase) ----------

export type PriceComponent = { type: string; price: string | number; vat?: string | number | null; step_size?: number };
export type TariffRestrictions = Record<string, unknown>;
export type TariffElement = { price_components?: PriceComponent[]; restrictions?: TariffRestrictions | null };

export type Conn = {
  id: string;
  s: string | null; // estándar OCPI (IEC_62196_T2…)
  fmt?: string | null; // SOCKET / CABLE
  p: string | null; // AC_1_PHASE / AC_3_PHASE / DC
  kw: number | null;
  e: number | null; // €/kWh sin IVA
  v: number | null; // % IVA
  t: number | null; // €/hora sin IVA
  f: number | null; // € por recarga sin IVA
  el?: TariffElement[] | null;
  tu?: string | null; // tarifa actualizada
  cur?: string | null;
};

export type Evse = {
  id: string;
  evse_id?: string | null;
  op: boolean | null; // operativo según REVE
  opu?: string | null;
  st: string | null; // estado en tiempo real (AVAILABLE, CHARGING…)
  stu: string | null;
  chk?: string | null; // cuándo lo comprobamos
  kw: number | null;
  cap?: string[] | null;
  floor?: string | null;
  ref?: string | null;
  c: Conn[];
};

export type Charger = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  cp?: string | null;
  operator: string | null;
  party: string | null;
  owner?: string | null;
  lat: number;
  lon: number;
  dist?: number;
  h24: boolean | null;
  opening?: { twentyfourseven?: boolean; regular_hours?: { weekday: number; period_begin: string; period_end: string }[] } | null;
  parking?: string | null;
  facilities?: string[] | null;
  updated: string | null;
  synced?: string | null;
  evses: Evse[];
  /** Si agrupa varios postes del mismo sitio: ids de todas las ubicaciones de REVE (la primera es `id`) */
  ids?: string[];
};

/** `updated`: última actualización del estado; `prices`: última carga correcta de precios */
export type ChargersResponse = { updated: string | null; prices?: string | null; items: Charger[] };
export type ChargerDetailResponse = { updated: string | null; prices?: string | null; item: Charger };
export type LiveResponse = { checked: string; evses: { id: string; st: string | null; stu: string | null; chk: string | null }[] };

// ---------- Enchufes ----------

export type PlugKind = "t2" | "ccs2" | "chademo" | "schuko" | "tesla" | "t1" | "ccs1" | "t3" | "other";

export const PLUG_LABEL: Record<PlugKind, string> = {
  t2: "Tipo 2",
  ccs2: "CCS2",
  chademo: "CHAdeMO",
  schuko: "Schuko",
  tesla: "Tesla",
  t1: "Tipo 1",
  ccs1: "CCS1",
  t3: "Tipo 3",
  other: "Otro",
};

export function plugKind(standard: string | null): PlugKind {
  switch (standard) {
    case "IEC_62196_T2":
      return "t2";
    case "IEC_62196_T2_COMBO":
      return "ccs2";
    case "CHADEMO":
      return "chademo";
    case "IEC_62196_T1":
      return "t1";
    case "IEC_62196_T1_COMBO":
      return "ccs1";
    case "IEC_62196_T3A":
    case "IEC_62196_T3C":
      return "t3";
    case "TESLA_R":
    case "TESLA_S":
      return "tesla";
    default:
      return standard?.startsWith("DOMESTIC") ? "schuko" : "other";
  }
}

export const isDC = (c: Conn) => {
  const k = plugKind(c.s);
  if (k === "ccs2" || k === "ccs1" || k === "chademo") return true;
  // Un Tipo 2 solo es carga rápida en los Supercargadores antiguos de Tesla (DC de verdad, > 43 kW)
  if (k === "t2" || k === "t1" || k === "t3" || k === "schuko") return c.p === "DC" && (c.kw ?? 0) > 43;
  return c.p === "DC";
};
const fmtKw = (kw: number) => `${String(Math.round(kw * 10) / 10).replace(".", ",")} kW`;

// ---------- Tu coche ----------

export type Car = { electric: boolean; plugs: string[]; ac: number; dc: number; battery: number; label: string };

export function carFrom(s: Settings): Car {
  const electric = s.carType === "ev" || s.carType === "phev";
  // Si el coche tiene carga rápida pero no se marcó ningún enchufe rápido, se supone CCS2 (el de casi todos en Europa);
  // sin esto no le servía ningún cargador rápido
  const plugs = s.dc > 0 && !s.plugs.some((p) => p === "ccs2" || p === "chademo") ? [...s.plugs, "ccs2"] : s.plugs;
  return {
    electric,
    plugs,
    ac: s.ac,
    dc: s.dc,
    battery: s.battery,
    label: s.carName?.trim() || (s.carType === "ev" ? "eléctrico" : "híbrido"),
  };
}

/** ¿Puede cargar tu coche en este conector? Sin coche eléctrico configurado, todo vale. */
export function compatible(c: Conn, car: Car): boolean {
  if (!car.electric) return true;
  const k = plugKind(c.s);
  if (isDC(c)) return car.dc > 0 && car.plugs.includes(k);
  return car.plugs.includes(k);
}

/** Potencia a la que cargará de verdad (la menor entre cargador y coche) */
export function effectiveKw(c: Conn, car: Car): number {
  const charger = c.kw ?? (isDC(c) ? 50 : 3.7);
  if (!car.electric) return charger;
  const carMax = isDC(c) ? car.dc : car.ac;
  return Math.max(1, Math.min(charger, carMax || charger));
}

/** Algunos operadores mandan el IVA como 0.21 en vez de 21 */
export const vatPct = (v: number | null | undefined) => (v != null && v > 0 && v < 1 ? Math.round(v * 10000) / 100 : v ?? null);
const vatFactor = (c: Conn) => 1 + (vatPct(c.v) ?? 0) / 100;

/** €/kWh con IVA (la tarifa de REVE viene sin IVA) */
export function priceKwh(c: Conn): number | null {
  return c.e != null && c.e > 0 ? c.e * vatFactor(c) : null;
}

/**
 * ¿Ha publicado un precio real? Los "0 €" no cuentan: casi siempre es que el operador no ha puesto
 * su tarifa, y si los contáramos saldrían siempre los primeros.
 */
export const hasPrice = (c: Conn) => (c.e ?? 0) > 0 || (c.t ?? 0) > 0 || (c.f ?? 0) > 0;
/** La tarifa existe pero todo está a 0 € */
export const zeroOnly = (c: Conn) => !hasPrice(c) && (c.e === 0 || c.t === 0 || c.f === 0);

export type FillEstimate = { kwh: number; kw: number; minutes: number; cost: number | null };

/** Coste y tiempo de cargar del 20 % al 100 % (o hasta `toPct`; aproximado: la carga rápida baja de potencia al final) */
export function fillEstimate(c: Conn, car: Car, toPct = 1): FillEstimate {
  const kwh = car.battery * Math.max(0.1, toPct - 0.2);
  const kw = effectiveKw(c, car);
  const hours = kwh / (kw * (isDC(c) ? 0.75 : 0.95));
  const cost = hasPrice(c) ? ((c.e ?? 0) * kwh + (c.t ?? 0) * hours + (c.f ?? 0)) * vatFactor(c) : null;
  return { kwh, kw, minutes: Math.round(hours * 60), cost };
}

// ---------- Disponibilidad ----------

const LIVE_TTL = 30 * 60_000;
const DOWN = new Set(["OUTOFORDER", "INOPERATIVE", "REMOVED", "PLANNED"]);
const BUSY = new Set(["CHARGING", "BLOCKED", "RESERVED"]);

export function liveFresh(e: Evse, now = Date.now()) {
  return !!e.st && e.st !== "UNKNOWN" && !!e.chk && now - Date.parse(e.chk) < LIVE_TTL;
}
export function evseDown(e: Evse, now = Date.now()) {
  if (liveFresh(e, now)) return DOWN.has(e.st!);
  return e.op === false;
}

export type Avail = { total: number; free: number; busy: number; down: number; live: boolean; known: boolean };

export function availability(evses: Evse[], now = Date.now()): Avail {
  const a: Avail = { total: evses.length, free: 0, busy: 0, down: 0, live: false, known: false };
  for (const e of evses) {
    if (liveFresh(e, now)) {
      a.live = true;
      a.known = true;
      if (e.st === "AVAILABLE") a.free++;
      else if (BUSY.has(e.st!)) a.busy++;
      else if (DOWN.has(e.st!)) a.down++;
    } else if (e.op != null) {
      a.known = true;
      if (e.op === false) a.down++;
    }
  }
  if (a.live && a.free === 0 && a.busy === 0 && a.down < a.total) {
    // Hay datos en directo de algunos puntos pero ninguno libre ni ocupado: lo decide el estado operativo
    a.live = false;
  }
  return a;
}

export function availText(a: Avail): { text: string; tone: "green" | "amber" | "red" | "muted" } {
  if (!a.total) return { text: "Sin puntos", tone: "muted" };
  if (a.live) {
    if (a.free > 0) return { text: `${a.free} de ${a.total} libre${a.total === 1 ? "" : "s"} ahora`, tone: "green" };
    if (a.busy > 0) return { text: a.busy === a.total ? "Ocupado ahora" : `${a.busy} de ${a.total} ocupados`, tone: "amber" };
  }
  if (a.known) {
    const ok = a.total - a.down;
    if (ok === 0) return { text: "Fuera de servicio", tone: "red" };
    if (a.down > 0) return { text: `${ok} de ${a.total} operativos`, tone: "amber" };
    return { text: a.total === 1 ? "Operativo" : `Los ${a.total} operativos`, tone: "green" };
  }
  return { text: "Estado sin datos", tone: "muted" };
}

// ---------- Resumen de una ubicación para tu coche ----------

export type ConnGroup = {
  key: string;
  kind: PlugKind;
  dc: boolean;
  kw: number;
  conn: Conn; // conector representativo (con su tarifa)
  evses: Evse[];
  compatible: boolean;
  price: number | null; // €/kWh con IVA
  doubtful: boolean; // precio a confirmar (demasiado bajo o sin actualizar en más de un año): se enseña, pero no se pone el primero
  why: "low" | "old" | null; // por qué hay que confirmarlo
  vatKnown: boolean; // el operador indica el IVA (si no, no sabemos si el precio lo lleva)
  fill: FillEstimate;
};

/**
 * Por debajo de esto (con IVA) casi seguro que el operador no ha puesto su tarifa real
 * (p. ej. 0,09 €/kWh en todos los puntos). Se enseña "a confirmar" y no cuenta para "el mejor".
 */
export const DOUBTFUL_KWH = 0.15;
export const isDoubtful = (p: number | null) => p != null && p < DOUBTFUL_KWH;

/** Una tarifa que el operador no toca desde hace más de un año puede no ser ya la real */
export const STALE_MS = 365 * 86_400_000;
export const isStale = (c: Conn, now = Date.now()) => !!c.tu && now - Date.parse(c.tu) > STALE_MS;

/** Etiqueta corta junto al precio: qué sabemos de él */
export function priceNote(g: Pick<ConnGroup, "price" | "why" | "vatKnown" | "conn">): string {
  if (g.price == null) return "sin precio";
  if (g.why === "low") return "a confirmar";
  if (g.why === "old") return `precio de ${new Date(g.conn.tu!).getFullYear()}`;
  return g.vatKnown ? "IVA incl." : "IVA no indicado";
}

/** Aviso largo cuando el precio hay que confirmarlo */
export function doubtText(g: Pick<ConnGroup, "why" | "conn">): string {
  return g.why === "old"
    ? `El operador no actualiza esta tarifa desde ${new Date(g.conn.tu!).getFullYear()}: confirma el precio en su app antes de ir.`
    : "Precio a confirmar en la app del operador: es demasiado bajo para ser real.";
}

/** Agrupa por enchufe + potencia + tarifa (lo que el usuario ve como "Tipo 2 · 22 kW") */
export function groups(ch: Charger, car: Car): ConnGroup[] {
  const map = new Map<string, ConnGroup>();
  for (const e of ch.evses) {
    for (const c of e.c) {
      const kind = plugKind(c.s);
      const kw = c.kw ?? e.kw ?? 0;
      const key = `${kind}|${kw}|${hasPrice(c) ? `${c.e ?? ""}|${c.t ?? ""}|${c.f ?? ""}` : "sin-precio"}`;
      const g = map.get(key);
      if (g) {
        if (!g.evses.includes(e)) g.evses.push(e);
        continue;
      }
      map.set(key, {
        key,
        kind,
        dc: isDC(c),
        kw,
        conn: c,
        evses: [e],
        compatible: compatible(c, car),
        price: priceKwh(c),
        doubtful: isDoubtful(priceKwh(c)) || (hasPrice(c) && isStale(c)),
        why: isDoubtful(priceKwh(c)) ? "low" : hasPrice(c) && isStale(c) ? "old" : null,
        vatKnown: vatPct(c.v) != null,
        fill: fillEstimate(c, car),
      });
    }
  }
  return [...map.values()].sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.kw - a.kw);
}

export type Summary = {
  ch: Charger;
  groups: ConnGroup[];
  best: ConnGroup | null; // el grupo compatible más barato de llenar
  compatible: boolean;
  avail: Avail;
  allDown: boolean;
  plugs: string; // "Tipo 2 22 kW + CCS2 150 kW"
  maxKw: number;
};

export function summarize(ch: Charger, car: Car, now = Date.now()): Summary {
  const gs = groups(ch, car);
  const comp = gs.filter((g) => g.compatible && g.evses.some((e) => !evseDown(e, now)));
  const byCost = (a: ConnGroup, b: ConnGroup) => a.fill.cost! - b.fill.cost! || a.fill.minutes - b.fill.minutes;
  const best =
    comp.filter((g) => g.fill.cost != null && !g.doubtful).sort(byCost)[0] ??
    comp.filter((g) => g.fill.cost != null).sort(byCost)[0] ??
    comp.sort((a, b) => b.kw - a.kw)[0] ??
    null;
  const avail = availability(ch.evses, now);
  const uniq = [...new Map(gs.map((g) => [`${g.kind}|${g.kw}`, g])).values()].sort((a, b) => a.kw - b.kw);
  const shown = uniq.slice(-2).map((g) => `${PLUG_LABEL[g.kind]} ${fmtKw(g.kw)}`);
  const plugs = shown.join(" + ") + (uniq.length > 2 ? ` +${uniq.length - 2}` : "");
  return {
    ch,
    groups: gs,
    best,
    compatible: comp.length > 0,
    avail,
    allDown: avail.known && avail.total > 0 && avail.down === avail.total,
    plugs,
    maxKw: Math.max(0, ...gs.map((g) => g.kw)),
  };
}

/** El enchufe cuyo precio se enseña en listas y mapa: el mejor para tu coche, o el más barato "creíble" */
export function displayGroup(s: Summary, car: Car): ConnGroup | null {
  if (car.electric) return s.best;
  const priced = s.groups.filter((g) => g.price != null);
  const pick = (gs: ConnGroup[]) => gs.sort((a, b) => a.price! - b.price!)[0];
  return pick(priced.filter((g) => !g.doubtful)) ?? pick(priced) ?? null;
}

// ---------- Agrupar postes del mismo sitio ----------

const SITE_KM = 0.08; // postes del mismo operador a menos de 80 m = el mismo sitio

/** Parte común de los nombres ("Cornella Popeyes P05" + "…P02" → "Cornella Popeyes") */
function commonName(names: (string | null)[]): string | null {
  const ns = names.map((n) => (n ?? "").trim()).filter(Boolean);
  if (!ns.length) return null;
  if (ns.every((n) => n === ns[0])) return ns[0];
  let p = ns[0];
  for (const n of ns) {
    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) i++;
    p = p.slice(0, i);
  }
  // Si el corte cae en mitad de una palabra o código, se quita ese trozo
  if (ns.some((n) => n.length > p.length && /\S/.test(n[p.length])) && !/\s$/.test(p)) p = p.replace(/\S+$/, "");
  p = p.replace(/[\s\-_·,.#(/]+$/, "").trim();
  return p.length >= 4 ? p : ns[0];
}

/**
 * Junta en una sola ficha los postes del mismo operador que están en el mismo sitio
 * (REVE los publica como ubicaciones distintas: "Popeyes P01", "P02"…). No cambia ningún dato:
 * solo los presenta juntos. Se conserva el orden de entrada (el primero de cada grupo es el principal).
 */
const siteKey = (c: Pick<Charger, "party" | "operator">) => c.party ?? c.operator ?? null;

/** ¿Son el mismo sitio? Mismo operador (conocido) y a menos de 80 m */
export function sameSite(a: Charger, b: Charger): boolean {
  const k = siteKey(a);
  return k != null && k === siteKey(b) && haversineKm(a.lat, a.lon, b.lat, b.lon) <= SITE_KM;
}

export function groupSites(items: Charger[]): Charger[] {
  const byOp = new Map<string, Charger[]>();
  const out: Charger[] = [];
  for (const it of items) {
    const key = siteKey(it) ?? `?${it.id}`; // sin operador conocido no se agrupa
    const list = byOp.get(key) ?? [];
    if (!byOp.has(key)) byOp.set(key, list);
    const g = list.find((x) => sameSite(x, it));
    if (g) addToSite(g, it);
    else {
      const head: Charger = { ...it, evses: [...it.evses] };
      list.push(head);
      out.push(head);
    }
  }
  return out;
}

function addToSite(g: Charger, it: Charger) {
  const first = g.ids ?? [g.id];
  if (first.includes(it.id)) return;
  g.name = commonName([g.name, it.name]);
  g.ids = [...first, it.id];
  g.evses.push(...it.evses);
  if (it.dist != null && (g.dist == null || it.dist < g.dist)) g.dist = it.dist;
  if (g.h24 && !it.h24) g.h24 = it.h24;
  if (it.updated && (!g.updated || it.updated > g.updated)) g.updated = it.updated;
  if (!g.facilities?.length && it.facilities?.length) g.facilities = it.facilities;
}

/** Une en una sola ficha una lista de ubicaciones que ya sabemos que son el mismo sitio (la primera manda) */
export function mergeChargers(list: Charger[]): Charger {
  const head: Charger = { ...list[0], evses: [...list[0].evses] };
  for (const it of list.slice(1)) addToSite(head, it);
  return head;
}

/** Enlace a la ficha (con los demás postes del sitio, si los hay) */
export function chargerHref(ch: Pick<Charger, "id" | "ids">): string {
  const rest = (ch.ids ?? []).filter((x) => x !== ch.id);
  return `/cargador/${ch.id}${rest.length ? `?g=${rest.join(",")}` : ""}`;
}

/** Entre los cargadores que te sirven y funcionan, el que antes te llena la batería */
export function fastestOption(list: Summary[], car: Car, now = Date.now()): { s: Summary; g: ConnGroup } | null {
  let best: { s: Summary; g: ConnGroup } | null = null;
  for (const s of list) {
    if (s.allDown || (car.electric && !s.compatible)) continue;
    for (const g of s.groups) {
      if ((car.electric && !g.compatible) || !g.evses.some((e) => !evseDown(e, now))) continue;
      const better =
        !best ||
        g.fill.minutes < best.g.fill.minutes ||
        (g.fill.minutes === best.g.fill.minutes && (g.fill.cost ?? Infinity) < (best.g.fill.cost ?? Infinity));
      if (better) best = { s, g };
    }
  }
  return best;
}

// ---------- Operadores ----------

type CpoStyle = { name: string; mark: string; bg: string; fg: string };

// Colores aproximados para distinguir operadores de un vistazo (no son logotipos).
const CPO: Record<string, CpoStyle> = {
  ESX: { name: "Endesa X", mark: "EX", bg: "#0A3A8C", fg: "#FFFFFF" },
  IBD: { name: "Iberdrola", mark: "IB", bg: "#2E7D32", fg: "#FFFFFF" },
  REP: { name: "Repsol", mark: "R", bg: "#FF7A00", fg: "#FFFFFF" },
  ETE: { name: "Etecnic", mark: "ET", bg: "#00897B", fg: "#FFFFFF" },
  EMP: { name: "Electromaps", mark: "EM", bg: "#1B1F3B", fg: "#3CE6A0" },
  FCT: { name: "Charging Together", mark: "CT", bg: "#5B2A86", fg: "#FFFFFF" },
  CHT: { name: "Charging Together", mark: "CT", bg: "#5B2A86", fg: "#FFFFFF" },
  ZUN: { name: "Zunder", mark: "ZU", bg: "#111111", fg: "#3CE6A0" },
  GFX: { name: "EDP", mark: "ED", bg: "#E2231A", fg: "#FFFFFF" },
  DLP: { name: "Galp", mark: "GA", bg: "#E5501E", fg: "#FFFFFF" },
  ARE: { name: "Acciona", mark: "AC", bg: "#C8102E", fg: "#FFFFFF" },
  WEN: { name: "Wenea", mark: "WE", bg: "#0096C7", fg: "#FFFFFF" },
  ERA: { name: "Eranovum", mark: "ER", bg: "#3A0CA3", fg: "#FFFFFF" },
  FEN: { name: "Fenie Energía", mark: "FE", bg: "#0072BC", fg: "#FFFFFF" },
  TCB: { name: "TotalEnergies", mark: "TE", bg: "#D52B1E", fg: "#FFFFFF" },
  PLE: { name: "Plenoil", mark: "PL", bg: "#00A651", fg: "#FFFFFF" },
  PLC: { name: "Plenoil", mark: "PL", bg: "#00A651", fg: "#FFFFFF" },
  AEQ: { name: "Qwello", mark: "QW", bg: "#00A88F", fg: "#FFFFFF" },
  MOE: { name: "Moeve", mark: "M", bg: "#0B5D57", fg: "#FFFFFF" },
  ATE: { name: "Atlante", mark: "AT", bg: "#00A676", fg: "#FFFFFF" },
  TSL: { name: "Tesla", mark: "T", bg: "#CC0000", fg: "#FFFFFF" },
  IOY: { name: "Ionity", mark: "IO", bg: "#2B2E83", fg: "#FFFFFF" },
  CRF: { name: "Carrefour", mark: "CA", bg: "#1E5BC6", fg: "#FFFFFF" },
  NTG: { name: "Naturgy", mark: "NA", bg: "#E57200", fg: "#FFFFFF" },
  BSM: { name: "BSM Barcelona", mark: "BS", bg: "#D0021B", fg: "#FFFFFF" },
  EMT: { name: "EMT Madrid", mark: "EMT", bg: "#1A4C9C", fg: "#FFFFFF" },
  PWH: { name: "Punto Recargas", mark: "PR", bg: "#3B4655", fg: "#FFFFFF" },
  RSM: { name: "Remo", mark: "RE", bg: "#3B4655", fg: "#FFFFFF" },
  PRR: { name: "Prio", mark: "PR", bg: "#F28C00", fg: "#FFFFFF" },
  CPI: { name: "ChargePoint", mark: "CP", bg: "#F28C00", fg: "#FFFFFF" },
  EPK: { name: "Maksu", mark: "MK", bg: "#3B4655", fg: "#FFFFFF" },
};

const LEGAL = /[\s,.]+(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?l\.?\s?l\.?|gmbh(\s.*)?|sucursal(\s.*)?|ltd\.?|b\.?v\.?)$/i;

function cleanCompany(op: string): string {
  let s = op.trim();
  const paren = s.match(/^\(([^)]+)\)/);
  if (paren) s = paren[1];
  for (let i = 0; i < 3; i++) s = s.replace(LEGAL, "").trim();
  if (s === s.toUpperCase()) s = titleCase(s);
  return s || op;
}

export function cpoStyle(party: string | null, operator: string | null): CpoStyle {
  const known = party && Object.hasOwn(CPO, party) ? CPO[party] : undefined;
  if (known) return known;
  const name = cleanCompany(operator ?? party ?? "Punto de recarga");
  const words = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const mark = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  return { name, mark, bg: "#3B4655", fg: "#FFFFFF" };
}

const pretty = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  if (!t) return "";
  return t === t.toUpperCase() && /[A-Z]/.test(t) ? titleCase(t) : t;
};

export const shortAddress = (a: string | null) => pretty((a ?? "").split(",")[0]).replace(/\s+\d{5}$/, "");
export const prettyAddress = (a: string | null) => pretty(a);
export const prettyCity = (c: string | null) => pretty(c);

/** Nombre legible: muchos operadores ponen un código como nombre ("22XP22T3KKJAK00263") */
export function chargerName(ch: Charger): string {
  const brand = cpoStyle(ch.party, ch.operator).name;
  const n = (ch.name ?? "").trim();
  // Códigos sin espacios con números ("22XP22T3KKJAK00263", "B-CornelladeLlobregat-005")
  const codeLike = !n || (/^\S{6,}$/.test(n) && /\d/.test(n)) || /^ES\*/.test(n);
  if (codeLike) return `${brand} · ${shortAddress(ch.address) || prettyCity(ch.city)}`;
  const nice = pretty(n);
  return nice.toLowerCase().includes(brand.toLowerCase().split(" ")[0]) ? nice : `${brand} · ${nice}`;
}

// ---------- Textos de la ficha ----------

const CAPS: Record<string, string> = {
  CREDIT_CARD_PAYABLE: "Tarjeta bancaria",
  DEBIT_CARD_PAYABLE: "Tarjeta bancaria",
  CONTACTLESS_CARD_SUPPORT: "Contactless",
  PED_TERMINAL: "Datáfono",
  RFID_READER: "Tarjeta RFID",
  CHIP_CARD_SUPPORT: "Tarjeta con chip",
  REMOTE_START_STOP_CAPABLE: "App",
};

export function paymentMethods(ch: Charger): string[] {
  const set = new Set<string>();
  const brand = cpoStyle(ch.party, ch.operator).name;
  for (const e of ch.evses) for (const c of e.cap ?? []) if (Object.hasOwn(CAPS, c)) set.add(CAPS[c] === "App" ? `App ${brand}` : CAPS[c]);
  return [...set];
}

export const reservable = (ch: Charger) => ch.evses.some((e) => e.cap?.includes("RESERVABLE"));

const PARKING: Record<string, string> = {
  ON_STREET: "En la calle",
  PARKING_GARAGE: "Dentro de un parking",
  UNDERGROUND_GARAGE: "Parking subterráneo",
  PARKING_LOT: "Aparcamiento",
  ON_DRIVEWAY: "Acceso privado",
  ALONG_MOTORWAY: "Junto a la autovía",
};
export const parkingText = (p: string | null | undefined) => (p && Object.hasOwn(PARKING, p) ? PARKING[p] : null);

const FAC: Record<string, string> = {
  HOTEL: "Hotel",
  RESTAURANT: "Restaurante",
  CAFE: "Cafetería",
  MALL: "Centro comercial",
  SUPERMARKET: "Supermercado",
  SPORT: "Instalación deportiva",
  RECREATION_AREA: "Zona de ocio",
  NATURE: "Naturaleza",
  MUSEUM: "Museo",
  BIKE_SHARING: "Bici compartida",
  BUS_STOP: "Parada de bus",
  TAXI_STAND: "Parada de taxi",
  TRAM_STOP: "Tranvía",
  METRO_STATION: "Metro",
  TRAIN_STATION: "Estación de tren",
  AIRPORT: "Aeropuerto",
  PARKING_LOT: "Aparcamiento",
  CARPOOL_PARKING: "Parking compartido",
  FUEL_STATION: "Gasolinera",
  WIFI: "WiFi",
};
export const facilitiesText = (f: string[] | null | undefined) => (f ?? []).map((x) => (Object.hasOwn(FAC, x) ? FAC[x] : null)).filter(Boolean) as string[];

const DAY = ["", "L", "M", "X", "J", "V", "S", "D"];

export function openingText(ch: Charger): string | null {
  if (ch.h24 || ch.opening?.twentyfourseven) return "Abierto 24 h";
  const rh = ch.opening?.regular_hours;
  if (!rh?.length) return null;
  const byDay = new Map<number, string[]>();
  for (const h of rh) byDay.set(h.weekday, [...(byDay.get(h.weekday) ?? []), `${h.period_begin}–${h.period_end}`]);
  const parts: string[] = [];
  let start = 0;
  let prev = "";
  for (let d = 1; d <= 8; d++) {
    const cur = d <= 7 ? (byDay.get(d) ?? []).join(", ") || "Cerrado" : "";
    if (cur !== prev) {
      if (start && prev) parts.push(`${DAY[start]}${d - 1 > start ? `–${DAY[d - 1]}` : ""} ${prev}`);
      start = d;
      prev = cur;
    }
  }
  return parts.join(" · ");
}

const euro = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

/** "0,39 €/kWh" con IVA */
export const fmtKwhPrice = (p: number | null) => (p == null ? "—" : `${euro(p)} €/kWh`);

const madridToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

const fmtDay = (iso: string) => iso.split("-").reverse().join("/");

function restrictionText(r: TariffRestrictions | null | undefined): string {
  if (!r) return "";
  const out: string[] = [];
  const g = (k: string) => r[k] as string | number | string[] | undefined;
  const st = (g("start_time") as string | undefined) ?? "00:00";
  const et = (g("end_time") as string | undefined) ?? "00:00";
  const wholeDay = st === "00:00" && ["00:00", "23:59", "24:00"].includes(et);
  if ((g("start_time") || g("end_time")) && !wholeDay) out.push(`de ${st} a ${et === "00:00" ? "24:00" : et}`);
  const sd = g("start_date") as string | undefined;
  if (sd && sd > madridToday()) out.push(`desde el ${fmtDay(sd)}`);
  const dow = g("day_of_week");
  if (Array.isArray(dow) && dow.length && dow.length < 7) {
    const map: Record<string, string> = { MONDAY: "L", TUESDAY: "M", WEDNESDAY: "X", THURSDAY: "J", FRIDAY: "V", SATURDAY: "S", SUNDAY: "D" };
    out.push(dow.map((d) => map[d] ?? d).join(", "));
  }
  const minD = Number(g("min_duration"));
  const maxD = Number(g("max_duration"));
  const hasMin = Number.isFinite(minD) && minD > 0;
  const hasMax = Number.isFinite(maxD) && maxD > 0 && maxD < 86400; // más de un día = sin límite
  if (hasMin && hasMax) out.push(`de ${Math.round(minD / 60)} a ${Math.round(maxD / 60)} min`);
  else if (hasMin) out.push(`a partir de ${Math.round(minD / 60)} min`);
  else if (hasMax) out.push(`los primeros ${Math.round(maxD / 60)} min`);
  const minK = Number(g("min_kwh"));
  const maxK = Number(g("max_kwh"));
  if (Number.isFinite(minK) && minK > 0) out.push(`desde ${minK} kWh`);
  if (Number.isFinite(maxK) && maxK > 0) out.push(`hasta ${maxK} kWh`);
  const minP = Number(g("min_power"));
  const maxP = Number(g("max_power"));
  if (Number.isFinite(minP) && minP > 0) out.push(`cargando a más de ${minP} kW`);
  if (Number.isFinite(maxP) && maxP > 0) out.push(`cargando a menos de ${maxP} kW`);
  return out.join(" · ");
}

/** Desglose de la tarifa tal cual la publica el operador en REVE, con IVA */
export function tariffLines(c: Conn): { label: string; value: string; note: string }[] {
  const lines: { label: string; value: string; note: string }[] = [];
  const today = madridToday();
  for (const el of c.el ?? []) {
    const r = el.restrictions ?? {};
    // Fuera lo caducado; lo que empieza más adelante se enseña con su fecha
    const ed = r["end_date"] as string | undefined;
    if (ed && today >= ed) continue;
    const resv = r["reservation"] as string | undefined;
    const note = restrictionText(r);
    for (const pc of el.price_components ?? []) {
      const base = Number(String(pc.price).replace(",", "."));
      if (!Number.isFinite(base)) continue;
      // Los componentes a 0 € no aportan nada y confunden
      if (base === 0) continue;
      const rawVat = pc.vat != null && pc.vat !== "" ? Number(String(pc.vat).replace(",", ".")) : 0;
      const vat = vatPct(Number.isFinite(rawVat) ? rawVat : 0) ?? 0;
      const p = base * (1 + vat / 100);
      if (resv) {
        // Lo que cobran por reservar (o si reservas y no llegas a cargar)
        const label = resv === "RESERVATION_EXPIRES" ? "Si reservas y no llegas a cargar" : "Por reservar";
        const value = pc.type === "FLAT" ? `${euro(p)} €` : pc.type === "ENERGY" ? `${euro(p, 3)} €/kWh` : `${euro(p / 60, 3)} €/min`;
        lines.push({ label, value, note });
        continue;
      }
      switch (pc.type) {
        case "ENERGY":
          lines.push({ label: "Energía", value: `${euro(p, 3)} €/kWh`, note });
          break;
        case "TIME":
          lines.push({ label: "Tiempo cargando", value: `${euro(p / 60, 3)} €/min`, note });
          break;
        case "FLAT":
          lines.push({ label: "Cuota fija por sesión", value: `${euro(p)} € por sesión`, note });
          break;
        case "PARKING_TIME":
          lines.push({ label: "Ocupar la plaza sin cargar", value: `${euro(p / 60, 3)} €/min`, note });
          break;
        case "CONGESTION_TIME":
          lines.push({ label: "Penalización por ocupación", value: `${euro(p / 60, 3)} €/min`, note });
          break;
      }
    }
  }
  if (!lines.length && hasPrice(c)) {
    if (c.e) lines.push({ label: "Energía", value: `${euro(c.e * vatFactor(c), 3)} €/kWh`, note: "" });
    if (c.t) lines.push({ label: "Tiempo cargando", value: `${euro((c.t * vatFactor(c)) / 60, 3)} €/min`, note: "" });
    if (c.f) lines.push({ label: "Cuota fija por sesión", value: `${euro(c.f * vatFactor(c))} € por sesión`, note: "" });
  }
  // Primero lo que pagas siempre; luego penalizaciones y reservas
  const order = (l: { label: string }) => (l.label === "Energía" ? 0 : l.label === "Por recarga" || l.label === "Tiempo cargando" ? 1 : 2);
  // Algunos operadores repiten el mismo elemento: quitamos duplicados exactos
  const seen = new Set<string>();
  const uniq = lines.filter((l) => {
    const k = `${l.label}|${l.value}|${l.note}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return uniq.sort((a, b) => order(a) - order(b));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Precios cargados el …; estado de los puntos actualizado el …" (REVE pide mostrar la fecha de actualización) */
export function datesText(updated: string | null | undefined, prices: string | null | undefined): string {
  if (!prices) return `Datos actualizados el ${fmtDateTime(updated)}.`;
  return `Precios cargados el ${fmtDateTime(prices)}; estado de los puntos actualizado el ${fmtDateTime(updated)}.`;
}

export function minutesAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** Consumo medio para comparar con gasolina */
export const EV_KWH_100KM = 17;

// ---------- Cargadores en una ruta ----------

export type ChargerRouteStop = { charger: Charger; kmAlong: number; offRouteKm: number; detourMin: number; seg: number; bestInSeg?: boolean; bestOverall?: boolean };
export type ChargerRouteResponse = {
  distanceKm: number;
  durationMin: number;
  updated: string | null;
  prices?: string | null;
  considered: number; // puntos de recarga junto a la ruta
  stops: ChargerRouteStop[]; // ordenadas por kilómetro
  segments: { from: number; to: number }[];
  line: [number, number][]; // [lon, lat] para dibujar la ruta
  waypoints: { km: number; label: string }[];
};

/** En viaje, con carga rápida se suele cargar hasta el 80 % (a partir de ahí va muy lenta) */
export const routeTargetPct = (g: ConnGroup) => (g.dc ? 0.8 : 1);

/** El enchufe que usarías en una parada de la ruta: compatible, que funcione y, si se pide, de carga rápida */
export function routeGroup(s: Summary, car: Car, fastOnly: boolean, now = Date.now()): (ConnGroup & { trip: FillEstimate }) | null {
  let gs = s.groups.filter((g) => (!car.electric || g.compatible) && g.evses.some((e) => !evseDown(e, now)));
  if (fastOnly) gs = gs.filter((g) => g.dc);
  if (!gs.length) return null;
  const withTrip = gs.map((g) => ({ ...g, trip: fillEstimate(g.conn, car, routeTargetPct(g)) }));
  const byCost = (a: (typeof withTrip)[number], b: (typeof withTrip)[number]) => a.trip.cost! - b.trip.cost! || a.trip.minutes - b.trip.minutes;
  return (
    withTrip.filter((g) => g.trip.cost != null && !g.doubtful).sort(byCost)[0] ??
    withTrip.filter((g) => g.trip.cost != null).sort(byCost)[0] ??
    withTrip.sort((a, b) => b.kw - a.kw)[0]
  );
}
