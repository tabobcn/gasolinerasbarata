"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { isNativeApp } from "@/lib/native";
import { enablePush, usePush } from "@/lib/push";
import { alertsStore, settingsStore, uid, type PriceAlert } from "@/lib/store";
import { fmtPrice } from "@/lib/format";
import { fuelByKey, type FuelKey } from "@/lib/fuels";

const KEY = "gc.alertHint";

/**
 * En la app: tarjeta para activar los avisos con un toque. Si no tiene ninguna alerta, crea una para su
 * combustible donde esté: avisar si alguna gasolinera baja de la más barata de hoy (1 céntimo menos),
 * y también si baja una favorita. Luego pide el permiso de Android.
 */
export function AlertHint({ fuel, bestPrice }: { fuel: FuelKey; bestPrice: number | null }) {
  const [push] = usePush();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    try {
      setShow(isNativeApp() && localStorage.getItem(KEY) !== "1");
    } catch {
      /* sin almacenamiento: no se muestra */
    }
  }, []);
  const hide = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* nada */
    }
  };
  if (!show || (push.on && !msg)) return null;

  const activate = async () => {
    setBusy(true);
    setMsg(null);
    let created: PriceAlert | null = null;
    if (!alertsStore.get().length && bestPrice != null) {
      const threshold = Math.round((bestPrice - 0.01) * 1000) / 1000;
      created = { id: uid(), fuel, zone: "yo", radius: settingsStore.get().radius || 5, threshold, favDrop: true, createdAt: new Date().toISOString() };
      alertsStore.set((l) => [...l, created!]);
    }
    const r = await enablePush();
    setBusy(false);
    if (r.ok) {
      setMsg({
        text: created
          ? `Listo. Te avisaremos si la ${fuelByKey(fuel)?.label.toLowerCase()} baja de ${fmtPrice(created.threshold)} € cerca de ti. Puedes cambiarlo en Alertas.`
          : "Listo. Te avisaremos cuando se cumpla una de tus alertas.",
        ok: true,
      });
      try {
        localStorage.setItem(KEY, "1");
      } catch {
        /* nada */
      }
    } else {
      // si no se ha podido activar, la alerta creada se quita para no dejar nada a medias
      if (created) alertsStore.set((l) => l.filter((x) => x.id !== created!.id));
      setMsg({ text: r.msg, ok: false });
    }
  };

  return (
    <div className="card stack-10">
      <div className="row-12">
        <span className="soft-icon amber" aria-hidden="true">
          <Icon name="bell" size={20} />
        </span>
        <span className="col-2 grow min0">
          <span className="b14">¿Te avisamos cuando baje el precio?</span>
          <span className="muted b12">Te llega un aviso al móvil aunque tengas la app cerrada</span>
        </span>
        <button type="button" className="fb-close" aria-label="No mostrar más" onClick={hide}>
          ×
        </button>
      </div>
      {msg ? (
        <span className={`b13 ${msg.ok ? "green" : "tone-red"}`} role="status">
          {msg.text}
        </span>
      ) : (
        <button type="button" className="btn primary" onClick={activate} disabled={busy}>
          <Icon name="bell" size={18} /> {busy ? "Activando… toca «Permitir» si te pregunta" : "Activar avisos"}
        </button>
      )}
    </div>
  );
}
