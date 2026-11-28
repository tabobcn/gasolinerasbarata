"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { FeedbackSheet } from "./Feedback";
import { isNativeApp } from "@/lib/native";

const KEY = "gc.feedbackHint";

/** En la app: tarjeta corta para pedir opinión (sobre todo a quien la está probando). Se puede cerrar. */
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
  if (!show) return <FeedbackSheet open={open} onClose={() => setOpen(false)} />;
  return (
    <>
      <div className="note green install-hint">
        <Icon name="star" size={18} />
        <button type="button" className="grow fb-hint" onClick={() => setOpen(true)}>
          ¿Qué te parece la app? Cuéntanos qué mejorarías
        </button>
        <button type="button" aria-label="Cerrar aviso" onClick={hide}>
          ×
        </button>
      </div>
      <FeedbackSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
