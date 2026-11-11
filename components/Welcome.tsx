"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

const KEY = "gc.welcome";

/** Tarjeta de bienvenida la primera vez: invita a configurar el coche, sin obligar. */
export function Welcome() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1" && localStorage.getItem("gc.settings") == null);
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
    <section className="card stack-12 welcome" aria-labelledby="welcome-title">
      <div className="row-12">
        <span className="soft-icon green" aria-hidden="true">
          <Icon name="car" size={20} />
        </span>
        <span className="col-2 grow min0">
          <span className="b16" id="welcome-title">
            ¿Qué coche llevas?
          </span>
          <span className="muted b13">Dinos combustible, depósito y navegador y te enseñamos solo lo que te sirve. Tardas 20 segundos.</span>
        </span>
      </div>
      <div className="row-8">
        <Link href="/mi-coche" className="btn primary grow" onClick={close}>
          Personalizar mi coche
        </Link>
        <button type="button" className="btn soft" onClick={close}>
          Ahora no
        </button>
      </div>
    </section>
  );
}
