"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { CarForm, cleanCar } from "../CarForm";
import {
  addVehicle,
  DEFAULT_SETTINGS,
  ensureGarage,
  onboardingDone,
  removeVehicle,
  saveActiveVehicle,
  settingsStore,
  switchVehicle,
  useGarage,
  useSettings,
  type Settings,
} from "@/lib/store";

/**
 * Mis vehículos: editar el que está en uso, pasar a otro o añadir uno nuevo (?nuevo=1).
 * Cada vehículo guarda su tipo, combustibles, depósito y parte eléctrica; al guardar queda en uso.
 */
export function MyCar() {
  const router = useRouter();
  const isNew = useSearchParams().get("nuevo") === "1";
  const [saved] = useSettings();
  const [garage] = useGarage();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    ensureGarage();
  }, []);
  // Vehículo nuevo: formulario vacío (lo de la persona —radio, marcas…— se mantiene); si no, el que está en uso
  useEffect(() => {
    setS(isNew ? { ...saved, ...pickVehicleDefaults(), carName: "" } : saved);
    setConfirmDel(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, saved.carName, saved.carType, garage.active]);

  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));

  const save = () => {
    const next = cleanCar(s, DEFAULT_SETTINGS.fuels);
    if (isNew) addVehicle(next);
    else {
      settingsStore.set(next);
      ensureGarage();
      saveActiveVehicle(next);
    }
    onboardingDone(); // ya no hace falta la bienvenida
    // Un eléctrico no tiene pantalla de gasolineras: se le lleva a los cargadores
    router.push(next.carType === "ev" && !next.showAll ? "/carga" : "/");
  };

  const others = garage.list.length > 1 && !isNew;
  const del = () => {
    if (!garage.active) return;
    if (!confirmDel) return setConfirmDel(true);
    removeVehicle(garage.active);
    setConfirmDel(false);
  };

  return (
    <div className="screen with-bar">
      <div className="stack-14 pad-x top">
        <div className="row-12">
          <button type="button" aria-label="Volver" className="icon-btn round" onClick={() => router.back()}>
            <Icon name="back" size={20} stroke={2.4} />
          </button>
          <h1 className="h1">{isNew ? "Añadir vehículo" : "Mis vehículos"}</h1>
        </div>
        <span className="muted b14">
          {isNew
            ? "Ponle el nombre que quieras (moto, caravana, el coche de casa…). Al guardarlo quedará en uso y podrás cambiar de vehículo con un toque desde la pantalla principal."
            : "Así solo te enseñamos lo que sirve para tu vehículo y calculamos cuánto te cuesta llenar."}
        </span>

        {others && (
          <div className="chips scroll-x" role="radiogroup" aria-label="Vehículo que estás editando">
            {garage.list.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={v.id === garage.active} className={`chip${v.id === garage.active ? " on" : ""}`} onClick={() => switchVehicle(v.id)}>
                {v.name}
              </button>
            ))}
          </div>
        )}

        <CarForm s={s} set={set} />

        {!isNew && saved.configured && (
          <button type="button" className="btn soft" onClick={() => router.push("/mi-coche?nuevo=1")}>
            <Icon name="plus" size={18} stroke={2.6} /> Añadir otro vehículo
          </button>
        )}
        {others && (
          <button type="button" className={`btn soft${confirmDel ? " danger" : ""}`} onClick={del}>
            {confirmDel ? `Toca otra vez para borrar ${saved.carName || "este vehículo"} y sus repostajes` : `Borrar ${saved.carName || "este vehículo"}`}
          </button>
        )}
      </div>
      <div className="action-bar plain">
        <button type="button" className="btn primary big grow" onClick={save}>
          <Icon name="check" size={20} stroke={2.6} /> {isNew ? "Guardar vehículo" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

/** Lo que se propone para un vehículo nuevo: gasolina, 45 litros (todo se cambia en el formulario) */
function pickVehicleDefaults(): Partial<Settings> {
  const { carType, fuels, fuel, tank, battery, ac, dc, plugs } = DEFAULT_SETTINGS;
  return { carType, fuels: ["g95"], fuel, tank, battery, ac, dc, plugs };
}
