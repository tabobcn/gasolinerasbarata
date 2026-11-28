"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

/**
 * La app de Android (Capacitor) carga esta misma web dentro de la app. Aquí está lo poco que cambia cuando la web
 * se abre dentro de ella: los avisos llegan por Firebase (los avisos web no funcionan dentro de la app) y no hace
 * falta ofrecer "instalar la app".
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export type NativePerm = "granted" | "denied" | "prompt";

async function plugin() {
  return (await import("@capacitor/push-notifications")).PushNotifications;
}

export async function nativePushPermission(): Promise<NativePerm> {
  const p = await (await plugin()).checkPermissions();
  return p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt";
}

/**
 * Pide permiso (si se puede) y devuelve el código de avisos de este móvil (token de Firebase).
 * Con ask = false no pregunta nada: solo lo devuelve si ya hay permiso.
 */
export async function nativePushToken(ask: boolean): Promise<string> {
  const P = await plugin();
  let perm = await P.checkPermissions();
  if (perm.receive !== "granted" && ask && perm.receive !== "denied") perm = await P.requestPermissions();
  if (perm.receive !== "granted") throw Object.assign(new Error("Sin permiso de avisos"), { name: "NotAllowedError" });
  // Canal propio para que en Ajustes de Android salga "Alertas de precio" y se pueda silenciar por separado
  await P.createChannel({ id: "alertas", name: "Alertas de precio", description: "Cuando baja el precio de tus alertas o de tus favoritas", importance: 4, visibility: 1 }).catch(() => {});
  return new Promise<string>((resolve, reject) => {
    const subs: { remove: () => Promise<void> }[] = [];
    const done = () => subs.forEach((s) => void s.remove());
    const timer = setTimeout(() => {
      done();
      reject(new Error("El servicio de avisos de Android no ha contestado. Comprueba la conexión y vuelve a probar."));
    }, 20_000);
    void (async () => {
      subs.push(
        await P.addListener("registration", (t) => {
          clearTimeout(timer);
          done();
          resolve(t.value);
        }),
      );
      subs.push(
        await P.addListener("registrationError", () => {
          clearTimeout(timer);
          done();
          reject(new Error("Android no ha podido activar los avisos. Comprueba que tienes los servicios de Google Play al día."));
        }),
      );
      await P.register();
    })().catch((e) => {
      clearTimeout(timer);
      done();
      reject(e);
    });
  });
}

export async function nativePushUnregister(): Promise<void> {
  await (await plugin()).unregister().catch(() => {});
}

/** Evento para enseñar dentro de la app un aviso que llega con la app abierta */
export const IN_APP_NOTICE = "rc-notice";
export type InAppNotice = { title: string; body: string; url?: string };

/**
 * Qué hacer con los avisos en la app: al tocarlos, abrir la página que traen; si llegan con la app abierta
 * (Android no los enseña entonces), avisar dentro de la app.
 */
export async function listenNativePush(go: (url: string) => void): Promise<() => void> {
  const P = await plugin();
  const safe = (u: unknown) => (typeof u === "string" && /^\/[A-Za-z0-9/?=&%._-]*$/.test(u) ? u : "/alertas");
  const a = await P.addListener("pushNotificationActionPerformed", (e) => go(safe(e.notification?.data?.url)));
  const b = await P.addListener("pushNotificationReceived", (n) => {
    const detail: InAppNotice = { title: n.title ?? "Aviso de precio", body: n.body ?? "", url: safe(n.data?.url) };
    window.dispatchEvent(new CustomEvent(IN_APP_NOTICE, { detail }));
  });
  return () => {
    void a.remove();
    void b.remove();
  };
}

/** true dentro de la app de Android (tras montar, para que la web y la app pinten lo mismo al cargar) */
export function useIsNativeApp(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => setV(isNativeApp()), []);
  return v;
}

/** Compartir con el menú de Android (WhatsApp, Telegram…) */
export async function nativeShare(title: string, text: string, url: string): Promise<void> {
  const { Share } = await import("@capacitor/share");
  await Share.share({ title, text, url, dialogTitle: "Compartir" });
}
