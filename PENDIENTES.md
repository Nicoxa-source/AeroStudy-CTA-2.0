# AeroStudy CTA 2.0 — Registro de avance y pendientes

Rama de trabajo: `aerostudy-2.0` (la rama original queda intacta). Uso exclusivamente académico.

## Hecho
- [x] Auditoría del proyecto original (app y datos embebidos en `netlify/functions/app-template.mjs`).
- [x] Sitio estático: `public/index.html`, `public/identificacion.html` (sin login ni Netlify Identity, rutas relativas, botón «Simulador»). Archivos antiguos en `legacy/`.
- [x] Datos académicos del simulador en `public/simulator/data/*.json` (ubicaciones, rutas de salida, puntos visuales, meteorología, flota, fraseología, reglas de evaluación).
- [x] Módulos: `rng`, `phonetic`, `speech-normalizer`, `extractors`, `evaluation-engine`, `phraseology-rules`, `timer`.

## En curso / por hacer (en este orden)
- [x] `scenario-generator.js` (aeronave, callsign, procedencia, punto visual, estacionamiento, meteorología, historial anti‑repetición).
- [x] `communication-states.js` (máquina de estados de llegadas/salidas, frases ideales).
- [x] `simulator-engine.js` (inicio, intentos, falla técnica, timeout, informe).
- [x] Script `scripts/extract-shared-data.mjs` → `public/simulator/data/shared-db.json` desde `index.html`.
- [x] Pruebas `tests/*.test.mjs` (`node --test`).
- [x] `simulator-storage.js`, `speech-adapter.js`, `simulator-ui.js`, `simulator.css`, `public/simulador.html` (verificado en Chromium con micrófono simulado).
- [x] Service worker generado + `manifest.webmanifest` relativo (carga offline verificada en Chromium).
- [x] Capacitor: `package.json`, `capacitor.config.json`, `scripts/android-setup.sh`, workflows. **Sin verificar: `cap add android` y compilación APK no se pudieron ejecutar (sin red).**
- [x] README. - [x] Informe final. Ver docs/INSTALACION_Y_ACTUALIZACION.md.

## Pendientes de confirmar con el propietario
- «41 y 41»: ¿incluye el 42? (deshabilitado; también el 15).
- Redacción exacta militar «tren abajo y asegurado» / «tres verdes» (supuesto configurable en `phraseology-rules.json`).
- Estacionamientos 13, 28 y 29 no aparecen rotulados en el plano pero el anexo los incluye (se generan).
- Interpretación de «repetición indebida de dependencia»: 1.ª vez leve, 2.ª grave (configurable).
- Reconocimiento de voz en Android/iPhone: requiere prueba en dispositivos reales; no verificable aquí.

## Cómo retomar
Leer este archivo, `git log` en la rama `aerostudy-2.0` y ejecutar `npm test` (41 pruebas).

## Siguientes pasos sugeridos
- [ ] Probar el APK (workflow *Compilar APK Android*) y el PTT en un teléfono real; ajustar plugin/versión si falla.
- [ ] Probar PWA en iPhone real (voz en Safari vs. pantalla de inicio).
- [ ] Responder los pendientes del propietario (42, frase militar, 13/28/29).
- [ ] Ampliar pruebas de la UI (Playwright) si se desea automatizarlas en CI.
