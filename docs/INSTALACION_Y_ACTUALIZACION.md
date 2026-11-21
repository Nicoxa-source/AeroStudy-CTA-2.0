# AeroStudy CTA 2.0 — Compilar, instalar, distribuir y actualizar

## 1. Publicar la web/PWA (gratis)
1. Crear un repositorio en GitHub y subir este proyecto (rama `main`).
2. *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. Cada `push` a `main` ejecuta `pages.yml` (pruebas + regenera el service worker + publica `public/`).
4. URL resultante: `https://<usuario>.github.io/<repositorio>/`.

## 2. iPhone (PWA)
1. Abrir la URL en **Safari** → Compartir → **Añadir a pantalla de inicio**.
2. Abrir una vez con conexión para que se guarde para uso sin conexión.
3. El micrófono se solicita al primer PTT. **No verificado en iPhone real**; si en modo pantalla de inicio no hay voz, usar Safari normal.

## 3. Android (APK gratuita con GitHub Actions)
1. En GitHub: *Actions → Compilar APK Android → Run workflow* (o crear una etiqueta `v2.0.0`).
2. Al terminar, descargar el artefacto **AeroStudy-CTA-debug-apk** (ZIP con el `.apk`).
3. Copiar el `.apk` al teléfono, permitir «instalar apps desconocidas» e instalar.
4. Aceptar el permiso de micrófono al primer uso.
> El workflow no pudo ejecutarse en el entorno de desarrollo. Si falla el primer build, revisar el log de *Actions* (lo más probable: versión del plugin de voz o ajuste de Gradle).

Compilación local: `bash scripts/android-setup.sh && cd android && ./gradlew assembleDebug` (Node 22, JDK 21, Android SDK).
La APK de depuración sirve para uso académico; para publicar en Play Store haría falta una APK/AAB firmada (fuera del alcance).

## 4. Distribuir
- Web/PWA: compartir la URL.
- Android: compartir el `.apk` (Drive, WhatsApp, correo) o el enlace al artefacto/Release de GitHub.

## 5. Actualizar
1. Editar archivos (`public/…` o los JSON de `public/simulator/data/`).
2. Si cambió `index.html` (bases de datos): `npm run data`.
3. `npm run build:sw` (cambia la versión del service worker; sin esto los usuarios con caché no verían los cambios) y `npm test`.
4. `git push`: Pages se actualiza solo. Los usuarios reciben la versión nueva al reabrir la app (cerrar y abrir 1–2 veces).
5. Android: volver a ejecutar el workflow e instalar el nuevo APK encima (mismo `appId`, se conserva el progreso local).

## 6. Respaldo y retomar
`scripts/backup.sh <nombre>` crea un ZIP en `../backups/`. Estado y pendientes: `PENDIENTES.md`.
