# Revisión de seguridad — Gasolineras Cerca

**Fecha:** 10 de noviembre de 2026 · **Código revisado:** commit `da3895a` · **Método:** skill `security-audit` de Cloudflare

## 1. Cómo se ha hecho y qué alcance tiene

- **Perfil rápido** (`quick`): una pasada de búsqueda y un verificador independiente por hallazgo. Es una **revisión parcial**, no exhaustiva.
- **Agentes usados:** 11 de un máximo de 14 (4 de reconocimiento, 3 de búsqueda, 1 crítico de cobertura, 3 verificadores).
- **Solo código y pruebas locales aisladas.** No se ha enviado tráfico a la web publicada, a Supabase ni a servicios de terceros. Las pruebas se ejecutaron en un entorno sin red, en solo lectura y con límites de CPU, memoria y tiempo.
- **Sin ejecuciones anteriores:** es la primera revisión de este repositorio.
- **Fuera de esta pasada (queda pendiente):** 9 unidades de cobertura aplazadas, listadas en el punto 7.

## 2. Resumen

No se ha encontrado nada grave: ninguna forma de leer datos privados, ejecutar código, robar claves ni alterar los precios. No hay inyección en las rutas ni en el navegador, las claves secretas no están en el repositorio y las funciones de base de datos peligrosas están cerradas al público.

Hay **un hallazgo confirmado de gravedad baja** y **dos pistas sin confirmar**, las tres en la parte nueva de avisos push y cargadores en ruta. Además hay una lista de mejoras de refuerzo.

## 3. Hallazgo confirmado

| Gravedad | Título | Frontera afectada | Resultado observado |
|---|---|---|---|
| Baja | Cualquiera puede llenar el cupo de 5.000 suscripciones de avisos | Visitante anónimo → tabla `push_subs` | Tras 4.999 altas falsas, un usuario nuevo recibe error 503 y las alertas de los existentes se comprueban cada ~6 horas en vez de cada 30 minutos |

### Cupo de suscripciones push rellenable con suscripciones falsas

- **Dónde:** `supabase/functions/push/index.ts` (función `save`, constante `MAX_SUBS`), y la ruta `app/api/push/route.ts` que la reenvía.
- **Quién:** cualquier persona, sin cuenta ni clave.
- **Qué pasa:** la función guarda cualquier suscripción cuya dirección tenga el formato correcto y apunte a un servicio push conocido, sin comprobar que exista de verdad. Todas las filas cuentan contra un único tope de 5.000. Una fila sin alertas nunca recibe un aviso, así que nunca se detecta como falsa y nunca caduca.
- **Prueba local (datos ficticios):** el código de la función, sin modificar, con una base de datos simulada: 4.999 altas falsas devuelven 200; la siguiente alta real devuelve 503; tras 14 comprobaciones no se borra ninguna fila falsa y la alerta del usuario real solo se evalúa en las pasadas 1 y 13. Reproducido por separado por el buscador y por el verificador.
- **Condiciones:** ninguna especial. Unas 5.000 peticiones pequeñas, a cualquier ritmo.
- **Impacto:** disponibilidad de una función opcional. No se filtra ni se altera ningún dato y se arregla borrando filas a mano.
- **Por qué es baja:** probabilidad media (es fácil, pero el atacante no gana nada) e impacto bajo.
- **Arreglo más pequeño:**
  1. Antes de guardar una suscripción nueva, enviarle un aviso y guardarla solo si el servicio push lo acepta.
  2. Borrar las filas que la app no haya refrescado en mucho tiempo (por ejemplo 90 días).
  3. Que la función solo acepte altas que vengan de la web (cabecera secreta) y poner ahí un límite por visitante.

## 4. Pistas sin confirmar (necesitan un dato que no está en el código)

No tienen gravedad asignada: no son vulnerabilidades confirmadas.

| Pista | Dónde | Qué falta saber | Cómo comprobarlo sin riesgo |
|---|---|---|---|
| Al guardar una suscripción push no se comprueba la clave `auth`, así que quien conozca la dirección de avisos de otro usuario puede sustituir sus alertas o dejarle sin avisos | `supabase/functions/push/index.ts`, `save` (líneas 124 y 141) frente a `findOwn` (línea 150) | Si alguien más puede llegar a conocer esa dirección, que es larga y secreta: registros de Supabase, copias de seguridad, etc. En el código no hay ningún camino | Revisar en el panel de Supabase dónde aparecen las direcciones push (registros de funciones y de red). En cualquier caso el arreglo es de una línea: rechazar el guardado si la `auth` no coincide con la guardada |
| Si falla la consulta principal de cargadores en ruta, el plan B lanza entre 140 y 210 consultas más a la misma base de datos por petición | `app/api/route/chargers/route.ts`, `chargersAlong` (líneas 23-47) | Si un visitante puede hacer fallar la consulta principal. En el código no hay forma; depende de tiempos y límites de Supabase | En Supabase: mirar el tiempo límite del rol `anon` y cuánto tarda `chargers_in_boxes` con una ruta de 1.000 km. Como esa función ya existe, el plan B se puede quitar o limitar |

## 5. Zonas que el código no permite comprobar

Tres unidades quedaron **bloqueadas** porque dependen de la configuración real, que no está en el repositorio:

- **Permisos de la base de datos** (políticas RLS de las tablas, permisos de `chargers_near` y `charger_detail`, y si el SQL de `supabase/pending` está aplicado). Nota fuera del skill: el asesor de seguridad de Supabase, consultado en esta misma sesión, solo señala como públicas las dos funciones de fecha (`ev_last_sync`, `ev_last_prices`), que es lo previsto, y confirma RLS activo sin políticas en las tablas privadas.
- **Vulnerabilidades conocidas de las dependencias:** no se puede consultar sin red. Comprobación: ejecutar `npm audit --omit=dev` en la carpeta del proyecto.
- **HTTPS forzado y cabecera HSTS:** dependen de Vercel.

## 6. Mejoras de refuerzo (no son vulnerabilidades)

Las más útiles, por orden:

1. **Estado en directo de cargadores:** `app/api/chargers/[id]/live` acepta hasta 12 identificadores cualesquiera en `?g=` y cada uno gasta del cupo compartido de 300 consultas/hora a REVE. Filtrar los que no sean del mismo sitio, como ya hace la ficha.
2. **Baja de avisos:** al desactivarlos, la app se da de baja en el navegador antes de avisar al servidor y no reintenta si falla; la fila puede quedarse guardada, en contra de lo que dice la página de privacidad. Llamar primero al servidor y caducar filas antiguas.
3. **Clic en un aviso:** `public/sw.js` abre la dirección que venga en el aviso sin comprobar que sea de la propia web. Hoy siempre lo es; conviene comprobarlo.
4. **Sin límite de peticiones** en rutas que hacen mucho trabajo (`/api/alerts/check`, historial, ruta). Proteger `/api/alerts/check` con un secreto, porque solo la llama la función push.
5. **Sin cabecera CSP ni HSTS** en `next.config.ts`.
6. **Validaciones flojas:** `id` y `m` sin longitud máxima en `/api/stations/[id]`; `q` sin máximo en `/api/places`; `/pwa-icon/[size]` genera imagen para cualquier valor y la cachea un año.
7. **Operador del cargador:** un código de operador de REVE igual a un nombre interno de JavaScript (`constructor`) haría fallar el dibujo de cargadores. Usar `Object.hasOwn`.
8. **Función push:** devuelve el texto del error interno; compara el token con `!==`; si falla la lectura de la clave del servidor genera una nueva en vez de dar error.
9. **Dependencias de las funciones de Supabase sin fijar** (`supabase-js@2` flotante, sin fichero de bloqueo).
10. **Mensajes de error** de varias rutas devuelven el texto del fallo interno.

**Lo que está bien:** validación de coordenadas y parámetros en todas las rutas, escapado antes de los dos `innerHTML` del mapa, lista blanca de servidores push, tabla de suscripciones cerrada al público, funciones internas de base de datos revocadas para `anon`, ningún secreto en el repositorio.

## 7. Cobertura

De 29 unidades: **14 cubiertas, 3 con candidato (verificado), 3 bloqueadas, 9 aplazadas**.

Aplazadas para una siguiente pasada:

- Clases «comodín» y «vulnerabilidades encadenadas» (por presupuesto).
- Páginas del servidor (`/gasolinera`, `/cargador`, páginas por ciudad, sitemap) como superficie de consumo de recursos.
- Conservación de datos de suscriptores tras la baja.
- Carga sobre la base de datos llamando directamente a `chargers_in_boxes` y `ev_points` con la clave pública.
- Cuatro huecos señalados por el crítico de cobertura: coste de las comprobaciones de alertas para suscripciones falsas con muchas alertas; errores de lectura que hacen regenerar la clave de avisos o saltarse el tope; un listado vacío de REVE que dispare el borrado de cargadores; y condiciones de carrera en el tope, la pausa de pruebas y el control de avisos repetidos.

El crítico no pidió repetir ninguna unidad ya cerrada.
