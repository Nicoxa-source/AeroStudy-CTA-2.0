// Genera public/sw.js con la lista de archivos a precachear y una versión derivada de su contenido,
// de modo que cada cambio invalide la caché anterior. Ejecutar: npm run build:sw
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(root).map((p) => relative(root, p).split(sep).join('/')).filter((f) => f !== 'sw.js').sort();
const hash = createHash('sha1');
for (const f of files) { hash.update(f); hash.update(readFileSync(join(root, f))); }
const version = hash.digest('hex').slice(0, 10);
const core = files.filter((f) => !f.startsWith('identificacion-assets/'));
const images = files.filter((f) => f.startsWith('identificacion-assets/'));

writeFileSync(join(root, 'sw.js'), `// Generado por scripts/build-sw.mjs — no editar a mano.
const VERSION = 'aerostudy-${version}';
const CORE = ${JSON.stringify(['./', ...core], null, 1)};
const IMAGES = ${JSON.stringify(images)};
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
`);
console.log('sw.js', version, core.length, 'archivos +', images.length, 'imágenes');
