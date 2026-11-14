"use client";

import { Icon } from "./Icon";
import { Stepper } from "./ui";
import type { CarType, Settings } from "@/lib/store";
import { FUELS, type FuelKey } from "@/lib/fuels";

/** Tipos de coche y los combustibles que se marcan al elegirlos (luego se pueden cambiar) */
export const CAR_TYPES: { id: CarType; label: string; fuels: FuelKey[] }[] = [
  { id: "gas", label: "Gasolina", fuels: ["g95", "g98"] },
  { id: "diesel", label: "Diésel", fuels: ["goa", "goap"] },
  { id: "phev", label: "Híbrido enchufable", fuels: ["g95"] },
  { id: "ev", label: "Eléctrico", fuels: [] },
  { id: "glp", label: "GLP / gas", fuels: ["glp", "g95"] },
];
const ACS = [3.7, 7.4, 11, 22];
const DCS = [0, 50, 100, 150];
const PLUGS = [
  { id: "t2", label: "Tipo 2" },
  { id: "ccs2", label: "CCS2" },
  { id: "chademo", label: "CHAdeMO" },
];

const num = (n: number) => String(n).replace(".", ",");

/**
 * Formulario del coche: tipo, nombre, combustibles, depósito y parte eléctrica.
 * Lo usan la bienvenida y la pantalla "Mi coche"; lo que se enseña depende del tipo elegido.
 */
export function CarForm({ s, set, hideType }: { s: Settings; set: (patch: Partial<Settings>) => void; hideType?: boolean }) {
  const toggleFuel = (f: FuelKey) => set({ fuels: s.fuels.includes(f) ? s.fuels.filter((x) => x !== f) : [...s.fuels, f] });
  const togglePlug = (p: string) => set({ plugs: s.plugs.includes(p) ? s.plugs.filter((x) => x !== p) : [...s.plugs, p] });
  const pickType = (t: (typeof CAR_TYPES)[number]) => {
    if (t.id === s.carType) return;
    // Al cambiar de tipo se proponen sus combustibles; en un eléctrico se conservan por si vuelve atrás
    set({ carType: t.id, ...(t.fuels.length ? { fuels: t.fuels, fuel: t.fuels[0] } : {}) });
  };

  const showFuel = s.carType !== "ev";
  const showElec = s.carType === "phev" || s.carType === "ev";
  const kwh = s.battery * 0.8;
  const mins = Math.round((kwh / s.ac) * 60);
  const timeTxt = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;

  return (
    <>
      {!hideType && (
      <section className="card stack-10">
        <h2 className="eyebrow">TIPO DE COCHE</h2>
        <div className="grid-2">
          {CAR_TYPES.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={s.carType === t.id}
              className={`opt tall${s.carType === t.id ? " on" : ""}`}
              style={i === CAR_TYPES.length - 1 && CAR_TYPES.length % 2 === 1 ? { gridColumn: "1 / -1" } : undefined}
              onClick={() => pickType(t)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>
      )}

      <section className="card stack-10">
        <label className="eyebrow" htmlFor="car-name">
          NOMBRE DE TU COCHE (OPCIONAL)
        </label>
        <span className="search-box">
          <Icon name="car" size={20} color="#5B6675" />
          <input id="car-name" type="text" maxLength={40} autoComplete="off" placeholder="Por ejemplo: Cupra Formentor híbrido" value={s.carName ?? ""} onChange={(e) => set({ carName: e.target.value })} />
        </span>
      </section>

      {showFuel && (
        <section className="card stack-14">
          <div className="stack-8">
            <h2 className="eyebrow">COMBUSTIBLES QUE USAS</h2>
            <span className="muted b13">Puedes elegir varios</span>
            <div className="chips wrap">
              {FUELS.map((f) => (
                <button key={f.key} type="button" aria-pressed={s.fuels.includes(f.key)} className={`opt${s.fuels.includes(f.key) ? " on" : ""}`} onClick={() => toggleFuel(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row-between">
            <span className="col-2">
              <span className="b15">Depósito</span>
              <span className="muted b12">Para calcular cuánto cuesta llenarlo</span>
            </span>
            <Stepper value={s.tank} unit="L" min={20} max={120} onChange={(tank) => set({ tank })} labelLess="Menos litros" labelMore="Más litros" />
          </div>
        </section>
      )}

      {showElec && (
        <section className="card stack-16">
          <h2 className="eyebrow blue">PARTE ELÉCTRICA</h2>
          <div className="row-between">
            <span className="col-2">
              <span className="b15">Batería</span>
              <span className="muted b12">Lo que cabe al llenarla</span>
            </span>
            <Stepper value={s.battery} unit="kWh" min={5} max={150} onChange={(battery) => set({ battery })} labelLess="Menos kWh" labelMore="Más kWh" />
          </div>
          <div className="stack-8">
            <span className="col-2">
              <span className="b15">Potencia máxima de carga (normal, AC)</span>
              <span className="muted b12">Viene en la ficha de tu coche</span>
            </span>
            <div className="grid-4">
              {ACS.map((v) => (
                <button key={v} type="button" aria-pressed={s.ac === v} className={`opt blue small${s.ac === v ? " on" : ""}`} onClick={() => set({ ac: v })}>
                  {num(v)} kW
                </button>
              ))}
            </div>
          </div>
          <div className="stack-8">
            <span className="b15">Carga rápida (DC)</span>
            <div className="grid-4">
              {DCS.map((v) => (
                <button key={v} type="button" aria-pressed={s.dc === v} className={`opt blue small${s.dc === v ? " on" : ""}`} onClick={() => set({ dc: v, ...(v > 0 && !s.plugs.some((x) => x === "ccs2" || x === "chademo") ? { plugs: [...s.plugs, "ccs2"] } : {}) })}>
                  {v === 0 ? "No tiene" : v === 150 ? "150+ kW" : `${v} kW`}
                </button>
              ))}
            </div>
          </div>
          <div className="stack-8">
            <span className="b15">Enchufes que admite</span>
            <div className="chips wrap">
              {PLUGS.map((p) => (
                <button key={p.id} type="button" aria-pressed={s.plugs.includes(p.id)} className={`opt blue${s.plugs.includes(p.id) ? " on" : ""}`} onClick={() => togglePlug(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="note blue col">
            <span className="b12">Ejemplo con un cargador a 0,35 €/kWh</span>
            <span className="b15">
              Llenar del 20 % al 100 %: {(kwh * 0.35).toFixed(2).replace(".", ",")} € · {timeTxt}
            </span>
          </div>
        </section>
      )}
    </>
  );
}

/** Deja los ajustes listos para guardar: nombre limpio, al menos un combustible y marcado como configurado */
export function cleanCar(s: Settings, fallbackFuels: FuelKey[]): Settings {
  const fuels = s.fuels.length ? s.fuels : fallbackFuels;
  const fuel = fuels.includes(s.fuel) ? s.fuel : fuels[0];
  return { ...s, carName: s.carName?.trim() || undefined, fuels, fuel, configured: true };
}
