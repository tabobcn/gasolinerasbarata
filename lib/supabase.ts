import "server-only";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

/** Llama a una función SQL de Supabase (RPC) con la clave pública */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Base de datos de cargadores: error ${res.status}`);
  return (await res.json()) as T;
}

/** Edge function pública de Supabase */
export async function edge<T>(name: string, query: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}?${query}`, {
    headers: { apikey: SUPABASE_KEY, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

export const validId = (id: string) => /^[A-Za-z0-9_-]{6,64}$/.test(id);
