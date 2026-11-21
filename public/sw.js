// Generado por scripts/build-sw.mjs — no editar a mano.
const VERSION = 'aerostudy-2d76f70ecb';
const CORE = [
 "./",
 "icons/apple-touch-icon.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "identificacion.html",
 "index.html",
 "manifest.webmanifest",
 "simulador.html",
 "simulator/communication-states.js",
 "simulator/data-loader.js",
 "simulator/data/evaluation-rules.json",
 "simulator/data/fleet.json",
 "simulator/data/locations.json",
 "simulator/data/parking-positions.json",
 "simulator/data/phraseology-rules.json",
 "simulator/data/shared-db.json",
 "simulator/data/taxiway-routes.json",
 "simulator/data/visual-points.json",
 "simulator/data/weather-rules.json",
 "simulator/evaluation-engine.js",
 "simulator/extractors.js",
 "simulator/phonetic.js",
 "simulator/phraseology-rules.js",
 "simulator/rng.js",
 "simulator/scenario-generator.js",
 "simulator/simulator-engine.js",
 "simulator/simulator-storage.js",
 "simulator/simulator-ui.js",
 "simulator/simulator.css",
 "simulator/speech-adapter.js",
 "simulator/speech-normalizer.js",
 "simulator/timer.js"
];
const IMAGES = ["identificacion-assets/dreamliner_B788.webp","identificacion-assets/dreamliner_B789.webp","identificacion-assets/dreamliner_B78X.webp","identificacion-assets/s01_01.webp","identificacion-assets/s01_02.webp","identificacion-assets/s01_03.webp","identificacion-assets/s02_01.webp","identificacion-assets/s02_02.webp","identificacion-assets/s02_03.webp","identificacion-assets/s03_01.webp","identificacion-assets/s03_02.webp","identificacion-assets/s03_03.webp","identificacion-assets/s03_04.webp","identificacion-assets/s04_01.webp","identificacion-assets/s04_02.webp","identificacion-assets/s04_03.webp","identificacion-assets/s04_04.webp","identificacion-assets/s05_01.webp","identificacion-assets/s05_02.webp","identificacion-assets/s05_03.webp","identificacion-assets/s05_04.webp","identificacion-assets/s06_01.webp","identificacion-assets/s06_02.webp","identificacion-assets/s06_03.webp","identificacion-assets/s07_01.webp","identificacion-assets/s07_02.webp","identificacion-assets/s08_01.webp","identificacion-assets/s08_02.webp","identificacion-assets/s09_01.webp","identificacion-assets/s09_02.webp","identificacion-assets/s09_03.webp","identificacion-assets/s10_01.webp","identificacion-assets/s10_02.webp","identificacion-assets/s10_03.webp","identificacion-assets/s11_01.webp","identificacion-assets/s11_02.webp","identificacion-assets/s11_03.webp","identificacion-assets/s12_01.webp","identificacion-assets/s12_02.webp","identificacion-assets/s12_03.webp","identificacion-assets/s12_04.webp","identificacion-assets/s13_01.webp","identificacion-assets/s13_02.webp","identificacion-assets/s13_03.webp","identificacion-assets/s14_01.webp","identificacion-assets/s14_02.webp","identificacion-assets/s15_01.webp","identificacion-assets/s15_02.webp","identificacion-assets/s15_03.webp","identificacion-assets/s16_01.webp","identificacion-assets/s16_02.webp","identificacion-assets/s17_01.webp","identificacion-assets/s17_02.webp","identificacion-assets/s17_03.webp","identificacion-assets/s17_04.webp","identificacion-assets/s18_01.webp","identificacion-assets/s18_02.webp","identificacion-assets/s19_01.webp","identificacion-assets/s19_02.webp","identificacion-assets/s19_03.webp","identificacion-assets/s20_01.webp","identificacion-assets/s20_02.webp","identificacion-assets/s20_03.webp","identificacion-assets/s20_04.webp","identificacion-assets/s21_01.webp","identificacion-assets/s21_02.webp","identificacion-assets/s21_03.webp","identificacion-assets/s22_01.webp","identificacion-assets/s22_02.webp","identificacion-assets/s22_03.webp","identificacion-assets/s22_04.webp","identificacion-assets/s23_01.webp","identificacion-assets/s23_02.webp","identificacion-assets/s23_03.webp","identificacion-assets/s24_01.webp","identificacion-assets/s24_02.webp","identificacion-assets/s24_03.webp","identificacion-assets/s25_01.webp","identificacion-assets/s25_02.webp","identificacion-assets/s25_03.webp","identificacion-assets/s25_04.webp","identificacion-assets/s26_01.webp","identificacion-assets/s26_02.webp","identificacion-assets/s26_03.webp","identificacion-assets/s27_01.webp","identificacion-assets/s27_02.webp","identificacion-assets/s27_03.webp","identificacion-assets/s27_04.webp","identificacion-assets/s28_01.webp","identificacion-assets/s28_02.webp","identificacion-assets/s28_03.webp","identificacion-assets/s28_04.webp","identificacion-assets/s29_01.webp","identificacion-assets/s29_02.webp","identificacion-assets/s29_03.webp","identificacion-assets/s29_04.webp","identificacion-assets/s30_01.webp","identificacion-assets/s30_02.webp","identificacion-assets/s30_03.webp","identificacion-assets/s30_04.webp","identificacion-assets/s31_01.webp","identificacion-assets/s31_02.webp","identificacion-assets/s31_03.webp","identificacion-assets/s31_04.webp","identificacion-assets/s33_01.webp","identificacion-assets/s33_02.webp","identificacion-assets/s33_03.webp","identificacion-assets/s34_01.webp","identificacion-assets/s34_02.webp","identificacion-assets/s34_03.webp","identificacion-assets/s34_04.webp","identificacion-assets/s35_01.webp","identificacion-assets/s35_02.webp","identificacion-assets/s35_03.webp","identificacion-assets/s35_04.webp","identificacion-assets/s36_01.webp","identificacion-assets/s36_02.webp","identificacion-assets/s36_03.webp","identificacion-assets/s36_04.webp","identificacion-assets/s37_01.webp","identificacion-assets/s37_02.webp","identificacion-assets/s37_03.webp","identificacion-assets/s37_04.webp","identificacion-assets/s38_01.webp","identificacion-assets/s38_02.webp","identificacion-assets/s38_03.webp","identificacion-assets/s39_01.webp","identificacion-assets/s39_02.webp","identificacion-assets/s39_03.webp","identificacion-assets/s40_01.webp","identificacion-assets/s40_02.webp","identificacion-assets/s40_03.webp","identificacion-assets/s40_04.webp","identificacion-assets/s41_01.webp","identificacion-assets/s41_02.webp","identificacion-assets/s41_03.webp","identificacion-assets/s41_04.webp","identificacion-assets/s42_01.webp","identificacion-assets/s42_02.webp","identificacion-assets/s42_03.webp","identificacion-assets/s43_01.webp","identificacion-assets/s43_02.webp","identificacion-assets/s43_03.webp","identificacion-assets/s44_01.webp","identificacion-assets/s44_02.webp","identificacion-assets/s44_03.webp","identificacion-assets/s45_01.webp","identificacion-assets/s45_02.webp","identificacion-assets/s45_03.webp","identificacion-assets/s46_01.webp","identificacion-assets/s46_02.webp","identificacion-assets/s46_03.webp","identificacion-assets/s46_04.webp","identificacion-assets/s47_01.webp","identificacion-assets/s47_02.webp","identificacion-assets/s47_03.webp","identificacion-assets/s48_01.webp","identificacion-assets/s48_02.webp","identificacion-assets/s49_01.webp","identificacion-assets/s49_02.webp","identificacion-assets/s49_03.webp","identificacion-assets/s50_01.webp","identificacion-assets/s50_02.webp","identificacion-assets/s50_03.webp","identificacion-assets/s51_01.webp","identificacion-assets/s51_02.webp","identificacion-assets/s51_03.webp","identificacion-assets/s52_01.webp","identificacion-assets/s52_02.webp"];
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    // Las fotografías se guardan sin bloquear la instalación si alguna falla.
    await Promise.allSettled(IMAGES.map((u) => c.add(u)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(e.request); }
    catch { return (e.request.mode === 'navigate' && (await caches.match('./index.html'))) || Response.error(); }
  })());
});
