import type { CSSProperties } from "react";
import { titleCase } from "./format";

export type BrandStyle = { mark: string; bg: string; fg: string; stripe?: string; logo?: string };

// Colores aproximados para reconocer la marca de un vistazo (no son logotipos).
const KNOWN: Record<string, BrandStyle & { name?: string }> = {
  REPSOL: { mark: "R", bg: "#FF7A00", fg: "#FFFFFF", stripe: "#D7141A", name: "Repsol" },
  "REPSOL BUTANO": { mark: "R", bg: "#FF7A00", fg: "#FFFFFF", stripe: "#D7141A", name: "Repsol" },
  CAMPSA: { mark: "CA", bg: "#C8102E", fg: "#FFFFFF", name: "Campsa" },
  "CAMPSA EXPRESS": { mark: "CA", bg: "#C8102E", fg: "#FFFFFF", name: "Campsa Express" },
  PETRONOR: { mark: "PN", bg: "#E30613", fg: "#FFFFFF", name: "Petronor" },
  MOEVE: { mark: "M", bg: "#0B5D57", fg: "#FFFFFF", name: "Moeve" },
  CEPSA: { mark: "C", bg: "#E2231A", fg: "#FFFFFF", name: "Cepsa" },
  BP: { mark: "bp", bg: "#009B3A", fg: "#FFE600", name: "BP" },
  SHELL: { mark: "S", bg: "#FFD500", fg: "#DD1D21", name: "Shell" },
  GALP: { mark: "G", bg: "#F15A22", fg: "#FFFFFF", name: "Galp" },
  BALLENOIL: { mark: "BA", bg: "#0090D4", fg: "#FFFFFF", name: "Ballenoil" },
  PLENERGY: { mark: "PL", bg: "#5B2C83", fg: "#FFFFFF", name: "Plenergy" },
  PLENOIL: { mark: "PL", bg: "#5B2C83", fg: "#FFFFFF", name: "Plenoil" },
  PETROPRIX: { mark: "PX", bg: "#1D3C8F", fg: "#FFFFFF", name: "Petroprix" },
  CARREFOUR: { mark: "CF", bg: "#1E4FA0", fg: "#FFFFFF", stripe: "#E1251B", name: "Carrefour" },
  ALCAMPO: { mark: "AL", bg: "#E2001A", fg: "#FFFFFF", name: "Alcampo" },
  EROSKI: { mark: "ER", bg: "#E30613", fg: "#FFFFFF", name: "Eroski" },
  AVIA: { mark: "AV", bg: "#D2001E", fg: "#FFFFFF", name: "Avia" },
  Q8: { mark: "Q8", bg: "#003B7A", fg: "#F9B000", name: "Q8" },
  ESCLATOIL: { mark: "ES", bg: "#00843D", fg: "#FFFFFF", name: "Esclatoil" },
  BONAREA: { mark: "bà", bg: "#00873E", fg: "#FFFFFF", name: "bonÀrea" },
  ENI: { mark: "E", bg: "#FFD100", fg: "#111111", name: "Eni" },
  DISA: { mark: "D", bg: "#003DA5", fg: "#FFFFFF", name: "Disa" },
  TAMOIL: { mark: "T", bg: "#E4002B", fg: "#FFFFFF", name: "Tamoil" },
  MEROIL: { mark: "ME", bg: "#00A0E1", fg: "#FFFFFF", name: "Meroil" },
  PETROCAT: { mark: "PC", bg: "#C4161C", fg: "#FFFFFF", name: "Petrocat" },
  "PETROCAT DIRECTE": { mark: "PC", bg: "#C4161C", fg: "#FFFFFF", name: "Petrocat Directe" },
  "E.LECLERC": { mark: "LE", bg: "#0066B3", fg: "#FFFFFF", name: "E.Leclerc" },
  VALCARCE: { mark: "VA", bg: "#00529B", fg: "#FFFFFF", name: "Valcarce" },
  NATURGY: { mark: "N", bg: "#004571", fg: "#F7A600", name: "Naturgy" },
};

// Logotipos en public/iconos (PNG cuadrado). Si una marca no tiene archivo, se dibuja la ficha de color.
const LOGO_FILES: Record<string, string> = {
  REPSOL: "repsol", "REPSOL BUTANO": "repsol", CAMPSA: "campsa", "CAMPSA EXPRESS": "campsa", PETRONOR: "petronor",
  MOEVE: "moeve", CEPSA: "cepsa", BP: "bp", SHELL: "shell", GALP: "galp", BALLENOIL: "ballenoil", PLENERGY: "plenergy",
  PLENOIL: "plenoil", PETROPRIX: "petroprix", CARREFOUR: "carrefour", ALCAMPO: "alcampo", EROSKI: "eroski", AVIA: "avia",
  Q8: "q8", ESCLATOIL: "esclatoil", BONAREA: "bonarea", ENI: "eni", DISA: "disa", TAMOIL: "tamoil", MEROIL: "meroil",
  PETROCAT: "petrocat", "PETROCAT DIRECTE": "petrocat", "E.LECLERC": "eleclerc", VALCARCE: "valcarce", NATURGY: "naturgy",
};
for (const [k, f] of Object.entries(LOGO_FILES)) if (KNOWN[k]) KNOWN[k].logo = `/iconos/${f}.png`;

/** Marcas conocidas (sin repetir nombre), para elegir en "Añadir otro descuento" */
export function knownBrandList(): { key: string; name: string }[] {
  const seen = new Set<string>();
  const out: { key: string; name: string }[] = [];
  for (const [key, v] of Object.entries(KNOWN)) {
    const name = v.name ?? key;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ key, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const PALETTE = ["#334155", "#3F4E6B", "#4B5563", "#2E5E4E", "#5B4636", "#4A3F6B", "#3B5B6B"];

export function brandKey(rotulo: string): string {
  return rotulo.trim().toUpperCase().replace(/\s+/g, " ");
}

const KNOWN_KEYS = Object.keys(KNOWN).sort((a, b) => b.length - a.length);

/** Marca conocida contenida en el rótulo ("E.S. ALCAMPO SANT BOI" → "ALCAMPO") */
export function knownBrand(brand: string): string | null {
  const k = brandKey(brand);
  if (KNOWN[k]) return k;
  const words = ` ${k.replace(/[^A-Z0-9À-Ü.&]+/g, " ")} `;
  return KNOWN_KEYS.find((key) => words.includes(` ${key} `)) ?? null;
}

export function brandStyle(brand: string): BrandStyle {
  const k = brandKey(brand);
  const known = knownBrand(k);
  if (known) return KNOWN[known];
  const clean = k.replace(/[^A-ZÀ-Ü0-9 ]/g, "").trim() || "?";
  const words = clean.split(" ").filter(Boolean);
  const mark = (words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 2)).toUpperCase();
  let h = 0;
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { mark, bg: PALETTE[h % PALETTE.length], fg: "#FFFFFF" };
}

export function brandName(brand: string): string {
  const k = brandKey(brand);
  if (KNOWN[k]?.name) return KNOWN[k].name!;
  if (k === "(SIN RÓTULO)" || k === "SIN ROTULO" || !k) return "Gasolinera";
  return titleCase(k).replace(/^E\.?s\.?\s/i, "E.S. ");
}

/** Nombre visible: "Repsol Cornellà de Llobregat"; si el rótulo ya es largo y propio, se usa tal cual. */
export function stationName(brand: string, mun: string): string {
  const k = brandKey(brand);
  if (KNOWN[k]) return `${KNOWN[k].name} ${mun}`.trim();
  const name = brandName(k);
  if (name === "Gasolinera") return `Gasolinera ${mun}`.trim();
  return k.split(" ").length >= 3 ? name : `${name} ${mun}`.trim();
}

/** "Vendrell (El)" → "El Vendrell", "Hospitalet de Llobregat (L')" → "L'Hospitalet de Llobregat" */
export function fixMunicipality(m: string): string {
  const match = m.match(/^(.*)\s+\(([^)]+)\)$/);
  if (!match) return m;
  const art = match[2].trim();
  return art.endsWith("'") ? `${art}${match[1]}` : `${art} ${match[1]}`;
}

/** Estilo de la imagen del logotipo dentro de la ficha */
export const LOGO_IMG: CSSProperties = { width: "84%", height: "84%", objectFit: "contain", display: "block" };

export function tileCss(b: BrandStyle, size: number): CSSProperties {
  if (b.logo)
    return {
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.3),
      background: "#FFFFFF",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      boxSizing: "border-box",
      overflow: "hidden",
      boxShadow: "inset 0 0 0 1px rgba(14, 23, 38, 0.1)",
    };
  return {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.3),
    background: b.bg,
    color: b.fg,
    fontWeight: 900,
    fontSize: Math.round(size * (b.mark.length > 1 ? 0.38 : 0.5)),
    letterSpacing: "-0.5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxSizing: "border-box",
    boxShadow: b.stripe ? `inset 0 -${Math.max(3, Math.round(size / 6))}px 0 ${b.stripe}` : undefined,
  };
}
