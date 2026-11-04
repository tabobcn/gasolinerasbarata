"use client";

import Link from "next/link";
import { BottomNav, ModeTabs } from "../ui";
import { Icon } from "../Icon";
import { useSettings } from "@/lib/store";

export function Charge() {
  const [s] = useSettings();
  const elec = s.carType === "phev" || s.carType === "ev";
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top">
        <div className="col-2">
          <span className="muted b13">Modo carga</span>
          <span className="place-name">Cargadores eléctricos</span>
        </div>
        <ModeTabs mode="charge" />
        {elec && (
          <Link href="/mi-coche" className="note blue link">
            <Icon name="plug" size={16} stroke={2.4} />
            <span className="grow">
              Tu {s.carType === "ev" ? "eléctrico" : "híbrido"}: {s.battery} kWh · {s.plugs.includes("t2") ? "Tipo 2" : s.plugs[0]?.toUpperCase() ?? "—"} hasta {String(s.ac).replace(".", ",")} kW
            </span>
            <span className="b13">Cambiar</span>
          </Link>
        )}
        <div className="card stack-12 center-text">
          <span className="soft-icon blue big" aria-hidden="true">
            <Icon name="bolt" size={28} />
          </span>
          <h2 className="h2">Muy pronto</h2>
          <p className="muted b14">
            Estamos preparando los puntos de carga cercanos con su potencia, enchufes compatibles con tu coche y lo que te cuesta llenar la batería.
          </p>
          <Link href="/" className="btn primary">
            <Icon name="pump" size={18} /> Ver gasolineras
          </Link>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
