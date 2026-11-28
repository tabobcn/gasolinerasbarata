"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { FeedbackSheet } from "./Feedback";
import { isNativeApp } from "@/lib/native";

const KEY = "gc.feedbackHint";

/**
 * En la app: tarjeta para pedir opinión (sobre todo a quien la está probando), con el mismo aspecto que
 * "Mis repostajes". Desaparece al cerrarla o al mandar una opinión; después sigue en Ajustes.
 */
export function FeedbackHint() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
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
  return (
    <>
      {show && (
        <div className="card row-12 tight-y fb-card">
          <button type="button" className="row-12 grow min0 fb-open" onClick={() => setOpen(true)}>
            <span className="soft-icon green" aria-hidden="true">
              <Icon name="star" size={20} />
            </span>
            <span className="col-2 grow min0">
              <span className="b14">¿Qué te parece la app?</span>
              <span className="muted b12">Cuéntanos qué mejorarías o qué falla</span>
            </span>
            <span className="link-btn">Opinar</span>
          </button>
          <button type="button" className="fb-close" aria-label="No mostrar más" onClick={hide}>
            ×
          </button>
        </div>
      )}
      <FeedbackSheet open={open} onClose={() => setOpen(false)} onSent={hide} />
    </>
  );
}
