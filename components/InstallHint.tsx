"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

const KEY = "gc.installHint";

/** Aviso corto en el móvil para quien aún usa la web sin instalar. Se puede cerrar y no vuelve a salir. */
export function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const mobile = window.matchMedia("(max-width: 1023px) and (pointer: coarse)").matches;
      setShow(mobile && !standalone && localStorage.getItem(KEY) !== "1" && (localStorage.getItem("gc.welcome") === "1" || localStorage.getItem("gc.settings") != null));
    } catch {
      /* sin almacenamiento: no se muestra */
    }
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* nada */
    }
  };
  return (
    <div className="note green install-hint">
      <Icon name="bell" size={18} />
      <Link href="/instalar" className="grow">
        Ponla como app en tu móvil y recibe avisos cuando baje el precio. Ver cómo
      </Link>
      <button type="button" aria-label="Cerrar aviso" onClick={close}>
        ×
      </button>
    </div>
  );
}
