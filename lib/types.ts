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
  netSavings: number;
};

export type RouteResponse = {
  distanceKm: number;
  durationMin: number;
  fuel: FuelKey;
  average: number | null;
  stops: RouteStop[];
  waypoints: { km: number; label: string }[];
};
