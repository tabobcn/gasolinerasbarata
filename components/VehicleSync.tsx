"use client";

import { useEffect } from "react";
import { ensureGarage, garageStore, saveActiveVehicle, settingsStore } from "@/lib/store";

/**
 * Mantiene al día el vehículo en uso: si se cambia el combustible elegido o el depósito desde cualquier pantalla,
 * se guarda en ese vehículo. También pasa al sistema de vehículos a quien ya tenía su coche configurado.
 */
export function VehicleSync() {
  useEffect(() => {
    ensureGarage();
    let last = "";
    const key = () => {
      const s = settingsStore.get();
      return JSON.stringify([s.carName, s.carType, s.fuels, s.fuel, s.tank, s.battery, s.ac, s.dc, s.plugs]);
    };
    last = key();
    return settingsStore.subscribe(() => {
      const k = key();
      if (k === last) return;
      last = k;
      if (garageStore.get().active) saveActiveVehicle();
      else ensureGarage();
    });
  }, []);
  return null;
}
