/** Cambia aquí el nombre de la app */
export const APP_NAME = "Gasolineras Cerca";
export const APP_SHORT = "Gasolineras";
export const APP_DESCRIPTION =
  "Encuentra la gasolinera más barata y los cargadores para coche eléctrico cerca de ti: precios oficiales del Ministerio, puntos de recarga con precio y estado, cuánto ahorras de verdad y cómo llegar con Google Maps o Waze.";

/**
 * Supabase (puntos de recarga de REVE). Son valores públicos: la clave "publishable" solo permite
 * leer lo que las reglas de la base de datos dejan leer. Se pueden cambiar con variables de entorno.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qdutgibdyrrwwhpzvwja.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_bcCfDMKBts9QeTLIPCnXjQ__q1GQ_wL";

/** Dirección pública de la web (para Google: sitemap, enlaces canónicos). Cámbiala si pones dominio propio. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://gasolinerasbarata.vercel.app").replace(/\/$/, "");
