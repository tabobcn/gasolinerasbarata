"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Stepper } from "../ui";
import { DEFAULT_SETTINGS, settingsStore, useSettings, type CarType, type NavApp, type Settings } from "@/lib/store";
import { FUELS, type FuelKey } from "@/lib/fuels";

const TYPES: { id: CarType; label: string; fuels: FuelKey[] }[] = [
  { id: "gas", label: "Gasolina", fuels: ["g95", "g98"] },
  { id: "diesel", label: "Diésel", fuels: ["goa", "goap"] },
  { id: "phev", label: "Híbrido enchufable", fuels: ["g95", "g98"] },
  { id: "ev", label: "Eléctrico", fuels: [] },
];
const ACS = [3.7, 7.4, 11, 22];
const DCS = [0, 50, 100, 150];
const PLUGS = [
  { id: "t2", label: "Tipo 2" },
  { id: "ccs2", label: "CCS2" },
  { id: "chademo", label: "CHAdeMO" },
];

export function MyCar() {
  const router = useRouter();
  const [saved] = useSettings();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => setS(saved), [saved]);

  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));
  const toggleFuel = (f: FuelKey) => set({ fuels: s.fuels.includes(f) ? s.fuels.filter((x) => x !== f) : [...s.fuels, f] });
  const togglePlug = (p: string) => set({ plugs: s.plugs.includes(p) ? s.plugs.filter((x) => x !== p) : [...s.plugs, p] });

  const showFuel = s.carType !== "ev";
  const showElec = s.carType === "phev" || s.carType === "ev";
  const kwh = s.battery * 0.8;
  const mins = Math.round((kwh / s.ac) * 60);
  const timeTxt = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;

  const save = () => {
    const fuels = s.fuels.length ? s.fuels : DEFAULT_SETTINGS.fuels;
    const fuel = fuels.includes(s.fuel) ? s.fuel : fuels[0];
    settingsStore.set({ ...s, carName: s.carName?.trim() || undefined, fuels, fuel });
    try {
      window.localStorage.setItem("gc.welcome", "1"); // ya no hace falta la bienvenida
    } catch {
      /* nada */
    }
    router.push("/");
  };

  const num = (n: number) => String(n).replace(".", ",");

  return (
    <div className="screen with-bar">
      <div className="stack-14 pad-x top">
        <div className="row-12">
          <button type="button" aria-label="Volver" className="icon-btn round" onClick={() => router.back()}>
            <Icon name="back" size={20} stroke={2.4} />
          </button>
          <h1 className="h1">Mi coche</h1>
        </div>
        <span className="muted b14">Así solo te enseñamos lo que sirve para tu coche y calculamos cuánto te cuesta llenar.</span>

        <section className="card stack-10">
          <label className="eyebrow" htmlFor="car-name">
            NOMBRE DE TU COCHE (OPCIONAL)
          </label>
          <span className="search-box">
            <Icon name="car" size={20} color="#5B6675" />
            <input id="car-name" type="text" maxLength={40} autoComplete="off" placeholder="Por ejemplo: Cupra Formentor híbrido" value={s.carName ?? ""} onChange={(e) => set({ carName: e.target.value })} />
          </span>
        </section>

        <section className="card stack-10">
          <h2 className="eyebrow">TIPO DE COCHE</h2>
          <div className="grid-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={s.carType === t.id}
                className={`opt tall${s.carType === t.id ? " on" : ""}`}
                onClick={() => set({ carType: t.id, fuels: t.fuels.length ? [...new Set([...t.fuels, ...s.fuels.filter((f) => t.fuels.includes(f))])] : s.fuels })}
              >
                {t.label}
              </button>
            ))}
          </div>
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
                <span className="muted b12">Para calcular cuánto ahorras</span>
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
                  <button key={v} type="button" aria-pressed={s.dc === v} className={`opt blue small${s.dc === v ? " on" : ""}`} onClick={() => set({ dc: v })}>
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

        <Link href="/descuentos" className="row-card">
          <span className="soft-icon amber" aria-hidden="true">
            <Icon name="card" size={20} />
          </span>
          <span className="col-2 grow">
            <span className="b15">Mis descuentos</span>
            <span className="muted b12">Tarjetas de fidelización: precio final real</span>
          </span>
          <Icon name="chevronRight" size={20} color="#5B6675" stroke={2.4} />
        </Link>

        <section className="card stack-10">
          <h2 className="eyebrow">APP PARA IR A LA GASOLINERA</h2>
          <div className="grid-3">
            {([
              [null, "Preguntar"],
              ["maps", "Google Maps"],
              ["waze", "Waze"],
            ] as [NavApp | null, string][]).map(([id, label]) => (
              <button key={label} type="button" aria-pressed={s.navApp === id} className={`opt small${s.navApp === id ? " on" : ""}`} onClick={() => set({ navApp: id })}>
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="action-bar plain">
        <button type="button" className="btn primary big grow" onClick={save}>
          <Icon name="check" size={20} stroke={2.6} /> Guardar mi coche
        </button>
      </div>
    </div>
  );
}
