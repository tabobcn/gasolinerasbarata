# Gasolineras Cerca

Web app móvil (PWA) para encontrar la gasolinera más barata cerca, con el diseño de la app "App Gasolineras – Diseño móvil".
Inspirada en cómo está montada [llenatucoche.es](https://llenatucoche.es): Next.js en Vercel, API propia que cachea los datos oficiales del Ministerio, un mapa con marcadores de precio y el cálculo de "mejor opción" que descuenta lo que cuesta el desvío.

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/` | **Cerca**: mejor opción ahora (ahorro neto llenando tu depósito), otras cerca con etiqueta Barato / En la media / Caro, cambio de zona y radio |
| `/mapa` | Mapa con el precio en cada marcador, filtros (combustible, abiertas ahora, radio), "Buscar en esta zona" y ficha rápida |
| `/gasolinera/[id]?m=` | Ficha: todos los precios con la variación desde ayer, gráfico de 14 días, horario, coordenadas GPS y "Cómo llegar" |
| (hoja) | **Ir con Google Maps o Waze**, con la opción de recordar la app elegida |
| `/favoritas` | Casa, Trabajo y otros sitios con la más barata de cada zona, y gasolineras guardadas con el cambio desde ayer |
| `/alertas`, `/alertas/nueva` | Alertas de precio por zona, radio y umbral; aviso si una favorita baja 3 cts |
| `/ruta` | Gasolineras a lo largo de un viaje, ordenadas por ahorro neto contando el desvío, y "Añadir parada" en Google Maps |
| `/mi-coche` | Tipo de coche, combustibles, depósito, parte eléctrica y app de navegación |
| `/carga` | Modo carga (pendiente: fase 2) |

Se pueden compartir enlaces como los de llenatucoche: `/?lat=41.3556&lon=2.0704&fuel=Gasolina95`.

## Cómo está montada

- **Next.js 16** (App Router) + React 19 + TypeScript. CSS propio con los tokens del diseño (Manrope, verde `#0B7A43`…).
- **Datos**: API REST pública del Ministerio (gratuita y sin clave):
  `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/…`
  - `EstacionesTerrestres/FiltroProvincia/{id}`: precios actuales por provincia (se piden solo las provincias que tocan el radio o la ruta).
  - `EstacionesTerrestres/FiltroMunicipio/{id}`: una gasolinera concreta.
  - `EstacionesTerrestresHist/FiltroMunicipio/{dd-mm-aaaa}/{id}`: histórico por día (gráfico de 14 días y "desde ayer").
- **Caché**: en memoria (20 min) + caché de `fetch` de Next (30 min) + cabeceras CDN (`s-maxage`). El Ministerio actualiza cada ~30 min.
- **API propia** (`app/api`):
  - `GET /api/stations?lat&lon&radius`
  - `GET /api/stations/{id}?m={municipio}`
  - `GET /api/stations/{id}/history?m&fuel&days`
  - `GET /api/stations/lookup?items=id:mun,…`
  - `GET /api/places?q=` (buscador de sitios, Photon/OSM)
  - `GET /api/route?from=lat,lon&to=lat,lon&fuel&tank` (OSRM + pasillo de 2,5 km)
- **Mapa**: MapLibre GL + estilo *Positron* de [OpenFreeMap](https://openfreemap.org) (gratis y sin clave). Se puede cambiar con `NEXT_PUBLIC_MAP_STYLE`.
- **Ahorro neto** (`lib/savings.ts`): `(media de las demás − precio) × litros del depósito − distancia ida y vuelta × 7 L/100 km × precio`.
- **Horarios** (`lib/hours.ts`): interpreta "L-V: 07:00-22:00; S: …" y calcula "Abierta hasta…" o "Cerrada · abre a…" en hora peninsular o canaria.
- **Datos del usuario** (favoritas, sitios, alertas, coche) en `localStorage` del móvil. No hace falta crear cuenta.
- **PWA**: manifiesto, iconos y service worker mínimo, así que se puede instalar en la pantalla de inicio.

## Arrancar en local

```bash
npm install
npm run dev        # http://localhost:3000
```

> Si estás detrás de un proxy corporativo, Node necesita `NODE_USE_ENV_PROXY=1` para que `fetch` lo use.

## Publicar en Vercel

1. Sube la carpeta a un repo de GitHub (o usa `npx vercel` desde la carpeta).
2. Importa el repo en Vercel. No hace falta ninguna variable de entorno.
3. `vercel.json` fija las funciones en París (`cdg1`), cerca del servidor del Ministerio.

## Límites conocidos y siguientes pasos

- **Alertas**: se comprueban al abrir la app; con permiso, también salta un aviso del sistema. Para avisar con la app cerrada hace falta un servidor: un cron (Vercel Cron o Supabase) y Web Push o un bot de Telegram.
- **Ruta**: usa el servidor público de demostración de OSRM. Para uso intensivo conviene uno propio u OpenRouteService (clave gratuita).
- **Buscador**: Photon (komoot) es gratuito con uso razonable. Alternativas: Nominatim propio, MapTiler o Google Places.
- **Carga eléctrica** (fase 2): Open Charge Map (clave gratuita) o el punto de acceso nacional de recarga, filtrando por los enchufes y la potencia de "Mi coche".
- **SEO**, como llenatucoche: páginas por provincia (`/gasolineras/barcelona`), sitemap e imagen OG.
- **Android Auto** no es posible desde una web. Haría falta una app nativa.
- Los colores de marca son solo una ayuda visual (iniciales sobre color), no logotipos.

Fuente de los precios: Ministerio (Geoportal de Gasolineras), datos abiertos. Hay que citar la fuente.
