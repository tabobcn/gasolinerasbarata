"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./ui";
import { isNativeApp } from "@/lib/native";

export const APP_VERSION = "1.2.0";

/** Hoja "Danos tu opinión": un texto y, si quiere, cómo contestarle. Sin cuentas ni datos del móvil. */
export function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname() || "/";
  const [msg, setMsg] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");

  const close = () => {
    onClose();
    if (state === "sent") {
      setMsg("");
      setContact("");
      setState("idle");
    }
  };
  const send = async () => {
    if (msg.trim().length < 3 || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/opinion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg, contact, app: isNativeApp() ? "android" : "web", version: APP_VERSION, page: path }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error || "No se ha podido enviar ahora mismo.");
      setState("sent");
    } catch (e) {
      setState({ error: (e as Error).message || "No se ha podido enviar ahora mismo." });
    }
  };

  return (
    <Sheet open={open} onClose={close} label="Danos tu opinión">
      {state === "sent" ? (
        <div className="stack-14 center-text">
          <span className="empty-icon">
            <Icon name="check" size={24} />
          </span>
          <h2 className="h-sheet">¡Gracias!</h2>
          <span className="muted b14">Lo leemos todo. Si nos has dejado cómo contestarte, te escribiremos.</span>
          <button type="button" className="btn primary" onClick={close}>
            Cerrar
          </button>
        </div>
      ) : (
        <div className="stack-14">
          <h2 className="h-sheet">Danos tu opinión</h2>
          <span className="muted b14">¿Qué mejorarías, qué falla o qué echas de menos? Cualquier cosa nos ayuda a mejorar la app.</span>
          <textarea
            className="fb-text"
            rows={5}
            maxLength={2000}
            placeholder="Por ejemplo: no me sale una gasolinera, un precio no coincide, me gustaría poder…"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            aria-label="Tu opinión"
          />
          <input
            className="fb-input"
            type="text"
            maxLength={200}
            autoComplete="off"
            placeholder="Correo o teléfono para contestarte (opcional)"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            aria-label="Cómo contestarte (opcional)"
          />
          {typeof state === "object" && (
            <span className="b13" style={{ color: "var(--red)" }} role="alert">
              {state.error}
            </span>
          )}
          <button type="button" className="btn primary big" disabled={msg.trim().length < 3 || state === "sending"} onClick={send}>
            <Icon name="check" size={18} stroke={2.6} /> {state === "sending" ? "Enviando…" : "Enviar"}
          </button>
          <span className="muted b12">Se guarda solo lo que escribes aquí, la página en la que estás y la versión de la app.</span>
        </div>
      )}
    </Sheet>
  );
}
