"use client";

import { alertsStore, createPersisted, favoritesStore, lastLocationStore, placesStore, usePersisted } from "./store";
import { discountsStore } from "./discountStore";
import { encodeDiscounts } from "./discounts";

/**
 * Avisos push: que las alertas de precio lleguen con la app cerrada.
 * El navegador se suscribe y mandamos al servidor esa suscripción con las alertas; el servidor comprueba
 * los precios cada media hora. No se manda ningún dato personal: solo la dirección push que da el navegador.
 */
export type PushPrefs = { on: boolean; hash: string; syncedAt: number };
export const pushStore = createPersisted<PushPrefs>("gc.push", { on: false, hash: "", syncedAt: 0 }, true);
export const usePush = () => usePersisted(pushStore);

export type PushSupport = "ok" | "ios-install" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "ok";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios-install" : "unsupported";
}

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const b64u = (buf: ArrayBuffer | null) => {
  if (!buf) return "";
  let s = "";
  for (const x of new Uint8Array(buf)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function hashOf(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error || "No se ha podido conectar con el servidor de avisos");
  return out;
}

const keysOf = (sub: PushSubscription) => ({ endpoint: sub.endpoint, p256dh: b64u(sub.getKey("p256dh")), auth: b64u(sub.getKey("auth")) });

/** Lo que necesita el servidor para comprobar las alertas de este móvil */
function payload(sub: PushSubscription) {
  const places = placesStore.get();
  const last = lastLocationStore.get();
  const alerts = alertsStore.get();
  const out: { id: string; fuel: string; threshold: number; radius: number; lat: number; lon: number; label: string }[] = [];
  for (const a of alerts) {
    if (a.zone === "yo") {
      // "Donde esté": el último sitio donde se abrió la app, redondeado a ~1 km
      if (last) out.push({ id: a.id, fuel: a.fuel, threshold: a.threshold, radius: a.radius, lat: r(last.lat, 2), lon: r(last.lon, 2), label: "ti" });
      continue;
    }
    const p = places.find((x) => x.id === a.zone);
    if (p) out.push({ id: a.id, fuel: a.fuel, threshold: a.threshold, radius: a.radius, lat: r(p.lat, 3), lon: r(p.lon, 3), label: p.label.toLowerCase() });
  }
  const favFuels = [...new Set(alerts.filter((a) => a.favDrop).map((a) => a.fuel))];
  const favs = favFuels.length ? favoritesStore.get().slice(0, 30).map((f) => ({ id: f.id, m: f.m })) : [];
  return { sub: keysOf(sub), alerts: out.slice(0, 10), disc: encodeDiscounts(discountsStore.get()), favs, favFuels };
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const res = await fetch("/api/push");
  const { key } = (await res.json().catch(() => ({}))) as { key?: string };
  if (!res.ok || !key) throw new Error("Los avisos no están disponibles ahora mismo");
  const appKey = unb64u(key);
  const cur = await reg.pushManager.getSubscription();
  if (cur) {
    // Si la suscripción es de otra clave de servidor (antigua), se rehace
    const curKey = cur.options?.applicationServerKey ? b64u(cur.options.applicationServerKey) : null;
    if (!curKey || curKey === key) return cur;
    await cur.unsubscribe().catch(() => {});
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
}

const BLOCKED = "Tienes los avisos bloqueados para esta web. Actívalos en los ajustes del navegador (o del móvil) y vuelve a probar.";

export type PushResult = { ok: true } | { ok: false; reason: "unsupported" | "denied" | "error"; msg: string };

export async function enablePush(): Promise<PushResult> {
  if (pushSupport() !== "ok") return { ok: false, reason: "unsupported", msg: "Este navegador no admite avisos con la app cerrada." };
  try {
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "denied", msg: BLOCKED };
    const sub = await subscribe(await registration());
    const body = payload(sub);
    await api({ action: "save", ...body });
    pushStore.set({ on: true, hash: hashOf(JSON.stringify(body)), syncedAt: Date.now() });
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    // Errores del navegador (vienen en inglés): se explican en claro
    if (err.name === "NotAllowedError") return { ok: false, reason: "denied", msg: BLOCKED };
    if (err.name === "AbortError" || err.name === "InvalidStateError" || /push service|registration failed/i.test(err.message)) {
      return { ok: false, reason: "error", msg: "Este navegador no ha podido conectar con su servicio de avisos. Comprueba la conexión y vuelve a probar." };
    }
    return { ok: false, reason: "error", msg: err.message || "No se han podido activar los avisos." };
  }
}

export async function disablePush(): Promise<void> {
  pushStore.set({ on: false, hash: "", syncedAt: 0 });
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const k = keysOf(sub);
    await sub.unsubscribe().catch(() => {});
    await api({ action: "remove", endpoint: k.endpoint, auth: k.auth }).catch(() => {});
  } catch {
    /* ya no había suscripción */
  }
}

export async function testPush(): Promise<PushResult> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return { ok: false, reason: "error", msg: "No encontramos la suscripción. Desactiva y vuelve a activar los avisos." };
    const k = keysOf(sub);
    await api({ action: "test", endpoint: k.endpoint, auth: k.auth });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", msg: (e as Error).message };
  }
}

/** Manda al servidor las alertas actuales si han cambiado (o una vez por semana, para mantener viva la suscripción) */
export async function syncPush(): Promise<void> {
  const p = pushStore.get();
  if (!p.on || pushSupport() !== "ok") return;
  try {
    if (Notification.permission !== "granted") {
      pushStore.set({ on: false, hash: "", syncedAt: 0 }); // el usuario ha quitado el permiso
      return;
    }
    const sub = await subscribe(await registration());
    const body = payload(sub);
    const hash = hashOf(JSON.stringify(body));
    if (hash === p.hash && Date.now() - p.syncedAt < 7 * 86_400_000) return;
    await api({ action: "save", ...body });
    pushStore.set({ on: true, hash, syncedAt: Date.now() });
  } catch {
    /* sin conexión: se reintenta la próxima vez que se abra la app */
  }
}
