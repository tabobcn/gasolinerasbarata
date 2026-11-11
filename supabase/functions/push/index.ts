// Avisos push de las alertas de precio (para que lleguen con la app cerrada).
//  GET  ?action=key     → clave pública del servidor (la necesita el navegador para suscribirse)
//  POST ?action=save    → guarda la suscripción del navegador con sus alertas
//  POST ?action=remove  → la borra
//  POST ?action=test    → manda un aviso de prueba
//  POST ?action=check   → (solo pg_cron, con x-sync-token) comprueba precios y manda los avisos
// No guarda datos personales: la dirección push que da el navegador, las alertas y los descuentos.
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import { generateVapid, sendPush, type PushTarget, type Vapid } from "./webpush.ts";

const SITE = (Deno.env.get("SITE_URL") ?? "https://www.repostaycarga.es").replace(/\/$/, "");
const MAX_SUBS = 5000;
const TIME_BUDGET_MS = 110_000;
const QUIET_FROM = 23; // de 23:00 a 7:00 (hora de Madrid) no se manda nada
const QUIET_TO = 7;

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) => Response.json(body, { status });

// Solo servicios push de navegadores conocidos (para que nadie use esto para llamar a otras webs)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

// ---------- Claves del servidor (se crean solas la primera vez y se guardan en ev_private) ----------

let vapidCache: Vapid | null = null;
async function vapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const read = async () => {
    const { data, error } = await supa.from("ev_private").select("v").eq("k", "vapid").maybeSingle();
    if (error) throw new Error("No se pueden leer las claves"); // un fallo de lectura no es "no hay clave": no se genera otra
    return data?.v ? (JSON.parse(data.v) as Vapid) : null;
  };
  let v = await read();
  if (!v) {
    const fresh = await generateVapid();
    await supa.from("ev_private").upsert({ k: "vapid", v: JSON.stringify(fresh) }, { onConflict: "k", ignoreDuplicates: true });
    v = await read();
    // si no se ha podido guardar, no se usa una clave que ninguna otra instancia conocería
    if (!v) throw new Error("No se han podido guardar las claves");
  }
  vapidCache = v;
  return v;
}

// ---------- Validación ----------

type AlertIn = { id: string; fuel: string; threshold: number; radius: number; lat: number; lon: number; label: string };
type Sub = PushTarget;

const B64 = /^[A-Za-z0-9_-]+$/;
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const inSpain = (lat: number, lon: number) => lat >= 27 && lat <= 44.5 && lon >= -18.5 && lon <= 4.6;

function parseSub(raw: unknown): Sub | null {
  const s = raw as Record<string, unknown> | null;
  const endpoint = str(s?.endpoint, 2000);
  const p256dh = str(s?.p256dh, 120);
  const auth = str(s?.auth, 40);
  if (!endpoint || !p256dh || !auth || !B64.test(p256dh) || !B64.test(auth) || p256dh.length < 80 || auth.length < 16) return null;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port || u.username || !PUSH_HOSTS.some((re) => re.test(u.hostname))) return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

function parseAlerts(raw: unknown): AlertIn[] {
  if (!Array.isArray(raw)) return [];
  const out: AlertIn[] = [];
  for (const x of raw.slice(0, 10)) {
    const id = str(x?.id, 20);
    const fuel = str(x?.fuel, 6);
    const threshold = Number(x?.threshold);
    const radius = Number(x?.radius);
    const lat = Number(x?.lat);
    const lon = Number(x?.lon);
    const label = (str(x?.label, 60) ?? "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 40);
    if (!id || !/^[A-Za-z0-9]+$/.test(id) || !fuel || !/^[a-z0-9]+$/.test(fuel)) continue;
    if (!(threshold > 0.2 && threshold < 5) || !(radius >= 1 && radius <= 25) || !Number.isFinite(lat) || !Number.isFinite(lon) || !inSpain(lat, lon)) continue;
    out.push({ id, fuel, threshold: Math.round(threshold * 1000) / 1000, radius: Math.round(radius), lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000, label: label || "ti" });
  }
  return out;
}

function parseFavs(raw: unknown): { id: string; m: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 30)
    .map((x) => ({ id: String(x?.id ?? ""), m: String(x?.m ?? "") }))
    .filter((x) => /^\d{1,6}$/.test(x.id) && /^\d{1,5}$/.test(x.m));
}

const parseFuels = (raw: unknown): string[] => (Array.isArray(raw) ? [...new Set(raw.filter((f) => typeof f === "string" && /^[a-z0-9]{2,6}$/.test(f)))].slice(0, 8) : []);

// ---------- Estado de cada alerta (para no repetir avisos) ----------

type AlertState = { sig: string; hit: boolean; price: number | null; day: string | null };
type State = { a: Record<string, AlertState>; fav: string[] };
const sigOf = (a: AlertIn) => `${a.fuel}|${a.threshold}|${a.radius}|${a.lat}|${a.lon}`;
const emptyState = (): State => ({ a: {}, fav: [] });

/** Conserva el estado de las alertas que siguen igual; las nuevas o cambiadas empiezan de cero */
function carryState(prev: State | null, alerts: AlertIn[]): State {
  const out = emptyState();
  out.fav = Array.isArray(prev?.fav) ? prev!.fav.slice(-60) : [];
  for (const a of alerts) {
    const p = prev?.a?.[a.id];
    if (p && p.sig === sigOf(a)) out.a[a.id] = p;
  }
  return out;
}

// ---------- Guardar / borrar / probar ----------

async function save(body: Record<string, unknown>) {
  const sub = parseSub(body.sub);
  if (!sub) return json({ error: "Suscripción no válida" }, 400);
  const alerts = parseAlerts(body.alerts);
  const favs = parseFavs(body.favs);
  const favFuels = parseFuels(body.favFuels);
  const disc = typeof body.disc === "string" ? body.disc.slice(0, 600) : "";
  const { data: prev, error: prevErr } = await supa.from("push_subs").select("id, auth, state").eq("endpoint", sub.endpoint).maybeSingle();
  if (prevErr) return json({ error: "No se ha podido guardar" }, 500);
  // Una suscripción ya guardada solo la puede cambiar quien tenga su clave (igual que al borrar o probar)
  if (prev && prev.auth !== sub.auth) return json({ error: "Suscripción no válida" }, 403);
  if (!prev) {
    const { count, error: countErr } = await supa.from("push_subs").select("id", { count: "exact", head: true });
    if (countErr || (count ?? 0) >= MAX_SUBS) return json({ error: "Ahora mismo no se pueden activar más avisos" }, 503);
    // Una suscripción nueva tiene que demostrar que existe: se le manda un aviso y solo se guarda si el servicio push lo acepta
    const probe = await sendPush(sub, { title: "Avisos activados", body: "Te avisaremos cuando se cumpla una de tus alertas de precio.", url: "/alertas", tag: "alta" }, await vapid(), SITE, 600).catch(() => 0);
    if (!(probe >= 200 && probe < 300)) return json({ error: "El navegador no ha confirmado la suscripción. Desactiva y vuelve a activar los avisos." }, 400);
  }
  const row = {
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    alerts,
    discounts: disc,
    favs: favFuels.length ? favs : [],
    fav_fuels: favFuels,
    state: carryState((prev?.state as State) ?? null, alerts),
    updated_at: new Date().toISOString(),
    fails: 0,
  };
  if (prev) {
    // Solo se actualiza la fila que ya existía. Si se ha borrado mientras tanto (el usuario desactivó los avisos), no se vuelve a crear.
    const { data: upd, error } = await supa.from("push_subs").update(row).eq("id", prev.id).eq("auth", sub.auth).select("id");
    if (error) return json({ error: "No se ha podido guardar" }, 500);
    if (!upd?.length) return json({ error: "Suscripción no válida" }, 409);
  } else {
    const { error } = await supa.from("push_subs").upsert(row, { onConflict: "endpoint", ignoreDuplicates: true });
    if (error) return json({ error: "No se ha podido guardar" }, 500);
  }
  return json({ ok: true, alerts: alerts.length });
}

async function findOwn(body: Record<string, unknown>) {
  const endpoint = str(body.endpoint, 2000);
  const auth = str(body.auth, 40);
  if (!endpoint || !auth) return null;
  const { data } = await supa.from("push_subs").select("id, endpoint, p256dh, auth, last_test").eq("endpoint", endpoint).eq("auth", auth).maybeSingle();
  return data as (Sub & { id: string; last_test: string | null }) | null;
}

async function remove(body: Record<string, unknown>) {
  const endpoint = str(body.endpoint, 2000);
  const auth = str(body.auth, 40);
  if (!endpoint || !auth) return json({ ok: true });
  // Si la base de datos falla se dice, para que la app lo reintente en vez de dar la baja por hecha
  const { error } = await supa.from("push_subs").delete().eq("endpoint", endpoint).eq("auth", auth);
  if (error) return json({ error: "No se ha podido borrar ahora mismo" }, 503);
  return json({ ok: true });
}

async function test(body: Record<string, unknown>) {
  const row = await findOwn(body);
  if (!row) return json({ error: "No encontramos tu suscripción. Desactiva y vuelve a activar los avisos." }, 404);
  if (row.last_test && Date.now() - Date.parse(row.last_test) < 20_000) return json({ error: "Espera unos segundos antes de probar otra vez" }, 429);
  const status = await sendPush(row, { title: "Avisos activados", body: "Así te llegarán las alertas de precio aunque tengas la app cerrada.", url: "/alertas", tag: "prueba" }, await vapid(), SITE, 600).catch(() => 0);
  if (status === 404 || status === 410) {
    await supa.from("push_subs").delete().eq("id", row.id);
    return json({ error: "La suscripción había caducado. Desactiva y vuelve a activar los avisos." }, 410);
  }
  await supa.from("push_subs").update({ last_test: new Date().toISOString(), last_status: status }).eq("id", row.id);
  const ok = status >= 200 && status < 300;
  return json(ok ? { ok: true } : { error: `El servicio de avisos del navegador ha respondido ${status || "sin conexión"}` }, ok ? 200 : 502);
}

// ---------- Comprobación periódica ----------

type CheckAlert = { id: string; hit: boolean; price: number | null; title?: string; body?: string; url?: string };
type CheckFav = { key: string; title: string; body: string; url: string };
type CheckResponse = { day: string; alerts: CheckAlert[]; favs: CheckFav[] };

/** Los avisos solo llevan a páginas de la propia web */
const sitePath = (u: unknown) => (typeof u === "string" && u.length <= 200 && /^\/[A-Za-z0-9][A-Za-z0-9/?=&%._-]*$/.test(u) ? u : "/alertas");

/** Comparación del token sin cortar en el primer carácter distinto */
function sameToken(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}

const madridHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(new Date())) % 24;

// deno-lint-ignore no-explicit-any
async function checkOne(row: any, v: Vapid): Promise<{ sent: number; gone?: boolean }> {
  const alerts = parseAlerts(row.alerts);
  const favs = parseFavs(row.favs);
  const now = new Date().toISOString();
  if (!alerts.length && !favs.length) {
    await supa.from("push_subs").update({ checked_at: now }).eq("id", row.id);
    return { sent: 0 };
  }
  const res = await fetch(`${SITE}/api/alerts/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ alerts, disc: row.discounts ?? "", favs, favFuels: parseFuels(row.fav_fuels) }),
    signal: AbortSignal.timeout(40_000),
  }).catch(() => null);
  if (!res?.ok) {
    await res?.body?.cancel().catch(() => {});
    await supa.from("push_subs").update({ checked_at: now }).eq("id", row.id);
    return { sent: 0 };
  }
  const data = (await res.json()) as CheckResponse;
  const state = carryState((row.state as State) ?? null, alerts);
  const queue: { payload: Record<string, string>; apply: () => void }[] = [];

  for (const a of alerts) {
    const r = data.alerts.find((x) => x.id === a.id);
    if (!r) continue; // no se pudo comprobar (fallo del Ministerio): se deja como estaba
    const st = state.a[a.id] ?? { sig: sigOf(a), hit: false, price: null, day: null };
    if (r.hit && r.price != null) {
      // Avisar cuando empieza a cumplirse, o si sigue cumpliéndose y baja 1 céntimo más. Como mucho 1 al día.
      const better = !st.hit || (st.price != null && r.price <= st.price - 0.01 + 1e-9);
      if (better && st.day !== data.day && r.title) {
        const price = r.price;
        queue.push({
          payload: { title: r.title, body: r.body ?? "", url: sitePath(r.url), tag: `alerta-${a.id}` },
          apply: () => (state.a[a.id] = { sig: sigOf(a), hit: true, price, day: data.day }),
        });
      } else if (!st.hit) state.a[a.id] = { ...st, hit: true, price: st.price ?? r.price };
      else state.a[a.id] = st;
    } else state.a[a.id] = { sig: sigOf(a), hit: false, price: null, day: st.day };
  }
  for (const f of data.favs.filter((x) => !state.fav.includes(x.key)).slice(0, 3)) {
    queue.push({ payload: { title: f.title, body: f.body, url: sitePath(f.url), tag: f.key }, apply: () => state.fav.push(f.key) });
  }

  let sent = 0;
  let status: number | null = null;
  for (const q of queue) {
    status = await sendPush(row, q.payload, v, SITE).catch(() => 0);
    if (status === 404 || status === 410) {
      await supa.from("push_subs").delete().eq("id", row.id); // el navegador ya no tiene esa suscripción
      return { sent, gone: true };
    }
    if (status >= 200 && status < 300) {
      q.apply();
      sent++;
    } else break; // fallo temporal: se reintenta en la siguiente comprobación
  }
  const failed = status != null && !(status >= 200 && status < 300);
  const fails = failed ? (row.fails ?? 0) + 1 : 0;
  if (fails >= 20) {
    await supa.from("push_subs").delete().eq("id", row.id);
    return { sent, gone: true };
  }
  state.fav = state.fav.slice(-60);
  await supa
    .from("push_subs")
    .update({ state, checked_at: now, fails, ...(status != null ? { last_status: status } : {}), ...(sent ? { last_push_at: now } : {}) })
    .eq("id", row.id);
  return { sent };
}

async function check() {
  const h = madridHour();
  if (Deno.env.get("PUSH_NO_QUIET") !== "1" && (h >= QUIET_FROM || h < QUIET_TO)) return { ok: true, skipped: "de noche no se avisa" };
  const started = Date.now();
  const v = await vapid();
  // Caducidad: la app renueva su suscripción cada semana al abrirse; 90 días sin renovar = abandonada
  await supa.from("push_subs").delete().lt("updated_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
  const { data: rows, error } = await supa.from("push_subs").select("*").order("checked_at", { ascending: true, nullsFirst: true }).limit(400);
  if (error) throw new Error(error.message);
  let sent = 0;
  let gone = 0;
  let done = 0;
  const list = rows ?? [];
  // De 4 en 4 para no cargar la web ni tardar demasiado
  for (let i = 0; i < list.length && Date.now() - started < TIME_BUDGET_MS; i += 4) {
    const res = await Promise.all(list.slice(i, i + 4).map((r) => checkOne(r, v).catch(() => ({ sent: 0 }) as { sent: number; gone?: boolean })));
    for (const r of res) {
      sent += r.sent;
      if (r.gone) gone++;
      done++;
    }
  }
  return { ok: true, subs: list.length, checked: done, sent, removed: gone };
}

Deno.serve(async (req) => {
  const action = new URL(req.url).searchParams.get("action") ?? "";
  try {
    if (req.method === "GET" && action === "key") return json({ key: (await vapid()).publicKey });
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
    if (action === "check") {
      const token = req.headers.get("x-sync-token") ?? "";
      const { data } = await supa.from("ev_private").select("v").eq("k", "sync_token").maybeSingle();
      if (!data?.v || !sameToken(token, String(data.v))) return json({ error: "No autorizado" }, 401);
      return json(await check());
    }
    const text = await req.text();
    if (text.length > 20_000) return json({ error: "Petición demasiado grande" }, 413);
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object") return json({ error: "Petición no válida" }, 400);
    if (action === "save") return await save(body);
    if (action === "remove") return await remove(body);
    if (action === "test") return await test(body);
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Error interno" }, 500);
  }
});
