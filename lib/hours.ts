/**
 * Interpreta el campo "Horario" del Ministerio, p. ej.:
 *   "L-D: 24H"
 *   "L-V: 07:00-22:00; S: 08:00-22:00; D: 10:00-22:00"
 *   "L-S: 06:00-14:00 y 16:00-21:00"
 */
const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"]; // lunes = 0

type Range = [number, number]; // minutos desde medianoche; fin puede ser > 1440
type Week = Range[][]; // 7 días

function parseDays(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(/[,y]/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^([LMXJVSD])\s*-\s*([LMXJVSD])$/);
    if (m) {
      let a = DAY_LETTERS.indexOf(m[1]);
      const b = DAY_LETTERS.indexOf(m[2]);
      for (let i = 0; i < 7; i++) {
        out.add(a);
        if (a === b) break;
        a = (a + 1) % 7;
      }
    } else if (DAY_LETTERS.includes(part)) {
      out.add(DAY_LETTERS.indexOf(part));
    }
  }
  return [...out];
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function parseRanges(spec: string): Range[] {
  if (/24\s*H/i.test(spec)) return [[0, 1440]];
  const out: Range[] = [];
  const re = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spec))) {
    let a = toMin(m[1]);
    let b = toMin(m[2]);
    if (b === 1439 || (a === 0 && b === 0)) b = 1440; // 00:00-23:59 ⇒ 24 h
    if (b <= a) b += 1440; // cruza medianoche
    out.push([a, b]);
  }
  return out;
}

export function parseSchedule(raw: string): Week | null {
  if (!raw || !raw.trim()) return null;
  const week: Week = Array.from({ length: 7 }, () => []);
  const segments = raw.split(";").map((s) => s.trim()).filter(Boolean);
  let any = false;
  for (const seg of segments) {
    const idx = seg.indexOf(": ");
    if (idx < 0) continue;
    const days = parseDays(seg.slice(0, idx));
    const ranges = parseRanges(seg.slice(idx + 2));
    for (const d of days) {
      week[d].push(...ranges);
      any = true;
    }
  }
  if (!any) return null;
  // "L: 24H" sin más días suele significar todos los días (dato incompleto del Ministerio)
  const filled = week.filter((d) => d.length).length;
  if (filled === 1 && segments.length === 1 && week[0].length) {
    for (let i = 1; i < 7; i++) week[i] = [...week[0]];
  }
  return week;
}

function nowInZone(timeZone: string): { day: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  return { day, min: h * 60 + m };
}

const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export type OpenStatus = { open: boolean | null; label: string; is24h: boolean };

export function openStatus(raw: string, provId?: string): OpenStatus {
  const week = parseSchedule(raw);
  if (!week) return { open: null, label: "Horario no disponible", is24h: false };
  const tz = provId === "35" || provId === "38" ? "Atlantic/Canary" : "Europe/Madrid";
  const { day, min } = nowInZone(tz);
  const is24h = week.every((d) => d.some(([a, b]) => a === 0 && b >= 1440));
  if (is24h) return { open: true, label: "Abierta 24 h", is24h: true };

  const today = week[day];
  const yesterday = week[(day + 6) % 7];
  // ¿Sigue abierto un tramo de ayer que cruza la medianoche?
  for (const [a, b] of yesterday) {
    if (b > 1440 && min < b - 1440) return { open: true, label: `Abierta hasta las ${fmt(b)}`, is24h };
  }
  for (const [a, b] of today) {
    if (min >= a && min < b) {
      return { open: true, label: b >= 1440 && a === 0 ? "Abierta todo el día" : `Abierta hasta las ${fmt(b)}`, is24h };
    }
  }
  const later = today.filter(([a]) => a > min).sort((x, y) => x[0] - y[0])[0];
  if (later) return { open: false, label: `Cerrada · abre a las ${fmt(later[0])}`, is24h };
  for (let i = 1; i <= 7; i++) {
    const d = week[(day + i) % 7];
    if (d.length) {
      const first = [...d].sort((x, y) => x[0] - y[0])[0];
      const dayName = i === 1 ? "mañana" : ["el lunes", "el martes", "el miércoles", "el jueves", "el viernes", "el sábado", "el domingo"][(day + i) % 7];
      return { open: false, label: `Cerrada · abre ${dayName} a las ${fmt(first[0])}`, is24h };
    }
  }
  return { open: false, label: "Cerrada", is24h };
}

/** Horario legible para la ficha: "L-V: 07:00-22:00 · S: 08:00-22:00" */
export function prettySchedule(raw: string): string {
  if (!raw) return "";
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/24H/i, "24 h"))
    .join(" · ");
}
