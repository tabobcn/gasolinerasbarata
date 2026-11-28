# App Android de Reposta y Carga (Capacitor)

La app es un envoltorio nativo (Capacitor) que abre https://www.repostaycarga.es dentro de la app.
Todo lo que se cambia en la web y se publica con `git push` llega también a la app, sin pasar por Google Play.
Solo hay que subir una versión nueva a Google Play cuando cambia algo de esta carpeta (icono, permisos, avisos, versión…).

## Qué hay aquí
- `capacitor.config.json`: qué web carga la app y ajustes (pantalla sin conexión, barras del sistema).
- `www/offline.html`: lo que se ve si no hay internet al abrir la app.
- `android/`: el proyecto de Android (paquete `es.repostaycarga.app`, iconos, permisos, versión en `android/app/build.gradle`).
- Avisos: Firebase Cloud Messaging (gratis). La web detecta que está dentro de la app (`lib/native.ts`) y usa Firebase en vez de los avisos web.

## Archivos que NO van al repositorio (están en .gitignore)
- `android/app/google-services.json` (configuración de Firebase; copia en `Claude outputs`).
- `android/keystore.properties` y la clave de firma (`.keystore`): la clave de subida está en `Claude outputs/play-store/android/firma`.
- La cuenta de servicio de Firebase NO está en ningún archivo: va como secreto `FCM_SERVICE_ACCOUNT` en Supabase.

## Compilar una versión nueva
1. Subir `versionCode` (y `versionName`) en `android/app/build.gradle`.
2. `npm install` y `npx cap sync android`.
3. Crear `android/keystore.properties` con `storeFile`, `storePassword`, `keyAlias` (repostaycarga) y `keyPassword`.
4. `cd android && ./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`.
5. Subir el .aab en Google Play Console.
