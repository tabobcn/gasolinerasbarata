// Avisos a la app de Android por Firebase Cloud Messaging (API HTTP v1), sin dependencias.
// La cuenta de servicio de Firebase va en el secreto FCM_SERVICE_ACCOUNT (el JSON completo). No está en el código.
// Firebase Cloud Messaging no tiene coste.

const enc = new TextEncoder();

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

let account: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  try {
    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    const a = raw ? (JSON.parse(raw) as ServiceAccount) : null;
    account = a?.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    account = null;
  }
  return account;
}

/** ¿Está configurado Firebase? (si no, los avisos a la app no se pueden mandar) */
export const fcmReady = () => serviceAccount() != null;

const b64u = (b: Uint8Array | ArrayBuffer) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string): ArrayBuffer {
  const bin = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

let tokenCache: { token: string; exp: number } | null = null;

/** Token de acceso de Google para la cuenta de servicio (dura 1 hora; se reutiliza) */
async function accessToken(a: ServiceAccount): Promise<string> {
  if (tokenCache && tokenCache.exp - 60 > Date.now() / 1000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = a.token_uri || "https://oauth2.googleapis.com/token";
  const head = b64u(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64u(enc.encode(JSON.stringify({ iss: a.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: tokenUri, iat: now, exp: now + 3600 })));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(a.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${head}.${claims}`));
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64u(sig)}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const out = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !out.access_token) throw new Error(`Google no ha dado el token (${res.status})`);
  tokenCache = { token: out.access_token, exp: now + (out.expires_in ?? 3600) };
  return out.access_token;
}

export type FcmPayload = { title: string; body: string; url: string; tag: string };

/**
 * Manda un aviso a un móvil. Devuelve un código como el de los avisos web para tratarlos igual:
 * 200 = aceptado; 404 = ese móvil ya no existe (app desinstalada o código caducado); otro = fallo temporal.
 */
export async function sendFcm(token: string, p: FcmPayload, ttlSeconds = 6 * 3600): Promise<number> {
  const a = serviceAccount();
  if (!a) return 503;
  const message = {
    token,
    notification: { title: p.title, body: p.body },
    data: { url: p.url, tag: p.tag },
    android: {
      priority: "HIGH",
      ttl: `${ttlSeconds}s`,
      collapse_key: p.tag.slice(0, 60),
      notification: { tag: p.tag.slice(0, 60), channel_id: "alertas", icon: "ic_notification_icon", color: "#0B7A43" },
    },
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(a)}`, "content-type": "application/json" },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) {
    await res.body?.cancel().catch(() => {});
    return 200;
  }
  const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
  const code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status ?? "";
  // UNREGISTERED: el móvil ya no tiene la app o el código ha caducado → se borra la suscripción
  if (res.status === 404 || code === "UNREGISTERED") return 404;
  // Código con formato inválido: tampoco sirve
  if (res.status === 400 && code === "INVALID_ARGUMENT") return 404;
  return res.status;
}
