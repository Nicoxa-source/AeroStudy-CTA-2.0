# AeroStudy CTA 2.0

Estudio de designadores (módulos originales, sin cambios de diseño) **más un Simulador** de Control Local y Control Terrestre para **SCEL, pista 17L, VFR**. El piloto escribe (texto) y el estudiante, como ATCO, responde por **voz con PTT**. Uso exclusivamente académico: no apto para operaciones reales.

Acceso libre: sin cuentas, sin Netlify Identity, sin servicios de pago. El progreso y los resultados se guardan solo en el dispositivo.

## Estructura
| Ruta | Contenido |
|---|---|
| `public/index.html` | App original (menú y módulos) + botón **Simulador** |
| `public/identificacion.html` | Módulo de identificación de aeronaves (original) |
| `public/simulador.html` + `public/simulator/` | Simulador (UI, motor, evaluador, voz, almacenamiento) |
| `public/simulator/data/*.json` | Datos académicos **editables** (ver abajo) |
| `tests/` | 40 pruebas automáticas (`npm test`) |
| `scripts/` | `build-sw.mjs`, `extract-shared-data.mjs`, `android-setup.sh`, `backup.sh` |
| `legacy/` | Código Netlify/login anterior, archivado y fuera del build |
| `.github/workflows/` | Publicación en GitHub Pages y compilación de APK |

## Probar en local
```bash
npm test                 # pruebas del motor
python3 -m http.server -d public 8080   # o: npm run serve
```
Abrir `http://localhost:8080`. El reconocimiento de voz requiere Chrome/Edge (Android), Safari (iPhone) y HTTPS o `localhost`.

## Publicar gratis (GitHub Pages)
1. Subir el repositorio a GitHub y fusionar la rama `aerostudy-2.0` en `main`.
2. *Settings → Pages → Source: GitHub Actions*. El workflow `pages.yml` ejecuta las pruebas y publica `public/`.
3. Las rutas son relativas, por lo que funciona en `https://usuario.github.io/repositorio/`.

## iPhone (PWA)
Abrir la URL en **Safari → Compartir → Añadir a pantalla de inicio**. Los módulos funcionan sin conexión tras la primera carga.
> ⚠️ No verificado en dispositivo: iOS puede limitar el reconocimiento de voz en apps añadidas a la pantalla de inicio. Si el PTT falla allí, usar Safari directamente. Ver *Limitaciones*.

## Android (APK)
Opción A (sin instalar nada): en GitHub, *Actions → Compilar APK Android → Run workflow*; descargar el artefacto `AeroStudy-CTA-debug-apk`.
Opción B (local, requiere Node 22, JDK 21 y Android SDK): `npm run android:add && npm run android:apk`.
El APK de depuración se instala directamente en el teléfono (permitir «orígenes desconocidos»). Usa el plugin `@capacitor-community/speech-recognition` y el permiso de micrófono.
> ⚠️ El proyecto nativo `android/` **no se generó ni compiló en el entorno de desarrollo** (sin acceso a npm). Los archivos de configuración están listos, pero el primer build debe verificarse.

## Reglas académicas y cómo ajustarlas
Todo está en `public/simulator/data/` y se puede cambiar sin tocar el código:
- `taxiway-routes.json` rutas de salida (y estacionamientos pendientes 15 y 42, **deshabilitados**).
- `visual-points.json` puntos visuales, ingresos y notificaciones válidas.
- `weather-rules.json` rangos de viento, QNH, temperatura y códigos de transpondedor excluidos.
- `phraseology-rules.json` plantillas del piloto, frecuencias (118,1 / 122,2) y frase militar.
- `evaluation-rules.json` severidad de cada error (`minor`/`grave`), mensajes y límites (60 s, reintentos técnicos).
- `fleet.json` aeronaves y aeródromos usados (siempre tomados de las bases existentes).
- `locations.json` hangares y códigos internos (CDA, LIT corregidos; nunca se exigen en fraseología).

Si cambia `index.html` (bases de datos), ejecutar `npm run data` y luego `npm run build:sw`.

## Criterios de evaluación (resumen)
- Evaluación **determinista** (sin IA): misma transcripción, mismo resultado.
- Errores **graves** terminan el ejercicio con explicación y frase esperada; los **leves** se registran y continúa.
- «Autorizado **PARA** aterrizar» y «Autorizado **A** despegar»: invertir la preposición es grave.
- Rutas de salida: orden exacto, se aceptan las alternativas; MIL solo Delta, Alfa.
- Llegadas: del rodaje solo se valida que la **primera calle** coincida con la posición notificada.
- 60 s por intervención; el procesamiento de voz pausa el reloj; una falla técnica comprobable permite repetir sin penalizar.
- Repetir «Santiago Torre/Control Terrestre» donde no corresponde: 1.ª vez leve, 2.ª grave (interpretación configurable).

## Limitaciones conocidas
- **El reconocimiento de voz depende del dispositivo** y no pudo probarse con voz real; solo con motores simulados.
- Android: las voces/idioma `es-CL` dependen de los servicios de Google instalados. Algunos dispositivos requieren conexión.
- Exportar el historial en la APK usa descarga de archivo; si el WebView la bloquea, se copia al portapapeles.
- Pendientes de confirmar con el propietario: ver `PENDIENTES.md`.
