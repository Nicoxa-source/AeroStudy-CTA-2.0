// Carga los JSON de datos del simulador (rutas relativas: funciona en GitHub Pages, PWA y Capacitor).
const FILES = {
  db: 'shared-db.json', fleet: 'fleet.json', locations: 'locations.json', routes: 'taxiway-routes.json',
  parking: 'parking-positions.json', visual: 'visual-points.json', weather: 'weather-rules.json',
  phraseology: 'phraseology-rules.json', rules: 'evaluation-rules.json',
};

export async function loadSimulatorData(base = new URL('./data/', import.meta.url)) {
  const entries = await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    const res = await fetch(new URL(f, base));
    if (!res.ok) throw new Error(`No se pudo cargar ${f} (${res.status})`);
    return [k, await res.json()];
  }));
  return Object.fromEntries(entries);
}
