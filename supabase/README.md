# Puntos de recarga (REVE → Supabase)

Proyecto de Supabase: **gasolineras** (`qdutgibdyrrwwhpzvwja`, París).

## Qué hay

- **Tablas** `ev_locations`, `ev_evses`, `ev_tariffs` (lectura pública con RLS) y `ev_sync_state` / `ev_private` /
  `ev_req_log` (privadas).
- **Funciones SQL para la web** (las llama `lib/supabase.ts` con la clave pública):
  - `chargers_near(p_lat, p_lon, p_radius_km, p_limit)` → puntos cercanos con enchufes, tarifa y estado.
  - `charger_detail(p_id)` → ficha completa con el desglose de la tarifa.
  - `chargers_in_boxes(p_points, p_km, p_limit)` → puntos junto a un recorrido (pantalla Ruta, modo carga).
  - Las tres devuelven dos fechas: `updated` (`ev_last_sync()`, último estado operativo) y `prices`
    (`ev_last_prices()`, inicio de la última pasada completa de tarifas).
- **Edge functions** (código en `functions/`):
  - `reve-sync`: descarga de REVE ubicaciones, tarifas y estado operativo. La lanza `pg_cron` cada 2 minutos
    (job `reve-sync-cada-5-min`) con la cabecera `x-sync-token` guardada en `ev_private`.
  - `reve-live`: estado en tiempo real (libre / cargando) de los puntos de una ubicación. Guarda el resultado 15 min.
- **Secretos** de las edge functions: `REVE_API_KEY` (la clave personal de REVE; no va en el código ni en Git).

## Cada cuánto se actualiza

| Dato | Cómo | Cada cuánto |
| --- | --- | --- |
| Estado operativo (funciona / averiado) | incremental (`date_from`) | 10 min |
| Ubicaciones | incremental cada hora + listado completo | 1 h / 24 h |
| Tarifas (precios) | **siempre listado completo** (~470 páginas, ~15 min) | 12 h |
| Libre / cargando | bajo demanda al abrir una ficha (`reve-live`) | 15 min por punto |

Las tarifas no usan el modo incremental porque `/connectors/tariffs?date_from=…` devuelve HTTP 504 casi siempre.
Si una página del listado falla 3 veces seguidas se salta (queda anotado en `ev_sync_state.last_error` hasta la
siguiente pasada) para que un fallo puntual de REVE no deje los precios parados.

Para ver cómo va: `select * from ev_sync_state;` en el editor SQL del panel de Supabase.

## Límites de REVE

1.000 peticiones/hora por clave y 5 por URL y hora. La sincronización usa como máximo 650/h y el estado en directo 300/h
(ventana deslizante de 1 hora en `ev_req_log`, función `ev_take_budget`).

## Condiciones de uso de REVE

Uso no comercial, citar a Red Eléctrica de España como fuente, no alterar los datos y mostrar la fecha de la última
actualización (la web enseña la de los precios y la del estado en la lista, en la ruta y en cada ficha).

## SQL

- `migrations/`: cambios ya aplicados en el proyecto (referencia).
- `pending/`: SQL que hay que ejecutar a mano en el editor SQL del panel.

## Desplegar cambios en las edge functions

```bash
supabase functions deploy reve-sync --no-verify-jwt --project-ref qdutgibdyrrwwhpzvwja
supabase functions deploy reve-live --no-verify-jwt --project-ref qdutgibdyrrwwhpzvwja
```
