"use client";

import { useState } from "react";
import { Icon } from "./Icon";

/** Botón pequeño para compartir la página actual (WhatsApp, etc.). Si el navegador no puede, copia el enlace. */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* compartir cancelado */
    }
  };
  return (
    <button type="button" className="icon-btn round share-btn" aria-label="Compartir" onClick={share}>
      <Icon name="share" size={19} stroke={2.2} />
      {copied && (
        <span className="copied-tip" role="status">
          Enlace copiado
        </span>
      )}
    </button>
  );
}
