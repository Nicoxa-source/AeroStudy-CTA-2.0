#!/usr/bin/env bash
# Crea el proyecto nativo Android (carpeta android/) y le añade el permiso de micrófono.
# Requiere Node 20+, JDK 21 y Android SDK (o usa el workflow de GitHub Actions, que lo hace solo).
set -euo pipefail
cd "$(dirname "$0")/.."
npm install
node scripts/build-sw.mjs
[ -d android ] || npx cap add android
MANIFEST=android/app/src/main/AndroidManifest.xml
for P in RECORD_AUDIO INTERNET; do
  grep -q "android.permission.$P" "$MANIFEST" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MANIFEST"
done
npx cap sync android
echo "Listo. APK de prueba: cd android && ./gradlew assembleDebug  (salida: android/app/build/outputs/apk/debug/)"
