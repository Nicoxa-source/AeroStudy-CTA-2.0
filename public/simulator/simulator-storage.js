// Almacenamiento local del Simulador (prompt §30). Sin cuentas ni servidor: todo queda en este dispositivo.
// Si localStorage no está disponible (modo privado, bloqueo), se usa memoria durante la sesión.

const KEY = 'aerostudy_sim_v1';
const MAX_RESULTS = 300;
const MAX_HISTORY = 10;

export function createStorage(win = globalThis) {
  let mem = null;
  const ls = (() => { try { return win.localStorage ?? null; } catch { return null; } })();

  const empty = () => ({ version: 1, results: [], scenarioHistory: [], settings: { dependency: 'full', operation: 'random' } });

  function load() {
    try {
      const raw = ls ? ls.getItem(KEY) : null;
      if (!raw) return mem ?? empty();
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Array.isArray(d.results)) return empty();
      return { ...empty(), ...d };
    } catch { return mem ?? empty(); }
  }

  function save(d) {
    mem = d;
    try { ls?.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
  }

  return {
    persistent: !!ls,
    getSettings: () => load().settings,
    saveSettings(s) { const d = load(); d.settings = { ...d.settings, ...s }; save(d); },
    getResults: () => load().results,
    saveResult(result) {
      const d = load();
      d.results = [result, ...d.results.filter((r) => r.id !== result.id)].slice(0, MAX_RESULTS);
      return save(d);
    },
    getScenarioHistory: () => load().scenarioHistory,
    pushScenario(entry) {
      const d = load();
      d.scenarioHistory = [...d.scenarioHistory, entry].slice(-MAX_HISTORY);
      save(d);
    },
    summary() {
      const r = load().results.filter((x) => x.status !== 'abandoned');
      const passed = r.filter((x) => x.status === 'passed' || x.status === 'passed_obs').length;
      return { total: r.length, passed, failed: r.length - passed };
    },
    clear() { save(empty()); },
    exportJson() { return JSON.stringify({ app: 'AeroStudy CTA Simulador', exportedAt: new Date().toISOString(), data: load() }, null, 2); },
    importJson(text) {
      const parsed = JSON.parse(text);
      const incoming = parsed?.data?.results;
      if (!Array.isArray(incoming)) throw new Error('Archivo no válido: no contiene resultados del simulador.');
      const d = load();
      const known = new Set(d.results.map((r) => r.id));
      const fresh = incoming.filter((r) => r && typeof r.id === 'string' && !known.has(r.id));
      d.results = [...d.results, ...fresh].sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)).slice(0, MAX_RESULTS);
      save(d);
      return fresh.length;
    },
  };
}
