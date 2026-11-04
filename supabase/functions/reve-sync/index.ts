// Sincroniza los puntos de recarga de REVE (Red Eléctrica de España) en Supabase.
// Lo lanza pg_cron cada pocos minutos. Respeta los límites de REVE: 1.000 peticiones/hora por clave
// (la sincronización usa como máximo 600 y el estado en directo 300) y 5 peticiones por URL y hora.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www.mapareve.es/api/external/v1";
const MAX_REQ_PER_HOUR = 600;
const TIME_BUDGET_MS = 100_000;
const PAGE = 100;

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const KEY = Deno.env.get("REVE_API_KEY") ?? "";

type State = {
  resource: string;
  cursor_date: string | null;
  next_page: number;
  total_pages: number | null;
  phase: string | null;
  pass_started: string | null;
  last_error: string | null;
  updated_at?: string;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
};
// deno-lint-ignore no-explicit-any
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

async function getState(resource: string): Promise<State> {
  const { data } = await supa.from("ev_sync_state").select("*").eq("resource", resource).maybeSingle();
  return (
    (data as State) ?? {
      resource,
      cursor_date: null,
      next_page: 1,
      total_pages: null,
      phase: "full",
      pass_started: null,
      last_error: null,
    }
  );
}

async function saveState(s: State) {
  const { updated_at: _u, ...rest } = s;
  await supa.from("ev_sync_state").upsert({ ...rest, updated_at: new Date().toISOString() });
}

// Presupuesto de peticiones por hora (contador atómico en la base de datos)
async function takeBudget(): Promise<boolean> {
  const { data, error } = await supa.rpc("ev_take_budget", { p_key: "_budget", p_max: MAX_REQ_PER_HOUR });
  return !error && data === true;
}

async function exhaustBudget() {
  await supa.from("ev_sync_state").update({ next_page: MAX_REQ_PER_HOUR }).eq("resource", "_budget");
}

async function fetchPage(path: string, params: Record<string, string | number>) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { "x-api-key": KEY, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const totalPages = Number(res.headers.get("total-pages")) || null;
  const totalCount = Number(res.headers.get("total-count"));
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, totalPages, totalCount: Number.isFinite(totalCount) ? totalCount : null };
}

async function upsertChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supa.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ---------- Guardado de cada tipo de dato ----------

// deno-lint-ignore no-explicit-any
async function storeLocations(items: any[]) {
  const now = new Date().toISOString();
  const locs = items
    .map((l) => ({
      id: l.id,
      name: l.name ?? null,
      address: l.address ?? null,
      city: l.city ?? null,
      postal_code: l.postal_code ?? null,
      region: l.region ?? null,
      operator: (l.cpo_name ?? "").trim() || null,
      party_id: l.party_id ?? null,
      owner: l.owner ?? null,
      lat: num(l.coordinates?.latitude),
      lon: num(l.coordinates?.longitude),
      twentyfourseven: l.opening_times?.twentyfourseven ?? null,
      opening: l.opening_times ?? null,
      parking_type: l.parking_type ?? null,
      facilities: Array.isArray(l.facilities) ? l.facilities : null,
      directions: arr(l.directions).map((d) => d?.text).filter(Boolean).join(" · ") || null,
      updated_at: l.last_updated ?? null,
      synced_at: now,
    }))
    .filter((l) => l.id && l.lat != null && l.lon != null);
  const evses = items
    .flatMap((l) =>
      arr(l.evses).map((e) => {
        const conns = arr(e.connectors).map((c) => ({
          id: c.id,
          standard: c.standard ?? null,
          format: c.format ?? null,
          power_type: c.power_type ?? null,
          kw: num(c.max_electric_power) ? Math.round(num(c.max_electric_power)! / 100) / 10 : null,
        }));
        const maxKw = Math.max(0, ...conns.map((c) => c.kw ?? 0));
        return {
          id: e.id,
          evse_id: e.evse_id ?? null,
          location_id: l.id,
          connectors: conns,
          max_kw: maxKw || null,
          capabilities: Array.isArray(e.capabilities) ? e.capabilities : null,
          floor_level: e.floor_level ?? null,
          physical_reference: e.physical_reference ?? null,
          updated_at: e.last_static_updated ?? null,
          synced_at: now,
        };
      }),
    )
    .filter((e) => e.id);
  await upsertChunks("ev_locations", locs, "id");
  await upsertChunks("ev_evses", evses, "id");
  return locs.length;
}

// deno-lint-ignore no-explicit-any
async function storeStatus(items: any[]) {
  const now = new Date().toISOString();
  const rows = items
    .filter((x) => x.id)
    .map((x) => ({
      id: x.id,
      evse_id: x.evse_id ?? null,
      operational: typeof x.operational_status === "boolean" ? x.operational_status : null,
      operational_updated: x.last_operational_status_updated ?? null,
      synced_at: now,
    }));
  // Solo actualiza EVSEs que ya conocemos (un upsert crearía filas sin ubicación)
  const { error } = await supa.rpc("ev_apply_status", { p_rows: rows });
  if (error) throw new Error(`ev_apply_status: ${error.message}`);
  return rows.length;
}

// deno-lint-ignore no-explicit-any
function summarizeTariff(x: any) {
  const now = Date.now();
  const list = arr(x.tariffs);
  const t =
    list.find(
      (t) =>
        (!t.start_date_time || Date.parse(t.start_date_time) <= now) &&
        (!t.end_date_time || Date.parse(t.end_date_time) >= now),
    ) ?? list[0];
  let energy: number | null = null;
  let timeH: number | null = null;
  let flat: number | null = null;
  let vat: number | null = null;
  const elements = arr(t?.elements);
  for (const el of elements) {
    const restricted = el.restrictions && Object.keys(el.restrictions).length > 0;
    if (restricted) continue;
    for (const pc of arr(el.price_components)) {
      const p = num(pc.price);
      if (p == null) continue;
      if (pc.type === "ENERGY" && energy == null) {
        energy = p;
        vat = num(pc.vat) ?? vat;
      } else if (pc.type === "TIME" && timeH == null) timeH = p;
      else if (pc.type === "FLAT" && flat == null) flat = p;
    }
  }
  if (energy == null) {
    const all = elements.flatMap((el) => arr(el.price_components)).filter((pc) => pc.type === "ENERGY" && num(pc.price) != null);
    if (all.length) {
      energy = Math.min(...all.map((p) => num(p.price)!));
      vat = num(all[0].vat);
    }
  }
  if (vat == null) {
    const any = elements.flatMap((el) => arr(el.price_components)).find((pc) => num(pc.vat) != null);
    vat = any ? num(any.vat) : null;
  }
  return {
    connector_id: x.connector_id,
    evse_id: x.evse_id ?? null,
    currency: t?.currency ?? "EUR",
    energy_price: energy,
    time_price_hour: timeH,
    flat_price: flat,
    vat,
    elements: elements.length ? elements : null,
    updated_at: x.last_tariff_updated ?? t?.last_tariff_updated ?? null,
  };
}

// deno-lint-ignore no-explicit-any
async function storeTariffs(items: any[]) {
  const now = new Date().toISOString();
  const rows = items.filter((x) => x.connector_id).map((x) => ({ ...summarizeTariff(x), synced_at: now }));
  await upsertChunks("ev_tariffs", rows, "connector_id");
  return rows.length;
}

// Orden: primero ubicaciones (sin ellas no se puede mostrar nada), luego tarifas y estado.
// everyMin: cada cuánto se vuelve a pedir lo que ha cambiado una vez hecha la carga completa.
const RESOURCES = [
  { name: "locations", path: "/locations", everyMin: 60, store: storeLocations },
  { name: "tariffs", path: "/connectors/tariffs", everyMin: 30, store: storeTariffs },
  { name: "status", path: "/evses/operational_status", everyMin: 10, store: storeStatus },
];

async function run() {
  const started = Date.now();
  const report: Record<string, unknown>[] = [];
  for (const r of RESOURCES) {
    const s = await getState(r.name);
    if (s.phase === "idle") {
      const last = s.updated_at ? Date.parse(s.updated_at) : 0;
      if (Date.now() - last < r.everyMin * 60_000) continue;
      s.phase = "incremental";
      s.next_page = 1;
      s.total_pages = null;
      s.pass_started = new Date().toISOString();
    }
    if (!s.phase) s.phase = "full";
    if (!s.pass_started) s.pass_started = new Date().toISOString();
    let pages = 0;
    let rows = 0;
    while (Date.now() - started < TIME_BUDGET_MS) {
      if (s.total_pages != null && s.next_page > s.total_pages) {
        s.phase = "idle";
        s.cursor_date = s.pass_started;
        s.pass_started = null;
        s.next_page = 1;
        s.last_error = null;
        await saveState(s);
        break;
      }
      if (!(await takeBudget())) {
        await saveState(s);
        report.push({ resource: r.name, pages, rows, stop: "presupuesto horario agotado" });
        return report;
      }
      const params: Record<string, string | number> = { page: s.next_page, limit: PAGE };
      if (s.phase === "incremental" && s.cursor_date) params.date_from = s.cursor_date;
      const res = await fetchPage(r.path, params);
      if (res.status === 429) {
        await exhaustBudget();
        s.last_error = "HTTP 429 (límite de REVE)";
        await saveState(s);
        report.push({ resource: r.name, pages, rows, stop: "429" });
        return report;
      }
      if (res.status !== 200 || !Array.isArray(res.data)) {
        s.last_error = `HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`;
        await saveState(s);
        report.push({ resource: r.name, pages, rows, stop: s.last_error });
        break;
      }
      if (res.totalPages != null) s.total_pages = res.totalPages;
      const data = res.data as unknown[];
      if (data.length) rows += await r.store(data);
      pages += 1;
      if (!data.length || (res.totalPages == null && data.length < PAGE)) s.total_pages = s.next_page;
      if (res.totalCount === 0) s.total_pages = 0;
      s.next_page += 1;
      await saveState(s);
    }
    report.push({ resource: r.name, phase: s.phase, pages, rows, next_page: s.next_page, total_pages: s.total_pages });
    if (Date.now() - started >= TIME_BUDGET_MS) break;
  }
  return report;
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-sync-token") ?? "";
  const { data } = await supa.from("ev_private").select("v").eq("k", "sync_token").maybeSingle();
  if (!data?.v || token !== data.v) return new Response("No autorizado", { status: 401 });
  if (!KEY) return new Response("Falta el secreto REVE_API_KEY", { status: 500 });
  try {
    const report = await run();
    return Response.json({ ok: true, report });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
