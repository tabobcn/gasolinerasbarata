"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { recordVisit, settingsStore, useSettings, type NavApp } from "@/lib/store";
import { fmtKm, etaMin } from "@/lib/format";
import type { Station } from "@/lib/types";
import { BrandTile, Sheet } from "./ui";
import { Icon } from "./Icon";

export function navUrl(app: NavApp, s: { lat: number; lon: number }, waypointFrom?: { origin: { lat: number; lon: number }; destination: { lat: number; lon: number } }) {
  const dest = `${s.lat},${s.lon}`;
  if (app === "waze") return `https://waze.com/ul?ll=${dest}&navigate=yes`;
  if (waypointFrom) {
    const o = `${waypointFrom.origin.lat},${waypointFrom.origin.lon}`;
    const d = `${waypointFrom.destination.lat},${waypointFrom.destination.lon}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&waypoints=${dest}&travelmode=driving`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

type Target = Pick<Station, "lat" | "lon" | "name" | "address" | "brand"> & { dist?: number };
type Ctx = { goTo: (s: Target, opts?: { forceAsk?: boolean }) => void };
const NavCtx = createContext<Ctx | null>(null);

const APPS: { id: NavApp; name: string; hint: string }[] = [
  { id: "maps", name: "Google Maps", hint: "Ruta con tráfico en tiempo real" },
  { id: "waze", name: "Waze", hint: "Avisos de radares y atascos" },
];

export function NavigateProvider({ children }: { children: React.ReactNode }) {
  const [settings] = useSettings();
  const [target, setTarget] = useState<Target | null>(null);
  const [app, setApp] = useState<NavApp>("maps");
  const [remember, setRemember] = useState(true);

  const goTo = useCallback<Ctx["goTo"]>((s, opts) => {
    const st = s as Partial<Station>; // las gasolineras traen id y municipio; los cargadores no
    if (st.id && st.munId) recordVisit({ id: st.id, m: st.munId, name: s.name, brand: s.brand, how: "ir" });
    const saved = settingsStore.get().navApp;
    if (saved && !opts?.forceAsk) {
      window.open(navUrl(saved, s), "_blank", "noopener");
      return;
    }
    setApp(saved ?? "maps");
    setTarget(s);
  }, []);

  const close = useCallback(() => setTarget(null), []);
  const value = useMemo(() => ({ goTo }), [goTo]);
  const cur = APPS.find((a) => a.id === app)!;

  return (
    <NavCtx.Provider value={value}>
      {children}
      <Sheet open={!!target} onClose={close} label="Elegir app para ir">
        {target && (
          <div className="stack-16">
            <div className="row-12">
              <BrandTile brand={target.brand} size={44} />
              <div className="col-2 min0">
                <h2 className="h-sheet">¿Con qué app quieres ir?</h2>
                <span className="muted sm ellipsis">
                  {target.name}
                  {target.dist != null ? ` · ${fmtKm(target.dist)} · ${etaMin(target.dist)} min` : ""}
                </span>
              </div>
            </div>
            <div className="note green">
              <Icon name="pin" size={18} />
              <span>Te llevamos a las coordenadas GPS de la gasolinera, no solo a la calle</span>
            </div>
            <div className="stack-8" role="radiogroup" aria-label="App de navegación">
              {APPS.map((a) => {
                const on = a.id === app;
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={on} className={`app-option${on ? " on" : ""}`} onClick={() => setApp(a.id)}>
                    <span className="app-tile" aria-hidden="true">
                      {a.id === "maps" ? <Icon name="pin" size={24} color="#1F6FB2" /> : <WazeGlyph />}
                    </span>
                    <span className="col-2 grow">
                      <span className="b16">{a.name}</span>
                      <span className="muted sm">{a.hint}</span>
                    </span>
                    <span className={`radio${on ? " on" : ""}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <label className="check-row">
              <input type="checkbox" checked={remember} onChange={() => setRemember((r) => !r)} />
              Recordar mi elección y abrirla directamente
            </label>
            <a
              className="btn primary big"
              href={navUrl(app, target)}
              target="_blank"
              rel="noopener"
              onClick={() => {
                if (remember) settingsStore.set((s) => ({ ...s, navApp: app }));
                setTimeout(close, 50);
              }}
            >
              <Icon name="navigate" size={20} stroke={2.4} />
              Abrir {cur.name}
            </a>
            <button type="button" className="btn ghost" onClick={close}>
              Cancelar
            </button>
            {settings.navApp && <span className="muted xs center">Puedes cambiar la app en Ajustes</span>}
          </div>
        )}
      </Sheet>
    </NavCtx.Provider>
  );
}

function WazeGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0E1726" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 15.5C3 14.5 2.5 12.8 2.8 11c.6-4.2 4.5-7.5 9.4-7.5 5.1 0 9.3 3.6 9.3 8.1 0 3.6-2.6 6.2-6.5 6.9" />
      <path d="M9.5 18.6c1.3.2 2.7.2 4 0" />
      <circle cx="7.5" cy="18.5" r="1.8" />
      <circle cx="15.5" cy="18.5" r="1.8" />
      <circle cx="10" cy="10" r=".6" fill="#0E1726" />
      <circle cx="15" cy="10" r=".6" fill="#0E1726" />
      <path d="M10 13.2c1.2 1 3 1 4.2 0" />
    </svg>
  );
}

export function useNavigate() {
  const c = useContext(NavCtx);
  if (!c) throw new Error("useNavigate fuera de NavigateProvider");
  return c.goTo;
}
