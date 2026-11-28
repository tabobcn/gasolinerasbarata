"use client";

import { useEffect, useState } from "react";

/**
 * La app de Android carga esta misma web dentro de la app. Aquí está lo poco que cambia dentro de ella:
 * los avisos llegan por Firebase (los avisos web no funcionan dentro de la app), compartir usa el menú de Android
 * y no hace falta ofrecer "instalar la app".
 *
 * La app (desde la 1.2.1) pone a disposición de la web el objeto `RepostaApp` (ver PuenteApp.java en android-app).
 * Contesta llamando a `window.__repostaApp(id, respuesta)`.
 */
type Puente = {
  pushPermission: () => string;
  pushToken: (id: string, ask: boolean) => void;
  pushUnregister: () => void;
  share: (title: string, text: string, url: string) => void;
  version: () => string;
};

declare global {
  interface Window {
    RepostaApp?: Puente;
    __repostaApp?: (id: string, body: unknown) => void;
  }
}

const puente = (): Puente | null => (typeof window !== "undefined" && window.RepostaApp ? window.RepostaApp : null);

/** ¿Estamos dentro de la app de Android? (también las versiones antiguas, por la marca que añaden al navegador) */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.RepostaApp || /RepostaYCargaApp\//.test(navigator.userAgent);
}

/** ¿Esta versión de la app sabe dar avisos? (la 1.2.0 no: hay que actualizarla) */
export const nativePushAvailable = () => !!puente();

export function appVersion(): string | null {
  try {
    return puente()?.version() || null;
  } catch {
    return null;
  }
}

/** true dentro de la app de Android (tras montar, para que la web y la app pinten lo mismo al cargar) */
export function useIsNativeApp(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => setV(isNativeApp()), []);
  return v;
}

export type NativePerm = "granted" | "denied" | "prompt";

export async function nativePushPermission(): Promise<NativePerm> {
  const p = puente()?.pushPermission();
  return p === "granted" ? "granted" : p === "prompt" ? "prompt" : "denied";
}

// Respuestas de la app a las peticiones (cada una con su id)
const waiting = new Map<string, (body: Record<string, unknown>) => void>();
function listen() {
  if (typeof window === "undefined" || window.__repostaApp) return;
  window.__repostaApp = (id, body) => {
    const done = waiting.get(id);
    if (!done) return;
    waiting.delete(id);
    done((body ?? {}) as Record<string, unknown>);
  };
}

/**
 * Pide permiso (si se puede) y devuelve el código de avisos de este móvil (Firebase).
 * Con ask = false no pregunta nada: solo lo devuelve si ya hay permiso.
 */
export function nativePushToken(ask: boolean): Promise<string> {
  const p = puente();
  if (!p) return Promise.reject(new Error("Actualiza la app desde Google Play para activar los avisos."));
  listen();
  const id = Math.random().toString(36).slice(2);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("Android no ha contestado. Comprueba la conexión y vuelve a probar."));
    }, 60_000); // da tiempo a contestar al permiso
    waiting.set(id, (b) => {
      clearTimeout(timer);
      if (b.ok && typeof b.token === "string") resolve(b.token);
      else if (b.denied) reject(Object.assign(new Error("Sin permiso de avisos"), { name: "NotAllowedError" }));
      else reject(new Error(`Android no ha podido activar los avisos${b.error ? ` (${String(b.error)})` : ""}. Comprueba que tienes los servicios de Google Play al día.`));
    });
    try {
      p.pushToken(id, ask);
    } catch (e) {
      clearTimeout(timer);
      waiting.delete(id);
      reject(e as Error);
    }
  });
}

export async function nativePushUnregister(): Promise<void> {
  try {
    puente()?.pushUnregister();
  } catch {
    /* nada */
  }
}

/** Compartir con el menú de Android (WhatsApp, Telegram…). Devuelve false si esta versión de la app no sabe. */
export async function nativeShare(title: string, text: string, url: string): Promise<boolean> {
  const p = puente();
  if (!p) return false;
  p.share(title, text, url);
  return true;
}

/** Evento para enseñar dentro de la app un aviso que llega con la app abierta (ahora lo enseña Android) */
export const IN_APP_NOTICE = "rc-notice";
export type InAppNotice = { title: string; body: string; url?: string };
