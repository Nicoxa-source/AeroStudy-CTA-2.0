// Extrae las bases existentes (aeronaves, aeródromos, aeropuertos) embebidas en public/index.html
// hacia public/simulator/data/shared-db.json. index.html sigue siendo la única fuente de verdad;
// una prueba verifica que ambos archivos coincidan.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function extractEmbeddedData(html) {
  const marker = 'const EMBEDDED_DATA=';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('No se encontró EMBEDDED_DATA en index.html');
  let j = i + marker.length;
  let depth = 0, inStr = false, esc = false;
  const start = j;
  for (; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return JSON.parse(html.slice(start, j));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = extractEmbeddedData(readFileSync(join(root, 'public/index.html'), 'utf8'));
  writeFileSync(join(root, 'public/simulator/data/shared-db.json'), JSON.stringify(data));
  console.log('shared-db.json:', Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])));
}
