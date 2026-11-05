// Estado en tiempo real (libre / cargando / fuera de servicio) de los puntos de una ubicación.
// REVE solo lo da EVSE a EVSE y permite 5 consultas por URL y hora, así que:
//  - cada punto se pregunta como mucho una vez cada 15 minutos (reserva atómica en la base de datos),
//  - hay un presupuesto propio de 300 peticiones/hora (ventana deslizante; la sincronización usa 650).
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www.mapareve.es/api/external/v1";
const MAX_PER_CALL = 16;
const LIVE_BUDGET = 300;

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const KEY = Deno.env.get("REVE_API_KEY") ?? "";

type Claimed = { id: string; evse_id: string | null };
type Row = { id: string; status: string | null; status_updated: string | null; status_checked: string | null };

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
  if (!KEY) return json({ error: "Estado en directo no disponible" }, 503);

  // Reserva los puntos que toca preguntar (ninguna otra visita los volverá a pedir en 15 min)
  const { data: claimed, error } = await supa.rpc("ev_claim_live", { p_location: loc, p_limit: MAX_PER_CALL });
  if (error) return json({ error: "Estado en directo no disponible" }, 503);

  let limited = false;
  await Promise.all(
    ((claimed ?? []) as Claimed[]).map(async (e) => {
      if (limited || !(await takeBudget())) return;
      try {
        const r = await fetchStatus(e.evse_id ?? e.id);
        if (r.code === 429) {
          limited = true;
          await supa.rpc("ev_exhaust_budget", { p_key: "_budget_live", p_max: LIVE_BUDGET });
          return;
        }
        if (!r.data) return;
        // status_checked solo se marca si REVE ha contestado: así nunca se presenta un dato viejo como reciente
        await supa
          .from("ev_evses")
          .update({ status: r.data.status, status_updated: r.data.last_status_updated ?? null, status_checked: new Date().toISOString() })
          .eq("id", e.id);
      } catch {
        /* sin respuesta de REVE: se queda el dato anterior */
      }
    }),
  );

  const { data: rows } = await supa.from("ev_evses").select("id, status, status_updated, status_checked").eq("location_id", loc).limit(60);
  return json({
    checked: new Date().toISOString(),
    evses: ((rows ?? []) as Row[]).map((e) => ({ id: e.id, st: e.status, stu: e.status_updated, chk: e.status_checked })),
  });
});
