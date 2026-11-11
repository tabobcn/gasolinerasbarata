"use client";

import { useEffect, useState } from "react";

export const DESKTOP_QUERY = "(min-width: 1024px)";

/** true en pantallas de ordenador (a partir de 1024 px de ancho). En el servidor y en el móvil, false. */
export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}
