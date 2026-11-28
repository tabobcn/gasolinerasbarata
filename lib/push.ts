"use client";

import { alertsStore, createPersisted, favoritesStore, lastLocationStore, placesStore, settingsStore, usePersisted } from "./store";
import { discountsStore } from "./discountStore";
import { encodeDiscounts } from "./discounts";
import { isNativeApp, nativePushPermission, nativePushToken, nativePushUnregister } from "./native";

/**
 * Avisos push: que las alertas de precio lleguen con la app cerrada.
 * El navegador se suscribe y mandamos al servidor esa suscripción con las alertas; el servidor comprueba
 * los precios cada media hora. No se manda ningún dato personal: solo la dirección push que da el navegador.
 */
/** rm: baja que no se pudo enviar al servidor (se reintenta al abrir la app) */
export type PushPrefs = {
  on: boolean;
  hash: string;
  syncedAt: number;
  rm?: { endpoint: string; auth: string };
  /** App de Android: código de avisos de Firebase y la clave de este móvil para poder cambiar o borrar su suscripción */
  fcm?: { token: string; auth: string };
};

/** Sube cada vez que se desactivan los avisos: una sincronización que estaba a medias no puede volver a activarlos */
let gen = 0;
export const pushStore = createPersisted<PushPrefs>("gc.push", { on: false, hash: "", syncedAt: 0 }, true);
export const usePush = () => usePersisted(pushStore);

export type PushSupport = "ok" | "ios-install" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeApp()) return "ok"; // en la app de Android los avisos van por Firebase
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

type Keys = { endpoint: string; p256dh: string; auth: string };
const keysOf = (sub: PushSubscription): Keys => ({ endpoint: sub.endpoint, p256dh: b64u(sub.getKey("p256dh")), auth: b64u(sub.getKey("auth")) });

/** App de Android: la "suscripción" es el código de Firebase, con una clave propia de este móvil */
const fcmKeys = (f: { token: string; auth: string }): Keys => ({ endpoint: `fcm:${f.token}`, p256dh: "fcm", auth: f.auth });
function newSecret(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return b64u(b.buffer);
}

/** Lo que necesita el servidor para comprobar las alertas de este móvil */
function payload(sub: PushSubscription | Keys) {
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
  const st = settingsStore.get();
  const favFuels = [...new Set([...alerts.filter((a) => a.favDrop).map((a) => a.fuel), ...(st.favAlerts ? [st.fuel] : [])])];
  const favs = favFuels.length ? favoritesStore.get().slice(0, 30).map((f) => ({ id: f.id, m: f.m })) : [];
  const keys = "getKey" in sub ? keysOf(sub) : sub;
  return { sub: keys, alerts: out.slice(0, 10), disc: encodeDiscounts(discountsStore.get()), favs, favFuels };
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
    // se borra en el servidor la dirección antigua para que no quede una fila huérfana
    const old = keysOf(cur);
    await api({ action: "remove", endpoint: old.endpoint, auth: old.auth }).catch(() => {});
    await cur.unsubscribe().catch(() => {});
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
}

const BLOCKED = "Tienes los avisos bloqueados para esta web. Actívalos en los ajustes del navegador (o del móvil) y vuelve a probar.";

export type PushResult = { ok: true } | { ok: false; reason: "unsupported" | "denied" | "error"; msg: string };

const NATIVE_BLOCKED = "Tienes los avisos desactivados para Reposta y Carga. Actívalos en Ajustes del móvil › Aplicaciones › Reposta y Carga › Notificaciones y vuelve a probar.";

/**
 * Si activar los avisos falla en la app, se manda un diagnóstico corto (en qué paso y qué error, sin datos
 * personales) a las opiniones, para poder arreglarlo sin tener el móvil delante.
 */
function reportNative(step: string, err: unknown) {
  const e = err as Error;
  const text = `[diagnóstico avisos] paso=${step} · ${e?.name ?? ""}: ${String(e?.message ?? err).slice(0, 300)}`;
  void fetch("/api/opinion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: text, app: "android", version: "1.2.0", page: "/alertas" }),
  }).catch(() => {});
}

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what}: sin respuesta en ${ms / 1000} s`)), ms))]);

async function enableNative(): Promise<PushResult> {
  let step = "permiso y código de Firebase";
  try {
    const token = await withTimeout(nativePushToken(true), 30_000, "Android");
    step = "guardar en el servidor";
    const prev = pushStore.get().fcm;
    const f = { token, auth: prev?.auth ?? newSecret() };
    // si Firebase ha cambiado el código, se borra el antiguo del servidor
    if (prev && prev.token !== token) await api({ action: "remove", endpoint: `fcm:${prev.token}`, auth: prev.auth }).catch(() => {});
    const body = payload(fcmKeys(f));
    await withTimeout(api({ action: "save", ...body }), 30_000, "Servidor de avisos");
    pushStore.set({ on: true, hash: hashOf(JSON.stringify(body)), syncedAt: Date.now(), fcm: f });
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    if (err.name === "NotAllowedError") return { ok: false, reason: "denied", msg: NATIVE_BLOCKED };
    reportNative(step, err);
    return { ok: false, reason: "error", msg: `${err.message || "No se han podido activar los avisos."} (${step})` };
  }
}

export async function enablePush(): Promise<PushResult> {
  if (isNativeApp()) return enableNative();
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

const removeOnServer = (k: { endpoint: string; auth: string }) => api({ action: "remove", endpoint: k.endpoint, auth: k.auth });

export async function disablePush(): Promise<void> {
  gen++;
  if (isNativeApp()) {
    const f = pushStore.get().fcm;
    pushStore.set({ on: false, hash: "", syncedAt: 0 });
    if (!f) return;
    const k = fcmKeys(f);
    const done = await removeOnServer(k)
      .catch(() => removeOnServer(k))
      .then(() => true)
      .catch(() => false);
    if (!done && !pushStore.get().on) pushStore.set({ on: false, hash: "", syncedAt: 0, rm: { endpoint: k.endpoint, auth: k.auth } });
    await nativePushUnregister();
    return;
  }
  pushStore.set({ on: false, hash: "", syncedAt: 0 });
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const k = keysOf(sub);
    // Primero se borra en el servidor (con un reintento); después se da de baja el navegador
    const done = await removeOnServer(k)
      .catch(() => removeOnServer(k))
      .then(() => true)
      .catch(() => false);
    // Si el servidor no ha contestado, la baja queda apuntada y se reintenta al abrir la app
    if (!done && !pushStore.get().on) pushStore.set({ on: false, hash: "", syncedAt: 0, rm: { endpoint: k.endpoint, auth: k.auth } });
    await sub.unsubscribe().catch(() => {});
  } catch {
    /* ya no había suscripción */
  }
}

export async function testPush(): Promise<PushResult> {
  try {
    if (isNativeApp()) {
      const f = pushStore.get().fcm;
      if (!f) return { ok: false, reason: "error", msg: "No encontramos la suscripción. Desactiva y vuelve a activar los avisos." };
      const k = fcmKeys(f);
      await api({ action: "test", endpoint: k.endpoint, auth: k.auth });
      return { ok: true };
    }
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
  if (!p.on) {
    // baja pendiente de un intento anterior sin conexión
    if (p.rm) {
      const rm = p.rm;
      await removeOnServer(rm)
        .then(() => {
          const now = pushStore.get();
          if (!now.on && now.rm?.endpoint === rm.endpoint) pushStore.set({ on: false, hash: "", syncedAt: 0 });
        })
        .catch(() => {});
    }
    return;
  }
  if (isNativeApp()) return syncNative(p);
  if (pushSupport() !== "ok") return;
  const mine = gen;
  try {
    if (Notification.permission !== "granted") {
      // el usuario ha quitado el permiso: se apaga y, si aún se conoce la dirección, se borra en el servidor
      pushStore.set({ on: false, hash: "", syncedAt: 0 });
      const reg = await navigator.serviceWorker.getRegistration();
      const old = await reg?.pushManager.getSubscription().catch(() => null);
      if (old) {
        await removeOnServer(keysOf(old)).catch(() => {});
        await old.unsubscribe().catch(() => {});
      }
      return;
    }
    const sub = await subscribe(await registration());
    // ¿se han desactivado los avisos mientras se esperaba? (en esta pestaña o en otra)
    const off = () => mine !== gen || !pushStore.get().on;
    if (off()) {
      if (!pushStore.get().on) await sub.unsubscribe().catch(() => {});
      return;
    }
    const body = payload(sub);
    const hash = hashOf(JSON.stringify(body));
    if (hash === p.hash && Date.now() - p.syncedAt < 7 * 86_400_000) return;
    await api({ action: "save", ...body });
    if (off()) {
      // se desactivaron mientras el servidor contestaba: se deshace lo guardado y no se vuelve a activar
      if (!pushStore.get().on) {
        await removeOnServer(body.sub).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      return;
    }
    pushStore.set({ on: true, hash, syncedAt: Date.now() });
  } catch {
    /* sin conexión: se reintenta la próxima vez que se abra la app */
  }
}

/** App de Android: igual que en la web, pero con el código de Firebase (que Firebase puede cambiar de vez en cuando) */
async function syncNative(p: PushPrefs): Promise<void> {
  const mine = gen;
  try {
    if ((await nativePushPermission()) !== "granted") {
      // el usuario ha quitado el permiso en Android: se apaga y se borra del servidor
      const f = pushStore.get().fcm;
      pushStore.set({ on: false, hash: "", syncedAt: 0 });
      if (f) await removeOnServer(fcmKeys(f)).catch(() => {});
      return;
    }
    const token = await nativePushToken(false);
    if (mine !== gen || !pushStore.get().on) return;
    const prev = p.fcm;
    const f = { token, auth: prev?.auth ?? newSecret() };
    if (prev && prev.token !== token) await removeOnServer(fcmKeys(prev)).catch(() => {});
    const body = payload(fcmKeys(f));
    const hash = hashOf(JSON.stringify(body));
    if (prev?.token === token && hash === p.hash && Date.now() - p.syncedAt < 7 * 86_400_000) return;
    await api({ action: "save", ...body });
    if (mine !== gen || !pushStore.get().on) {
      if (!pushStore.get().on) await removeOnServer(body.sub).catch(() => {});
      return;
    }
    pushStore.set({ on: true, hash, syncedAt: Date.now(), fcm: f });
  } catch {
    /* sin conexión: se reintenta la próxima vez que se abra la app */
  }
}
