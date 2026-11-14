"use client";

import Link from "next/link";
import { useDiscounts } from "@/lib/discountStore";
import { activeCount, allPrograms, discText, isLive } from "@/lib/discounts";
import { Icon } from "./Icon";

/** Interruptor "Precios con mis descuentos" (o enlace para añadirlos si no hay ninguno) */
export function DiscountToggle() {
  const [d, setD] = useDiscounts();
  const n = activeCount(d);
  if (!n) {
    return (
      <Link href="/descuentos" className="disc-cta">
        <Icon name="card" size={18} color="#8A4F00" />
        <span className="grow">¿Tienes tarjeta o app de descuento? Añádela y te enseñamos el precio final</span>
        <Icon name="chevronRight" size={18} color="#5B6675" />
      </Link>
    );
  }
  const names = allPrograms(d)
    .filter((p) => isLive(d.items[p.id]))
    .map((p) => `${p.short} ${discText({ label: "", ...d.items[p.id] })}`)
    .concat(Object.values(d.stations ?? {}).some((i) => isLive(i)) ? ["descuentos propios"] : [])
    .join(" · ");
  return (
    <div className="disc-toggle">
      <Icon name="card" size={20} color="#8A4F00" />
      <Link href="/descuentos" className="col-2 grow min0 plain">
        <span className="b14">Precios con mis descuentos</span>
        <span className="muted b12 ellipsis">{d.enabled ? `Usando: ${names}` : "Ahora ves el precio sin tarjetas"}</span>
      </Link>
      <button
        type="button"
        role="switch"
        aria-checked={d.enabled}
        aria-label="Precios con mis descuentos"
        className={`switch-btn${d.enabled ? " on" : ""}`}
        onClick={() => setD((s) => ({ ...s, enabled: !s.enabled }))}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}
