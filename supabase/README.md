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
  - `push`: avisos de las alertas de precio con la app cerrada (ver más abajo).
- `ev_points()` → coordenadas de todas las ubicaciones; con ella las páginas `/cargadores/...` y el sitemap saben qué
  municipios tienen cargadores.
- **Secretos** de las edge functions: `REVE_API_KEY` (la clave personal de REVE; no va en el código ni en Git).

## Avisos push (alertas de precio con la app cerrada)

- La app (pantalla Alertas → «Avisarme con la app cerrada») suscribe el navegador y manda a `push` esa suscripción con
  las alertas. Se guarda en la tabla privada `push_subs` (sin nombre, correo ni teléfono).
- `pg_cron` (job `push-check-cada-30-min`, minutos 7 y 37) llama a `push?action=check`. Por cada suscripción pregunta a
  la web (`/api/alerts/check`, la misma lógica que usa la app al abrirse) y manda un aviso si una alerta empieza a
  cumplirse o baja 1 céntimo más. Como mucho un aviso por alerta y día, y nada de 23:00 a 7:00.
- Las claves del servidor de avisos (VAPID) las genera la propia función la primera vez y las guarda en `ev_private`
  (`k = 'vapid'`). Si se borran, todos los móviles tendrían que volver a activar los avisos.
- Una suscripción se borra al desactivar los avisos en la app o cuando el navegador la da de baja (respuesta 404/410).
- Para ver cómo va: `select created_at, checked_at, last_push_at, last_status, fails from push_subs;`
  (`last_status` 201 = el servicio push del navegador aceptó el aviso).

## Cada cuánto se actualiza

| Dato | Cómo | Cada cuánto |
| --- | --- | --- |
| Estado operativo (funciona / averiado) | incremental (`date_from`) | 10 min |
| Ubicaciones | incremental cada hora + listado completo | 1 h / 24 h |
| Tarifas (precios) | **siempre listado completo** (~470 páginas, ~15 min) | 12 h |
| Libre / cargando | bajo demanda al abrir una ficha (`reve-live`) | 15 min por punto |

Las tarifas no usan el modo incremental porque `/connectors/tariffs?date_from=…` devuelve HTTP 504 casi siempre.
Si una página del listado falla 3 veces seguidas se salta (queda anotado en `ev_sync_state.last_error` hasta la
siguiente pasada) para que un fallo puntual de REVE no deje los precios parados. Tras una pasada sin páginas saltadas
se borran las tarifas que llevan 3 días sin aparecer (REVE ya no las publica).

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
supabase functions deploy push --no-verify-jwt --project-ref qdutgibdyrrwwhpzvwja
```
