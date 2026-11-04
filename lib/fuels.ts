export type FuelKey = "goa" | "g95" | "g98" | "goap" | "g95p" | "e10" | "glp" | "gnc";

export type Fuel = {
  key: FuelKey;
  label: string; // nombre completo
  chip: string; // nombre corto para chips
  field: string; // campo en la API del Ministerio
};

export const FUELS: Fuel[] = [
  { key: "goa", label: "Diésel", chip: "Diésel", field: "Precio Gasoleo A" },
  { key: "g95", label: "Gasolina 95", chip: "Gasolina 95", field: "Precio Gasolina 95 E5" },
  { key: "g98", label: "Gasolina 98", chip: "G98", field: "Precio Gasolina 98 E5" },
  { key: "goap", label: "Diésel Premium", chip: "Diésel+", field: "Precio Gasoleo Premium" },
  { key: "g95p", label: "Gasolina 95 Premium", chip: "G95+", field: "Precio Gasolina 95 E5 Premium" },
  { key: "e10", label: "Gasolina 95 E10", chip: "E10", field: "Precio Gasolina 95 E10" },
  { key: "glp", label: "GLP (autogas)", chip: "GLP", field: "Precio Gases licuados del petróleo" },
  { key: "gnc", label: "Gas natural (GNC)", chip: "GNC", field: "Precio Gas Natural Comprimido" },
];

export const FUEL_KEYS = FUELS.map((f) => f.key);

export function fuelByKey(key: string | null | undefined): Fuel | undefined {
  return FUELS.find((f) => f.key === key);
}

export function isFuelKey(key: unknown): key is FuelKey {
  return typeof key === "string" && (FUEL_KEYS as string[]).includes(key);
}

/** Acepta también los nombres que usa llenatucoche (?fuel=Gasolina95) */
export function parseFuelParam(v: string | null): FuelKey | null {
  if (!v) return null;
  if (isFuelKey(v)) return v;
  const n = v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, FuelKey> = {
    diesel: "goa",
    gasoleo: "goa",
    gasoleoa: "goa",
    gasolina95: "g95",
    g95: "g95",
    gasolina98: "g98",
    g98: "g98",
    dieselpremium: "goap",
    glp: "glp",
    gnc: "gnc",
  };
  return map[n] ?? null;
}
