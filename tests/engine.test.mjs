import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSim, perfect, runPerfect, loadData, PHON } from './helpers.mjs';
import { normalizeTranscript } from '../public/simulator/speech-normalizer.js';
import { extractEmbeddedData } from '../scripts/extract-shared-data.mjs';
import { createTimer } from '../public/simulator/timer.js';

const norm = (s) => normalizeTranscript(s).tokens;

/** Busca una semilla cuyo escenario cumpla un predicado y deja la simulación iniciada. */
function startWhere(opts, pred, max = 400) {
  for (let seed = 1; seed <= max; seed++) {
    const sim = newSim();
    sim.start({ ...opts, seed });
    if (pred(sim._debugContext().scenario)) return sim;
  }
  throw new Error('No se halló escenario para el predicado');
}
/** Avanza con respuestas perfectas hasta que el estado actual sea `target`. */
function advanceTo(sim, target) {
  for (let i = 0; i < 30 && sim._debugState() !== target; i++) {
    const r = sim.submit(perfect(sim), { confidence: 0.9 });
    assert.ok(r.outcome === 'correct', `respuesta perfecta rechazada en ${sim._debugState()}`);
  }
  assert.equal(sim._debugState(), target);
}

// ------------------------------------------------------------------ normalización
test('normalizador: números, frecuencias, QNH y fonética', () => {
  assert.deepEqual(norm('Pista diecisiete izquierda'), ['pista', '17', 'izquierda']);
  assert.deepEqual(norm('pista 17L'), ['pista', '17', 'izquierda']);
  assert.deepEqual(norm('QNH mil diecisiete'), ['qnh', '1017']);
  assert.deepEqual(norm('Q N H 1017'), ['qnh', '1017']);
  assert.deepEqual(norm('cu ene hache uno cero uno siete'), ['qnh', '1017']);
  assert.deepEqual(norm('transpondedor cuatro dos cinco uno'), ['transpondedor', '4251']);
  assert.deepEqual(norm('frecuencia 118,1'), ['frecuencia', '118', '1']);
  assert.deepEqual(norm('frecuencia ciento dieciocho coma uno'), ['frecuencia', '118', '1']);
  assert.deepEqual(norm('hora 14:35'), ['hora', '14', '35']);
  assert.deepEqual(norm('hora catorce treinta y cinco'), ['hora', '14', '35']);
  assert.deepEqual(norm('viento ciento setenta grados ocho nudos'), ['viento', '170', 'grados', '8', 'nudos']);
  assert.deepEqual(norm('Stgo Torre'), ['santiago', 'torre']);
  assert.deepEqual(norm('Juliet'), ['juliet']);
  assert.ok(norm('autorizado PARA aterrizar').includes('para'));
  assert.ok(norm('autorizado A despegar').includes('a'));
  assert.deepEqual(norm('punto de espera'), ['punto', 'de', 'espera']);
});

// ------------------------------------------------------------------ flujos completos
test('estudiante ideal completa todos los modos y termina en el límite correcto', () => {
  for (const dependency of ['full', 'local', 'ground']) for (const operation of ['arrival', 'departure']) for (let seed = 1; seed <= 25; seed++) {
    const { last, steps } = runPerfect({ dependency, operation, seed });
    assert.ok(last.completed, `${dependency}/${operation}/${seed} no completó`);
    assert.equal(last.result.status, 'passed');
    const first = steps[0].state; const lastState = steps.at(-1).state;
    const expected = {
      'full/arrival': ['A_L_CONTACT', 'A_G_PARKED'], 'local/arrival': ['A_L_CONTACT', 'A_L_VACATE'],
      'ground/arrival': ['A_G_CONTACT', 'A_G_PARKED'], 'full/departure': ['D_G_CONTACT', 'D_L_TAKEOFF'],
      'local/departure': ['D_L_TAKEOFF', 'D_L_TAKEOFF'], 'ground/departure': ['D_G_CONTACT', 'D_G_TRANSFER'],
    }[`${dependency}/${operation}`];
    assert.deepEqual([first, lastState], expected, `${dependency}/${operation}`);
  }
});

test('la salida termina inmediatamente al autorizar correctamente el despegue', () => {
  const { last } = runPerfect({ dependency: 'full', operation: 'departure', seed: 3 });
  assert.equal(last.result.counts.grave, 0);
  assert.equal(last.view.status, 'finished');
});

// ------------------------------------------------------------------ fórmulas críticas
test('«autorizado A aterrizar» es error grave', () => {
  const sim = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => !s.aircraft.military);
  advanceTo(sim, 'A_L_LAND');
  const r = sim.submit(perfect(sim).replace('para aterrizar', 'a aterrizar'));
  assert.equal(r.outcome, 'grave');
  assert.ok(r.findings.some((f) => f.code === 'autorizacion_aterrizar_incorrecta'));
  assert.equal(r.result.status, 'failed');
});

test('«autorizado PARA despegar» es error grave y la fórmula correcta se acepta', () => {
  const sim = newSim(); sim.start({ dependency: 'local', operation: 'departure', seed: 2 });
  const r = sim.submit(perfect(sim).replace('autorizado a despegar', 'autorizado para despegar'));
  assert.equal(r.outcome, 'grave');
  assert.ok(r.findings.some((f) => f.code === 'autorizacion_despegar_incorrecta'));
});

test('autorización de despegue omitida o prematura es grave', () => {
  const sim = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => !s.aircraft.military);
  const r = sim.submit(perfect(sim) + ' autorizado para aterrizar');
  assert.equal(r.outcome, 'grave');
  assert.ok(r.findings.some((f) => f.code === 'autorizacion_prematura'));
});

// ------------------------------------------------------------------ rutas de salida
const dep = (pred) => startWhere({ dependency: 'ground', operation: 'departure' }, pred);
const toRequest = (sim) => advanceTo(sim, 'D_G_REQUEST');

test('ruta alternativa válida se acepta', () => {
  const data = loadData();
  const sim = dep((s) => data.routes.groups.find((g) => g.members.includes(s.parking)).routes.length > 1);
  toRequest(sim);
  const sc = sim._debugContext().scenario;
  const g = data.routes.groups.find((x) => x.members.includes(sc.parking));
  const t = perfect(sim).replace(g.routes[0].map((x) => PHON[x]).join(' '), g.routes[1].map((x) => PHON[x]).join(' '));
  assert.equal(sim.submit(t).outcome, 'correct');
});

test('rutas erróneas: omitida, adicional, orden, otra plataforma', () => {
  const data = loadData();
  const cases = [];
  const mk = (pred, tweak, code) => cases.push({ pred, tweak, code });
  mk((s) => s.parking === 'ENA', (t) => t.replace('Kilo Tango Alfa', 'Kilo Alfa'), 'ruta_calle_omitida');
  mk((s) => s.parking === 'ENA', (t) => t.replace('Kilo Tango Alfa', 'Kilo Tango Foxtrot Alfa'), 'ruta_calle_adicional');
  mk((s) => s.parking === 'ENA', (t) => t.replace('Kilo Tango Alfa', 'Tango Kilo Alfa'), 'ruta_orden');
  mk((s) => s.parking === 'ENA', (t) => t.replace('Kilo Tango Alfa', 'Kilo Bravo Alfa'), 'ruta_otra_plataforma');
  mk((s) => s.parking === 'ENA', (t) => t.replace('vía Kilo Tango Alfa ', ''), 'ruta_omitida');
  for (const c of cases) {
    const sim = dep(c.pred); toRequest(sim);
    const r = sim.submit(c.tweak(perfect(sim)));
    assert.equal(r.outcome, 'grave', c.code);
    assert.ok(r.findings.some((f) => f.code === c.code), `${c.code}: ${r.findings.map((f) => f.code)}`);
  }
  void data;
});

test('MIL usa exclusivamente Delta, Alfa (y su escenario es militar)', () => {
  const sim = dep((s) => s.parking === 'MIL'); toRequest(sim);
  const sc = sim._debugContext().scenario;
  assert.ok(sc.aircraft.military);
  assert.equal(sc.weather.transponder, 'INSTITUTIONAL');
  assert.equal(sim.submit(perfect(sim)).outcome, 'correct');
  const sim2 = dep((s) => s.parking === 'MIL'); toRequest(sim2);
  assert.equal(sim2.submit(perfect(sim2).replace('Delta Alfa', 'Kilo Tango Alfa')).outcome, 'grave');
});

test('condiciones de salida: viento, QNH, temperatura, hora y transpondedor erróneos son graves', () => {
  const tweaks = [
    [/QNH \d+/, 'QNH 1000', 'qnh_incorrecto'],
    [/temperatura \d+/, 'temperatura 99', 'temperatura_incorrecta'],
    [/hora \d\d:\d\d/, 'hora 25:61', 'hora_incorrecta'],
    [/active transpondedor.*/, 'active transpondedor 1 2 3 4', 'transpondedor_incorrecto'],
  ];
  for (const [re, rep, code] of tweaks) {
    const sim = dep((s) => !s.aircraft.military); toRequest(sim);
    const r = sim.submit(perfect(sim).replace(re, rep));
    assert.ok(r.findings.some((f) => f.code === code), code);
    assert.equal(r.outcome, 'grave');
  }
  const sim = dep((s) => !s.aircraft.military); toRequest(sim);
  assert.ok(sim.submit(perfect(sim).replace(/QNH \d+ /, '')).findings.some((f) => f.code === 'qnh_omitido'));
});

// ------------------------------------------------------------------ llegadas
test('rodaje de llegada: solo se valida la primera calle, no las posteriores', () => {
  const sim = startWhere({ dependency: 'ground', operation: 'arrival' }, () => true);
  advanceTo(sim, 'A_G_REQUEST');
  const street = PHON[sim._debugContext().accepted.initialTaxiway];
  const dest = loadData().locations.locations.find((l) => l.code === sim._debugContext().scenario.destination).taxiName;
  const ok = sim.submit(`recibido ruede a plataforma ${dest} vía ${street} Mike Quebec India Sierra`.replace('recibido', sim._debugContext().scenario.callsign.display + ' recibido'));
  assert.equal(ok.outcome, 'correct');

  const sim2 = startWhere({ dependency: 'ground', operation: 'arrival' }, () => true);
  advanceTo(sim2, 'A_G_REQUEST');
  const c2 = sim2._debugContext();
  const wrong = c2.accepted.initialTaxiway === 'C' ? 'Bravo' : 'Charlie';
  const d2 = loadData().locations.locations.find((l) => l.code === c2.scenario.destination).taxiName;
  const r = sim2.submit(`${c2.scenario.callsign.display} recibido ruede a plataforma ${d2} vía ${wrong} Hotel`);
  assert.ok(r.findings.some((f) => f.code === 'primera_calle_incorrecta'));
});

test('destino de rodaje incorrecto u omitido en llegadas es grave', () => {
  const sim = startWhere({ dependency: 'ground', operation: 'arrival' }, (s) => s.destination !== 'AVI');
  advanceTo(sim, 'A_G_REQUEST');
  const c = sim._debugContext();
  const r = sim.submit(`${c.scenario.callsign.display} recibido ruede a plataforma Aviasur vía ${PHON[c.accepted.initialTaxiway]} Hotel`);
  assert.ok(r.findings.some((f) => f.code === 'destino_incorrecto'));
  const sim2 = startWhere({ dependency: 'ground', operation: 'arrival' }, () => true);
  advanceTo(sim2, 'A_G_REQUEST');
  const c2 = sim2._debugContext();
  const r2 = sim2.submit(`${c2.scenario.callsign.display} recibido ruede vía ${PHON[c2.accepted.initialTaxiway]} Hotel`);
  assert.ok(r2.findings.some((f) => f.code === 'destino_omitido'));
});

test('abandono de pista: D, C, B, A válidos; otra calle y frecuencia errónea graves', () => {
  const sim = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => !s.aircraft.military);
  advanceTo(sim, 'A_L_VACATE');
  const cs = sim._debugContext().scenario.callsign.display;
  const r = sim.submit(`${cs} abandone por vía Kilo abandonando pista contacte Control Terrestre frecuencia 122,2`);
  assert.ok(r.findings.some((f) => f.code === 'abandono_calle_invalida'));
  const sim2 = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => !s.aircraft.military);
  advanceTo(sim2, 'A_L_VACATE');
  const r2 = sim2.submit(`${sim2._debugContext().scenario.callsign.display} abandone por vía Charlie abandonando pista contacte Control Terrestre frecuencia 118,1`);
  assert.ok(r2.findings.some((f) => f.code === 'frecuencia_incorrecta'));
  const sim3 = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => !s.aircraft.military);
  advanceTo(sim3, 'A_L_VACATE');
  const r3 = sim3.submit(`${sim3._debugContext().scenario.callsign.display} abandone por vía Delta abandonando pista contacte Santiago Torre frecuencia 122,2`);
  assert.ok(r3.findings.some((f) => f.code === 'transferencia_dependencia'));
});

// ------------------------------------------------------------------ puntos visuales
test('puntos visuales: ingreso válido, lado erróneo y maniobra errónea', () => {
  const data = loadData();
  for (const p of data.visual.points) {
    const sim = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => s.visualPoint === p.id && !s.aircraft.military);
    advanceTo(sim, 'A_L_ENTRY');
    const sc = sim._debugContext().scenario;
    const w = sc.weather;
    const windT = w.calm ? 'viento calma' : `viento ${w.windDirection} grados ${w.windSpeed} nudos`;
    const base = (man, rep) => `${sc.callsign.display} recibido ingrese a ${man} pista 17 izquierda ${windT} QNH ${w.qnh} notifique ${rep}`;
    for (const e of p.entries) {
      const s2 = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => s.visualPoint === p.id && !s.aircraft.military);
      advanceTo(s2, 'A_L_ENTRY');
      for (const rep of data.visual.validReports[e]) {
        const s3 = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => s.visualPoint === p.id && !s.aircraft.military);
        advanceTo(s3, 'A_L_ENTRY');
        const r = s3.submit(base(data.visual.maneuvers[e].label, data.visual.reportLabels[rep]));
        assert.equal(r.outcome, 'correct', `${p.id}/${e}/${rep}: ${r.findings?.map((f) => f.code)}`);
      }
    }
    // maniobra no permitida en el punto
    const all = Object.keys(data.visual.maneuvers).filter((m) => !p.entries.includes(m));
    for (const m of all) {
      const s4 = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => s.visualPoint === p.id && !s.aircraft.military);
      advanceTo(s4, 'A_L_ENTRY');
      const rep = data.visual.reportLabels[data.visual.validReports[m][0]];
      const r = s4.submit(base(data.visual.maneuvers[m].label, rep));
      assert.equal(r.outcome, 'grave', `${p.id} no debe aceptar ${m}`);
      assert.ok(r.findings.some((f) => ['lado_incorrecto', 'maniobra_incorrecta'].includes(f.code)));
    }
  }
});

test('notificación omitida o incompatible con el ingreso es grave', () => {
  const mk = () => { const s = startWhere({ dependency: 'local', operation: 'arrival' }, (x) => x.visualPoint === 'lampa' && !x.aircraft.military); advanceTo(s, 'A_L_ENTRY'); return s; };
  const s1 = mk();
  assert.ok(s1.submit(perfect(s1).replace(/ notifique.*/, '')).findings.some((f) => f.code === 'notificacion_omitida'));
  const s2 = mk();
  assert.ok(s2.submit(perfect(s2).replace(/notifique.*/, 'notifique final corto')).findings.some((f) => f.code === 'notificacion_incompatible'));
  const s3 = mk();
  assert.ok(s3.submit(perfect(s3).replace(/notifique.*/, 'notifique básico izquierdo')).findings.some((f) => f.code === 'notificacion_incompatible'));
});

test('militares: «tren abajo y asegurado»; tramo solicita «notifique básico»', () => {
  const sim = startWhere({ dependency: 'local', operation: 'arrival' }, (s) => s.aircraft.military && s.visualPoint === 'maipu');
  advanceTo(sim, 'A_L_ENTRY');
  const c = sim._debugContext();
  assert.equal(sim.submit(perfect(sim)).outcome, 'correct');
  sim.submit(perfect(sim)); // correcto
  assert.equal(sim._debugState(), 'A_L_ASK_BASE_GEAR');
  const bad = sim.submit(`${c.scenario.callsign.display} recibido notifique básico`);
  assert.ok(bad.findings.some((f) => f.code === 'instruccion_militar_omitida'));
});

// ------------------------------------------------------------------ identificación y dependencias
test('callsign incorrecto u omitido es grave; se acepta completo, fonético y abreviado', () => {
  const sim = newSim(); sim.start({ dependency: 'ground', operation: 'departure', seed: 5, history: [] });
  const sc = sim._debugContext().scenario;
  if (sc.callsign.kind === 'registration') {
    const spelled = sc.callsign.letters.split('').map((l) => PHON[l] ?? l).join(' ');
    assert.equal(sim.submit(`${spelled} Control Terrestre prosiga`).outcome, 'correct');
  }
  const s2 = newSim(); s2.start({ dependency: 'ground', operation: 'departure', seed: 6 });
  assert.ok(s2.submit('Control Terrestre prosiga').findings.some((f) => f.code === 'callsign_incorrecto'));
});

test('registro civil abreviado con las tres últimas letras', () => {
  const sim = startWhere({ dependency: 'ground', operation: 'departure' }, (s) => s.callsign.kind === 'registration');
  const sc = sim._debugContext().scenario;
  const short = sc.callsign.short.split('').map((l) => PHON[l] ?? l).join(' ');
  assert.equal(sim.submit(`${short} Control Terrestre prosiga`).outcome, 'correct');
});

test('repetición indebida de dependencia: 1.ª leve, 2.ª grave; dependencia equivocada grave', () => {
  const sim = startWhere({ dependency: 'ground', operation: 'departure' }, (s) => !s.aircraft.military);
  const cs = sim._debugContext().scenario.callsign.display;
  assert.equal(sim.submit(`${cs} Control Terrestre prosiga`).outcome, 'correct');
  const r1 = sim.submit(perfect(sim) + ' Control Terrestre');
  assert.equal(r1.outcome, 'minor');
  assert.ok(r1.findings.some((f) => f.code === 'dependencia_repetida' && f.severity === 'minor'));
  const r2 = sim.submit(perfect(sim) + ' Control Terrestre');
  assert.equal(r2.outcome, 'grave');
  const s3 = newSim(); s3.start({ dependency: 'ground', operation: 'departure', seed: 9 });
  const r3 = s3.submit(`${s3._debugContext().scenario.callsign.display} Santiago Torre prosiga`);
  assert.ok(r3.findings.some((f) => f.code === 'dependencia_incorrecta'));
});

test('errores leves se registran y el ejercicio continúa', () => {
  const sim = newSim(); sim.start({ dependency: 'ground', operation: 'departure', seed: 4 });
  const cs = sim._debugContext().scenario.callsign.display;
  const r = sim.submit(`${cs} Control Terrestre`); // sin «prosiga»
  assert.equal(r.outcome, 'minor');
  assert.equal(r.view.status, 'running');
  assert.equal(sim._debugState(), 'D_G_REQUEST');
});

test('confirmación «correcto» omitida es grave', () => {
  const sim = newSim(); sim.start({ dependency: 'ground', operation: 'departure', seed: 7 });
  advanceTo(sim, 'D_G_CONFIRM');
  const r = sim.submit(`${sim._debugContext().scenario.callsign.display} recibido`);
  assert.ok(r.findings.some((f) => f.code === 'confirmacion_omitida'));
});

// ------------------------------------------------------------------ temporizador y fallas técnicas
test('temporizador: 60 s, pausa durante procesamiento, sin valores negativos', () => {
  let t = 0; const timer = createTimer({ now: () => t, limitMs: 60000 });
  timer.start(); t = 30000; assert.equal(timer.remainingMs(), 30000);
  timer.pause(); t = 90000; assert.equal(timer.remainingMs(), 30000); // procesamiento no descuenta
  timer.resume(); t = 130000; assert.equal(timer.remainingMs(), 0); assert.ok(timer.expired());
});

test('tiempo agotado finaliza el ejercicio con error grave', () => {
  let t = 1000; const sim = newSim({ now: () => t });
  sim.start({ dependency: 'ground', operation: 'departure', seed: 1 });
  t += 59000; assert.equal(sim.tick(), null);
  t += 1500; const r = sim.tick();
  assert.equal(r.outcome, 'grave'); assert.ok(r.timeout);
  assert.equal(r.result.status, 'failed'); assert.equal(r.result.reason, 'tiempo_agotado');
  assert.equal(sim.submit('hola').outcome, 'ignored');
});

test('el reloj se reinicia en cada nueva respuesta', () => {
  let t = 0; const sim = newSim({ now: () => t });
  sim.start({ dependency: 'ground', operation: 'departure', seed: 1 });
  t += 50000; sim.submit(perfect(sim));
  t += 50000; assert.equal(sim.tick(), null);
  assert.ok(sim.getView().turn.remainingMs > 9000);
});

test('falla técnica: permite repetir sin penalizar tiempo ni contar intervención', () => {
  let t = 0; const sim = newSim({ now: () => t });
  sim.start({ dependency: 'ground', operation: 'departure', seed: 1 });
  t += 10000;
  sim.beginAttempt(); t += 20000; sim.endAttempt(); t += 15000; // 15 s de procesamiento
  const r = sim.submit('', { error: 'no-speech' });
  assert.equal(r.outcome, 'technical');
  assert.equal(sim.getView().atcoMessages.length, 0);
  assert.equal(sim.getView().turn.number, 1);
  assert.equal(Math.round(sim.getView().turn.remainingMs / 1000), 50); // solo los 10 s previos al intento
  const r2 = sim.submit('transmisión borrosa', { confidence: 0.05 });
  assert.equal(r2.outcome, 'technical');
});

test('transcripción incorrecta pero clara NO es falla técnica', () => {
  const sim = newSim(); sim.start({ dependency: 'ground', operation: 'departure', seed: 1 });
  const r = sim.submit('hola buenas tardes', { confidence: 0.9 });
  assert.equal(r.outcome, 'grave');
});

test('turno obsoleto o envío doble se ignora', () => {
  const sim = newSim(); sim.start({ dependency: 'ground', operation: 'departure', seed: 1 });
  const turn = sim.getView().turn.id;
  assert.equal(sim.submit(perfect(sim), {}, turn).outcome, 'correct');
  assert.equal(sim.submit(perfect(sim), {}, turn).outcome, 'ignored');
});

test('abandonar guarda estado «abandoned» sin marcarlo como error', () => {
  const sim = newSim(); sim.start({ dependency: 'full', operation: 'arrival', seed: 1 });
  assert.equal(sim.abort().status, 'abandoned');
});

// ------------------------------------------------------------------ generación
test('condiciones simuladas: rangos, coherencia y constancia durante el ejercicio', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const sim = newSim(); sim.start({ dependency: 'full', operation: 'random', seed });
    const w = sim._debugContext().scenario.weather;
    assert.ok(w.qnh >= 1005 && w.qnh <= 1025);
    assert.ok(w.temperature >= 5 && w.temperature <= 35);
    assert.match(w.utc, /^([01]\d|2[0-3]):[0-5]\d$/);
    if (w.calm) assert.equal(w.windSpeed, 0); else {
      assert.ok(w.windDirection >= 120 && w.windDirection <= 220 && w.windDirection % 10 === 0);
      assert.ok(w.windSpeed >= 1 && w.windSpeed <= 15);
    }
    if (w.transponder && w.transponder !== 'INSTITUTIONAL') {
      assert.match(w.transponder, /^[0-7]{4}$/);
      assert.ok(!['7500', '7600', '7700', '7000', '1200', '0000'].includes(w.transponder));
    }
    assert.throws(() => { 'use strict'; w.qnh = 1; }, TypeError);
  }
  const sim = newSim(); sim.start({ dependency: 'full', operation: 'departure', seed: 11 });
  const before = JSON.stringify(sim.getView().weather);
  sim.submit(perfect(sim));
  assert.equal(JSON.stringify(sim.getView().weather), before);
});

test('estacionamientos 15 y 42 nunca se generan; civiles no usan MIL; militares sí', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 600; seed++) {
    const sim = newSim(); sim.start({ dependency: 'ground', operation: 'departure', seed });
    const s = sim._debugContext().scenario;
    seen.add(s.parking);
    assert.equal(s.parking === 'MIL', s.aircraft.military);
  }
  assert.ok(!seen.has('15') && !seen.has('42'));
  assert.ok(seen.has('AVI') && seen.has('41') && seen.has('36B'));
});

test('no se repite consecutivamente el mismo escenario ni la misma aeronave', () => {
  const sim = newSim(); let history = []; let prev = null;
  for (let i = 0; i < 80; i++) {
    sim.start({ dependency: 'full', operation: 'random', seed: 1000 + i, history });
    const sc = sim._debugContext().scenario;
    if (prev) { assert.notEqual(sc.signature, prev.signature); assert.notEqual(sc.aircraft.code, prev.aircraft.code); }
    history = [...history, sim.historyEntry()].slice(-10); prev = sc;
  }
});

test('mismo seed produce el mismo escenario', () => {
  const a = newSim(); a.start({ seed: 77 }); const b = newSim(); b.start({ seed: 77 });
  assert.equal(a._debugContext().scenario.signature, b._debugContext().scenario.signature);
});

// ------------------------------------------------------------------ integridad de datos
test('datos: shared-db.json coincide con index.html y referencias existen', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const emb = extractEmbeddedData(html);
  const d = loadData();
  assert.deepEqual(d.db, emb);
  const acs = new Set(d.db.aircraft.map((a) => a.code));
  Object.values(d.fleet.categories).forEach((c) => c.codes.forEach((x) => assert.ok(acs.has(x), x)));
  const ads = new Set([...d.db.chile, ...d.db.international].map((a) => a.code));
  const a = d.fleet.aerodromes;
  [...a.tier1, ...a.tier2, ...a.tier3International, ...a.militaryExtra].forEach((x) => assert.ok(ads.has(x), x));
});

test('datos: todo hangar/estacionamiento tiene ruta; códigos CDA y LIT corregidos', () => {
  const d = loadData();
  const members = new Set(d.routes.groups.flatMap((g) => g.members));
  d.locations.locations.forEach((l) => assert.ok(members.has(l.code), l.code));
  const codes = d.locations.locations.map((l) => l.code);
  assert.ok(codes.includes('CDA') && codes.includes('LIT') && !codes.includes('CDL') && !codes.includes('LI'));
  assert.equal(d.routes.groups.find((g) => g.id === 'MIL').routes.length, 1);
});
