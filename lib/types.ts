import type { FuelKey } from "./fuels";

export type Prices = Partial<Record<FuelKey, number>>;

export type Station = {
  id: string;
  brand: string; // rótulo tal cual (normalizado a mayúsculas)
  name: string; // "Repsol Cornellà de Llobregat"
  address: string;
  town: string; // localidad
  mun: string; // municipio
  munId: string;
  prov: string;
  provId: string;
  cp: string;
  lat: number;
  lon: number;
  hours: string; // horario crudo del Ministerio
  prices: Prices;
  dist?: number; // km desde el punto consultado (línea recta)
  /** Si se aplica un descuento del usuario: precios de surtidor originales y qué descuento */
  listPrices?: Prices;
  /** `cts` es el valor en la unidad indicada (céntimos por litro o %). "saldo": no baja el precio que pagas, te lo devuelven en la tarjeta */
  disc?: { label: string; cts: number; unit?: "cts" | "pct"; kind?: "directo" | "saldo" };
};

export type StationsResponse = {
  updatedAt: string | null; // ISO
  center: { lat: number; lon: number };
  radius: number;
  stations: Station[];
};

export type StationDetailResponse = {
  updatedAt: string | null;
  station: Station;
  yesterday: Prices | null;
};

export type HistoryPoint = { date: string; price: number | null };

export type HistoryResponse = {
  fuel: FuelKey;
  points: HistoryPoint[];
};

export type Place = {
  label: string;
  detail: string;
  lat: number;
  lon: number;
};

export type RouteStop = {
  station: Station;
  kmAlong: number;
  offRouteKm: number;
  detourMin: number;
  netSavings: number; // ahorro al llenar frente a la media de la ruta (solo por precio)
  seg: number; // tramo de la ruta (0 = el de salida)
  bestInSeg?: boolean; // la más barata de su tramo
  bestOverall?: boolean; // la más barata de todo el viaje
};
export type RouteSegment = { from: number; to: number }; // en km

export type RouteResponse = {
  distanceKm: number;
  durationMin: number;
  fuel: FuelKey;
  average: number | null;
  stops: RouteStop[]; // ordenadas por kilómetro
  segments: RouteSegment[];
  line: [number, number][]; // [lon, lat] para dibujar la ruta
  waypoints: { km: number; label: string }[];
};
