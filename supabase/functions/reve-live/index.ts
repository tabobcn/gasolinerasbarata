// Estado en tiempo real (libre / cargando / fuera de servicio) de los puntos de una ubicación.
// REVE solo lo da EVSE a EVSE y permite 5 consultas por URL y hora, así que guardamos el resultado
// 15 minutos y usamos un presupuesto propio de 300 peticiones/hora (la sincronización usa 600).
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www.mapareve.es/api/external/v1";
const FRESH_MS = 15 * 60_000;
const MAX_PER_CALL = 16;
const LIVE_BUDGET = 300;

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const KEY = Deno.env.get("REVE_API_KEY") ?? "";

type Row = { id: string; evse_id: string | null; status: string | null; status_updated: string | null; status_checked: string | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function takeBudget(): Promise<boolean> {
  const { data, error } = await supa.rpc("ev_take_budget", { p_key: "_budget_live", p_max: LIVE_BUDGET });
  return !error && data === true;
}

async function fetchStatus(id: string) {
  const res = await fetch(`${BASE}/evses/${encodeURIComponent(id)}/status`, {
    headers: { "x-api-key": KEY, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 200) return { code: res.status, data: null };
  const data = (await res.json().catch(() => null)) as { status?: string; last_status_updated?: string } | null;
  return { code: 200, data: data?.status ? data : null };
}

Deno.serve(async (req) => {
  const loc = new URL(req.url).searchParams.get("location") ?? "";
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(loc)) return json({ error: "Ubicación no válida" }, 400);
  if (!KEY) return json({ error: "Falta el secreto REVE_API_KEY" }, 500);

  const { data, error } = await supa
    .from("ev_evses")
    .select("id, evse_id, status, status_updated, status_checked")
    .eq("location_id", loc)
    .order("evse_id")
    .limit(40);
  if (error) return json({ error: error.message }, 500);
  const evses = (data ?? []) as Row[];

  const now = Date.now();
  const stale = evses.filter((e) => !e.status_checked || now - Date.parse(e.status_checked) > FRESH_MS).slice(0, MAX_PER_CALL);
  let asked = 0;
  let failed = 0;
  let noBudget = 0;
  const codes: Record<string, number> = {};

  if (stale.length) {
    const checkedAt = new Date().toISOString();
    // Se marca antes de preguntar para que dos visitas a la vez no repitan la consulta
    await supa.from("ev_evses").update({ status_checked: checkedAt }).in("id", stale.map((e) => e.id));
    await Promise.all(
      stale.map(async (e) => {
        if (!(await takeBudget())) {
          noBudget++;
          return;
        }
        asked++;
        try {
          // REVE identifica el EVSE por su código eMI3 (ES*ESX*E…*1), no por el id interno
          const r = await fetchStatus(e.evse_id ?? e.id);
          codes[r.code] = (codes[r.code] ?? 0) + 1;
          if (!r.data) {
            failed++;
            return;
          }
          e.status = r.data.status!;
          e.status_updated = r.data.last_status_updated ?? null;
          await supa.from("ev_evses").update({ status: e.status, status_updated: e.status_updated }).eq("id", e.id);
        } catch {
          failed++;
        } finally {
          e.status_checked = checkedAt;
        }
      }),
    );
  }

  return json({
    checked: new Date().toISOString(),
    asked,
    failed,
    noBudget,
    codes,
    evses: evses.map((e) => ({ id: e.id, st: e.status, stu: e.status_updated, chk: e.status_checked })),
  });
});
