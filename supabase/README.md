# Puntos de recarga (REVE → Supabase)

Proyecto de Supabase: **gasolineras** (`qdutgibdyrrwwhpzvwja`, París).

## Qué hay

- **Tablas** `ev_locations`, `ev_evses`, `ev_tariffs` (lectura pública con RLS) y `ev_sync_state` / `ev_private` (privadas).
- **Funciones SQL para la web** (las llama `lib/supabase.ts` con la clave pública):
  - `chargers_near(p_lat, p_lon, p_radius_km, p_limit)` → puntos cercanos con enchufes, tarifa y estado.
  - `charger_detail(p_id)` → ficha completa con el desglose de la tarifa.
- **Edge functions** (código en `functions/`):
  - `reve-sync`: descarga de REVE ubicaciones, tarifas y estado operativo. La lanza `pg_cron` cada 2 minutos
    (job `reve-sync-cada-5-min`) con la cabecera `x-sync-token` guardada en `ev_private`.
  - `reve-live`: estado en tiempo real (libre / cargando) de los puntos de una ubicación. Guarda el resultado 15 min.
- **Secretos** de las edge functions: `REVE_API_KEY` (la clave personal de REVE; no va en el código ni en Git).

## Límites de REVE

1.000 peticiones/hora por clave y 5 por URL y hora. La sincronización usa como máximo 600/h y el estado en directo 300/h
(contadores `_budget` y `_budget_live` en `ev_sync_state`, función `ev_take_budget`).

## Condiciones de uso de REVE

Uso no comercial, citar a Red Eléctrica de España como fuente, no alterar los datos y mostrar la fecha de la última
actualización (la web lo hace en la lista y en cada ficha).

## Desplegar cambios en las edge functions

```bash
supabase functions deploy reve-sync --no-verify-jwt --project-ref qdutgibdyrrwwhpzvwja
supabase functions deploy reve-live --no-verify-jwt --project-ref qdutgibdyrrwwhpzvwja
```
