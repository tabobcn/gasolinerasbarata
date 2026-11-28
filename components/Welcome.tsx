"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CAR_TYPES, CarForm, cleanCar } from "./CarForm";
import { Icon, type IconName } from "./Icon";
import { useLocation } from "./LocationProvider";
import { APP_NAME } from "@/lib/config";
import { DEFAULT_SETTINGS, onboardingDone, onboardingPending, settingsStore, type Settings } from "@/lib/store";

/**
 * Bienvenida de la primera vez, a pantalla completa: qué coche llevas y para qué es la ubicación.
 * Se puede saltar; todo se cambia después en "Mi coche" y en Ajustes.
 */
/** Icono y color de cada tipo de vehículo en la bienvenida */
const TYPE_ICON: Record<string, { icon: IconName; tone: string }> = {
  gas: { icon: "pump", tone: "green" },
  diesel: { icon: "pump", tone: "ink" },
  phev: { icon: "plug", tone: "blue" },
  ev: { icon: "bolt", tone: "blue" },
  glp: { icon: "pump", tone: "amber" },
};

export function Welcome() {
  const router = useRouter();
  const { locate } = useLocation();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => setShow(onboardingPending()), []);
  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [show]);
  if (!show) return null;

  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));
  const pick = (t: (typeof CAR_TYPES)[number]) => {
    const base = settingsStore.get();
    setS({ ...base, carType: t.id, ...(t.fuels.length ? { fuels: t.fuels, fuel: t.fuels[0] } : {}) });
    setStep(1);
  };
  const close = (save: boolean) => {
    const next = save ? cleanCar(s, DEFAULT_SETTINGS.fuels) : null;
    if (next) settingsStore.set(next);
    onboardingDone();
    setShow(false);
    locate(); // ahora sí se pide la ubicación
    if (next?.carType === "ev") router.replace("/carga");
  };

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="onboard-in stack-16">
        {step === 0 ? (
          <>
            <div className="onboard-hero">
              <img src="/icon.svg" alt="" width={56} height={56} className="onboard-logo" />
              <div className="col-2">
                <span className="onboard-name">{APP_NAME}</span>
                <span className="b14 onboard-tag">Gasolina y carga al mejor precio, cerca de ti</span>
              </div>
            </div>
            <ul className="onboard-benefits">
              <li>
                <span className="soft-icon green" aria-hidden="true">
                  <Icon name="pump" size={18} />
                </span>
                La gasolinera más barata a tu alrededor, con precios oficiales
              </li>
              <li>
                <span className="soft-icon blue" aria-hidden="true">
                  <Icon name="bolt" size={18} />
                </span>
                Cargadores eléctricos con precio y si están libres
              </li>
              <li>
                <span className="soft-icon amber" aria-hidden="true">
                  <Icon name="bell" size={18} />
                </span>
                Avisos cuando baja el precio, aunque tengas la app cerrada
              </li>
            </ul>
            <div className="stack-8">
              <h2 className="h2" id="onboard-title">
                ¿Qué vehículo llevas?
              </h2>
              <span className="muted b14">Así te enseñamos solo lo que te sirve. Si tienes más de uno, luego puedes añadirlos.</span>
            </div>
            <div className="grid-2">
              {CAR_TYPES.map((t, i) => (
                <button key={t.id} type="button" className="veh-type" style={i === CAR_TYPES.length - 1 && CAR_TYPES.length % 2 === 1 ? { gridColumn: "1 / -1" } : undefined} onClick={() => pick(t)}>
                  <span className={`soft-icon ${TYPE_ICON[t.id].tone}`} aria-hidden="true">
                    <Icon name={TYPE_ICON[t.id].icon} size={20} />
                  </span>
                  <span className="b15">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="note green">
              <Icon name="pin" size={18} stroke={2.2} />
              <span className="b13">Al empezar te pediremos la ubicación. Solo se usa para buscar lo más barato cerca de ti.</span>
            </div>
            <button type="button" className="btn soft" onClick={() => close(false)}>
              Saltar por ahora
            </button>
          </>
        ) : (
          <>
            <div className="row-12">
              <button type="button" aria-label="Volver" className="icon-btn round" onClick={() => setStep(0)}>
                <Icon name="back" size={20} stroke={2.4} />
              </button>
              <h2 className="h1" id="onboard-title">
                {CAR_TYPES.find((t) => t.id === s.carType)?.label}
              </h2>
            </div>
            <span className="muted b14">Con esto calculamos cuánto te cuesta llenar. Lo puedes cambiar cuando quieras y añadir más vehículos (una moto, otro coche…).</span>
            <CarForm s={s} set={set} hideType />
            <div className="onboard-bar">
              <button type="button" className="btn primary big grow" onClick={() => close(true)}>
                <Icon name="check" size={20} stroke={2.6} /> Empezar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
