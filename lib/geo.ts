const R = 6371; // km

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type BBox = [number, number, number, number]; // minLat, minLon, maxLat, maxLon

export function bboxAround(lat: number, lon: number, km: number): BBox {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function expandBBox(b: BBox, km: number): BBox {
  const midLat = (b[0] + b[2]) / 2;
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((midLat * Math.PI) / 180));
  return [b[0] - dLat, b[1] - dLon, b[2] + dLat, b[3] + dLon];
}

/**
 * Distancia de un punto a una polilínea (coordenadas [lon, lat]) y km recorridos
 * hasta el punto más cercano. Proyección equirectangular local: suficiente a escala de ruta.
 */
export function distanceToPolyline(
  lat: number,
  lon: number,
  line: [number, number][],
  cumKm: number[],
): { dist: number; along: number } {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  let along = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - lon) * kx;
    const ay = (line[i][1] - lat) * ky;
    const bx = (line[i + 1][0] - lon) * kx;
    const by = (line[i + 1][1] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    if (d < best) {
      best = d;
      along = cumKm[i] + t * (cumKm[i + 1] - cumKm[i]);
    }
  }
  return { dist: best, along };
}

export function cumulativeKm(line: [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    out.push(out[i - 1] + haversineKm(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]));
  }
  return out;
}

export function lineBBox(line: [number, number][]): BBox {
  let b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of line) {
    b = [Math.min(b[0], lat), Math.min(b[1], lon), Math.max(b[2], lat), Math.max(b[3], lon)];
  }
  return b;
}
