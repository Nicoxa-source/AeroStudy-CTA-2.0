import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSimulator } from '../public/simulator/simulator-engine.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../public/simulator/data');
const j = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

export function loadData() {
  return {
    db: j('shared-db.json'), fleet: j('fleet.json'), locations: j('locations.json'), routes: j('taxiway-routes.json'),
    parking: j('parking-positions.json'), visual: j('visual-points.json'), weather: j('weather-rules.json'),
    phraseology: j('phraseology-rules.json'), rules: j('evaluation-rules.json'),
  };
}

export const newSim = (opts) => createSimulator(loadData(), opts);

export const PHON = { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', Q: 'Quebec', S: 'Sierra', T: 'Tango' };

/** Transmisión correcta del estudiante para el estado actual del simulador (solo para pruebas). */
export function perfect(sim) {
  const data = loadData();
  const c = sim._debugContext();
  const sc = c.scenario;
  const w = sc.weather;
  const cs = sc.callsign.display;
  const id = sim._debugState();
  const windT = w.calm ? 'viento calma' : `viento ${w.windDirection} grados ${w.windSpeed} nudos`;
  const route = (r) => r.map((x) => PHON[x]).join(' ');
  const point = data.visual.points.find((p) => p.id === sc.visualPoint);
  const man = point?.entries[0];
  const rep = man ? data.visual.validReports[man][0] : null;
  const repText = { base: 'básico', downwind: 'tramo a favor del viento', short_final: 'final corto', long_final: 'final largo' };
  const manText = man ? data.visual.maneuvers[man].label : '';
  switch (id) {
    case 'A_L_CONTACT': return `${cs} Santiago Torre prosiga`;
    case 'A_L_ENTRY': return `${cs} recibido ingrese a ${manText} pista 17 izquierda ${windT} QNH ${w.qnh} notifique ${repText[rep]}`;
    case 'A_L_ENTRY_CONFIRM': case 'A_G_CONFIRM': case 'D_G_CONFIRM': return `${cs} correcto`;
    case 'A_L_ASK_BASE': return `${cs} recibido notifique básico`;
    case 'A_L_GEAR_BASE': case 'A_L_GEAR_FINAL': return `${cs} recibido tren abajo y asegurado`;
    case 'A_L_ASK_BASE_GEAR': return `${cs} recibido notifique básico tren abajo y asegurado`;
    case 'A_L_LAND': return `${cs} recibido pista 17 izquierda autorizado para aterrizar`;
    case 'A_L_VACATE': return `${cs} abandone por vía ${PHON[sc.initialTaxiway]} abandonando pista contacte Control Terrestre frecuencia 122,2`;
    case 'A_G_CONTACT': case 'D_G_CONTACT': return `${cs} Control Terrestre prosiga`;
    case 'A_G_REQUEST': return `${cs} recibido ruede a plataforma ${data.locations.locations.find((l) => l.code === sc.destination).taxiName} vía ${PHON[c.accepted.initialTaxiway]} Hotel Kilo`;
    case 'A_G_PARKED': return `${cs} recibido`;
    case 'D_G_REQUEST': {
      const g = data.routes.groups.find((x) => x.members.includes(sc.parking));
      const xp = w.transponder === 'INSTITUTIONAL' ? 'active transpondedor institucional' : `active transpondedor ${w.transponder.split('').join(' ')}`;
      return `${cs} recibido ruede a punto de espera pista 17 izquierda vía ${route(g.routes[0])} ${windT} QNH ${w.qnh} temperatura ${w.temperature} grados hora ${w.utc} ${xp}`;
    }
    case 'D_G_TRANSFER': return `${cs} cuando listo contacte Santiago Torre frecuencia 118,1`;
    case 'D_L_TAKEOFF': return `${cs} recibido pista 17 izquierda autorizado a despegar`;
    default: throw new Error(`Estado no soportado en helper: ${id}`);
  }
}

/** Ejecuta el ejercicio completo con el estudiante ideal y devuelve { sim, steps, last }. */
export function runPerfect(opts = {}) {
  const sim = newSim(opts.clock ? { now: opts.clock } : undefined);
  sim.start({ dependency: opts.dependency ?? 'full', operation: opts.operation ?? 'random', seed: opts.seed ?? 1 });
  const steps = [];
  let last;
  for (let i = 0; i < 30; i++) {
    const t = perfect(sim);
    steps.push({ state: sim._debugState(), t });
    last = sim.submit(t, { confidence: 0.9 });
    if (last.completed || last.outcome === 'grave') break;
  }
  return { sim, steps, last };
}
