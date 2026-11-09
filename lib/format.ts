export function fmtPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(3).replace(".", ",");
}

export function fmtEuros(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(".", ",");
}

export function fmtKm(km: number | null | undefined): string {
  if (km == null) return "";
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

/** Minutos aproximados en ciudad (≈ 30 km/h efectivos) */
export function etaMin(km: number): number {
  return Math.max(1, Math.round((km * 1.3) / 30 * 60));
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

export function fmtCents(diffEuros: number): string {
  const c = Math.round(Math.abs(diffEuros) * 100);
  return `${c} ${c === 1 ? "ct" : "cts"}`;
}

export function signedCents(diffEuros: number): string {
  const c = Math.round(diffEuros * 1000) / 10; // décimas de céntimo
  if (Math.abs(c) < 0.5) return "=";
  const r = Math.round(c);
  return `${r > 0 ? "+" : "−"}${Math.abs(r)} ${Math.abs(r) === 1 ? "ct" : "cts"}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "Actualizado ahora";
  if (min < 60) return `Actualizado hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Actualizado hace ${h} h`;
  return "Actualizado hace más de un día";
}

const LOWER = new Set(["de", "del", "la", "las", "los", "el", "y", "i", "en", "a", "al", "s/n", "km", "d'", "l'"]);

/** "CALLE HOSTAL DEL PI S/N" → "Calle Hostal del Pi S/N" */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-|\/|,|\.)/)
    .map((w, i) => {
      if (!w.trim() || /^[\s\-/,.]+$/.test(w)) return w;
      if (w === "s/n") return "S/N";
      if (i > 0 && LOWER.has(w)) return w;
      if (/^(d'|l')/.test(w)) return w.slice(0, 2) + w.charAt(2).toUpperCase() + w.slice(3);
      if (/^[ivx]+$/.test(w) && w.length <= 4) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("")
    .replace(/\bS\/n\b/g, "S/N")
    .replace(/\bN-(\w)/g, (m) => m.toUpperCase())
    .replace(/\b([a-z]{1,3}-\d{1,4})\b/gi, (m) => m.toUpperCase());
}

/** Fecha de hoy en España (AAAA-MM-DD); new Date().toISOString() da la de UTC y falla de 00:00 a 02:00 */
export function madridDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
}

/** "Calle Calle de Ladera…" → "Calle de Ladera…" (el Ministerio a veces repite la primera palabra) */
export function cleanAddress(a: string): string {
  return a.replace(/^(\S+)\s+\1\b/i, "$1").replace(/\s{2,}/g, " ").trim();
}

const STREET_ABBR: [RegExp, string][] = [
  [/^(calle|carrer|rúa|rua|kalea)\s+/i, "C/ "],
  [/^(avenida|avinguda|avda\.?|avd\.?)\s+/i, "Av. "],
  [/^(carretera|ctra\.?|cr\.?)\s+/i, "Ctra. "],
  [/^(pol[ií]gono industrial|pol[ií]gon industrial)\s+/i, "P.I. "],
  [/^(pol[ií]gono|pol[ií]gon)\s+/i, "Pol. "],
  [/^(paseo|passeig)\s+/i, "Pº "],
  [/^(plaza|plaça)\s+/i, "Pl. "],
];

/** Dirección abreviada para las filas de las listas: "Avenida de Carrilet, 269" → "Av. de Carrilet, 269" */
export function shortStreet(a: string | null | undefined): string {
  let s = (a ?? "").trim();
  for (const [re, to] of STREET_ABBR) {
    if (re.test(s)) {
      s = s.replace(re, to);
      break;
    }
  }
  return s;
}
