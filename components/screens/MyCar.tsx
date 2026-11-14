"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { CarForm, cleanCar } from "../CarForm";
import { DEFAULT_SETTINGS, onboardingDone, settingsStore, useSettings, type Settings } from "@/lib/store";

export function MyCar() {
  const router = useRouter();
  const [saved] = useSettings();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => setS(saved), [saved]);

  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));

  const save = () => {
    const next = cleanCar(s, DEFAULT_SETTINGS.fuels);
    settingsStore.set(next);
    onboardingDone(); // ya no hace falta la bienvenida
    // Un eléctrico no tiene pantalla de gasolineras: se le lleva a los cargadores
    router.push(next.carType === "ev" && !next.showAll ? "/carga" : "/");
  };

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
        <CarForm s={s} set={set} />
      </div>
      <div className="action-bar plain">
        <button type="button" className="btn primary big grow" onClick={save}>
          <Icon name="check" size={20} stroke={2.6} /> Guardar mi coche
        </button>
      </div>
    </div>
  );
}
