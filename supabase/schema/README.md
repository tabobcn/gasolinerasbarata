# Estado de permisos de la base de datos (copia de referencia)

Leído de la base de datos el 11 de noviembre de 2026. Sirve para poder revisar la seguridad desde el repositorio.

## Tablas

| Tabla | RLS | Políticas | Quién lee con la clave pública |
|---|---|---|---|
| `ev_locations`, `ev_evses`, `ev_tariffs` | activo | una de solo lectura («lectura publica», SELECT para `anon` y `authenticated`) | cualquiera, solo lectura |
| `ev_private` (clave de avisos y token del cron) | activo | ninguna | nadie |
| `ev_sync_state`, `ev_req_log` | activo | ninguna | nadie |
| `push_subs` | activo | ninguna, y permisos de tabla revocados | nadie |

Solo las funciones de Supabase (clave de servicio) leen y escriben las tablas privadas.

## Funciones

| Función | Corre como | La puede llamar la clave pública |
|---|---|---|
| `chargers_near`, `charger_detail`, `chargers_in_boxes`, `ev_points`, `ev_connectors_json` | quien llama | sí |
| `ev_last_sync`, `ev_last_prices` | propietario (solo devuelven una fecha) | sí |
| `ev_take_budget`, `ev_exhaust_budget`, `ev_claim_live`, `ev_apply_status`, `ev_cleanup` | propietario | no |

## Límites

- El rol público (`anon`) tiene un tiempo máximo de 3 segundos por consulta.
- `chargers_near` limita el radio a 30 km y el resultado a 150 ubicaciones (ver `funciones_publicas.sql`).
