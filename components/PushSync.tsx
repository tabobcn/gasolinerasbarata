"use client";

import { useEffect } from "react";
import { alertsStore, favoritesStore, lastLocationStore, placesStore } from "@/lib/store";
import { discountsStore } from "@/lib/discountStore";
import { pushStore, syncPush } from "@/lib/push";

/** Mantiene al día en el servidor las alertas de este móvil (solo si los avisos push están activados) */
export function PushSync() {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const later = (ms: number) => {
      if (!pushStore.get().on) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => void syncPush(), ms);
    };
    later(4000); // al abrir la app
    const offs = [alertsStore, placesStore, favoritesStore, discountsStore].map((s) => s.subscribe(() => later(2500)));
    offs.push(lastLocationStore.subscribe(() => later(8000)));
    return () => {
      if (t) clearTimeout(t);
      offs.forEach((off) => off());
    };
  }, []);
  return null;
}
