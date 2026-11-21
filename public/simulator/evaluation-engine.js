// Motor de evaluación determinista (prompt §25, §31). Sin IA: la misma transcripción en el mismo
// estado produce siempre el mismo resultado. La severidad de cada error proviene de
// data/evaluation-rules.json, de modo que el propietario puede ajustarla sin tocar este archivo.

import { normalizeTranscript } from './speech-normalizer.js';
import {
  matchCallsign, extractRoute, findLocation, extractRunway, extractWind, extractQnh, extractTemperature,
  extractTime, extractTransponder, extractFrequency, extractDependencies, extractClearances,
  extractEntries, extractReports,
} from './extractors.js';

export const OUTCOME = Object.freeze({ CORRECT: 'correct', MINOR: 'minor', GRAVE: 'grave' });

const pad2 = (n) => String(n).padStart(2, '0');

function routeDiagnosis(letters, validRoutes, allRoutes, parkingId) {
  if (!letters.length) return 'ruta_omitida';
  const key = (r) => r.join(',');
  // ¿pertenece a otra plataforma?
  const mine = new Set(validRoutes.map(key));
  const otherGroup = allRoutes.some((g) => !g.members.includes(parkingId) && g.routes.some((r) => key(r) === key(letters)));
  if (otherGroup && !mine.has(key(letters))) return 'ruta_otra_plataforma';
  // distancia a la ruta válida más cercana
  let best = null;
  for (const r of validRoutes) {
    const sameSet = [...r].sort().join('') === [...letters].sort().join('');
    if (sameSet) { best = 'ruta_orden'; break; }
    const isSub = (small, big) => { let i = 0; for (const c of big) if (c === small[i]) i++; return i === small.length; };
    if (letters.length < r.length && isSub(letters, r)) best = best ?? 'ruta_calle_omitida';
    if (letters.length > r.length && isSub(r, letters)) best = best ?? 'ruta_calle_adicional';
  }
  return best ?? 'ruta_incorrecta';
}

export function createEvaluator({ rules, phraseology, visualPoints, routeGroups, locations }) {
  const E = rules.errors;
  const limits = rules.limits;

  function evaluate(state, transcript, ctx) {
    const { tokens, text } = normalizeTranscript(transcript);
    const findings = [];
    const extracted = {};
    const sc = ctx.scenario;
    const w = sc.weather;

    const add = (code, detail = '') => {
      const def = E[code];
      if (!def) throw new Error(`Código de error desconocido: ${code}`);
      findings.push({ code, severity: def.severity, element: def.element, explanation: def.explain, detail });
    };
    const has = (code) => findings.some((f) => f.code === code);

    // ---------- comprobaciones reutilizables ----------
    const C = {
      callsign() {
        if (!matchCallsign(tokens, sc.callsign)) add('callsign_incorrecto', `Se esperaba ${sc.callsign.display}.`);
      },
      recibido() { if (!tokens.includes('recibido')) add('recibido_omitido'); },
      recibidoObligatorio() { if (!tokens.includes('recibido')) add('confirmacion_omitida', 'Debe responder «recibido».'); },
      correcto() { if (!tokens.includes('correcto')) add('confirmacion_omitida', 'Debe confirmar la colación con «correcto».'); },
      prosiga() { if (!tokens.includes('prosiga')) add('prosiga_omitido'); },
      dependencyRequired(key) {
        const dep = extractDependencies(tokens);
        const other = key === 'torre' ? 'terrestre' : 'torre';
        if (dep[key]) return;
        if (dep[other] === 'full') add('dependencia_incorrecta', `Correspondía «${phraseology.dependencies[key].spoken}».`);
        else add('dependencia_omitida');
      },
      runway() {
        const r = extractRunway(tokens);
        if (!r.found) { add('pista_omitida'); return; }
        if (r.number !== '17' || r.side !== 'left') { add('pista_incorrecta', `Se esperaba pista 17 izquierda.`); return; }
        if (!r.hasWord) add('pista_palabra_omitida');
      },
      wind() {
        const x = extractWind(tokens);
        if (!x.found) { add('viento_omitido'); return; }
        if (w.calm) { if (!x.calm) add('viento_incorrecto', 'El viento está en calma.'); return; }
        if (x.calm || x.direction !== String(w.windDirection).padStart(3, '0') || x.speed !== w.windSpeed) add('viento_incorrecto');
      },
      qnh() {
        const x = extractQnh(tokens);
        if (!x.found) { add('qnh_omitido'); return; }
        if (x.digits !== String(w.qnh)) add('qnh_incorrecto');
      },
      temperature() {
        const x = extractTemperature(tokens);
        if (!x.found) { add('temperatura_omitida'); return; }
        if (x.digits === '' || Number(x.digits) !== w.temperature) add('temperatura_incorrecta');
      },
      hour() {
        const x = extractTime(tokens);
        if (!x.found) { add('hora_omitida'); return; }
        if (x.value !== w.utc) add('hora_incorrecta');
      },
      transponder() {
        const x = extractTransponder(tokens);
        const military = w.transponder === 'INSTITUTIONAL';
        if (!x.found) { add('transpondedor_omitido'); return; }
        if (military) { if (!x.institutional) add('transpondedor_confusion', 'Debía ser «institucional».'); return; }
        if (x.institutional) { add('transpondedor_confusion', 'Debía ser el código numérico del panel.'); return; }
        if (x.digits !== w.transponder) add('transpondedor_incorrecto');
      },
      ruede() { if (!tokens.includes('ruede')) add('ruede_omitido'); },
      departureTaxi() {
        const okPhrase = tokens.includes('espera') && tokens.includes('punto');
        if (!okPhrase) add('rodaje_omitido', 'Debe instruir «ruede a punto de espera».');
        else C.ruede();
      },
      departureRoute() {
        const r = extractRoute(tokens);
        extracted.route = r.letters;
        if (r.viaMissing) add('via_omitida');
        if (!r.letters.length) { add('ruta_omitida'); return; }
        const group = routeGroups.find((g) => g.members.includes(sc.parking));
        const key = (a) => a.join(',');
        if (group.routes.some((x) => key(x) === key(r.letters))) return;
        const code = routeDiagnosis(r.letters, group.routes, routeGroups, sc.parking);
        add(code, `Dijo: ${r.letters.join(', ')}.`);
      },
      arrivalTaxi() {
        const r = extractRoute(tokens);
        extracted.route = r.letters;
        const hasRuede = tokens.includes('ruede');
        const beforeVia = r.viaIdx >= 0 ? r.viaIdx : tokens.length;
        const dest = findLocation(tokens, locations, { before: beforeVia });
        extracted.destination = dest;
        if (!hasRuede && !tokens.includes('rodaje') && !dest) add('rodaje_omitido', 'Debe instruir el rodaje hacia la plataforma.');
        else if (!hasRuede) add('ruede_omitido');
        if (!dest) add('destino_omitido');
        else if (dest !== sc.destination) add('destino_incorrecto', `Dijo ${locations.find((l) => l.code === dest)?.name ?? dest}.`);
        if (r.viaMissing) add('via_omitida');
        if (!r.letters.length) add('primera_calle_omitida');
        else if (r.letters[0] !== ctx.accepted.initialTaxiway) add('primera_calle_incorrecta', `Primera calle dicha: ${r.letters[0]}.`);
      },
      entry() {
        const entries = extractEntries(tokens);
        if (!entries.length) { add('maniobra_omitida'); return; }
        const distinct = new Set(entries.map((e) => `${e.family}:${e.side}`));
        if (distinct.size > 1) { add('contradiccion', 'Se instruyeron maniobras distintas en la misma transmisión.'); return; }
        const e = entries[0];
        if (e.family !== 'straight' && !e.side) { add('maniobra_incompleta'); return; }
        const id = e.family === 'straight' ? 'straight_in' : `${e.side}_${e.family}`;
        const point = visualPoints.points.find((p) => p.id === sc.visualPoint);
        if (point.entries.includes(id)) { extracted.entry = id; if (!tokens.includes('ingrese')) add('ingrese_omitido'); return; }
        const famOk = point.entries.some((m) => visualPoints.maneuvers[m].family === e.family);
        add(famOk ? 'lado_incorrecto' : 'maniobra_incorrecta', `Instruyó ${visualPoints.maneuvers[id].label}.`);
      },
      notify() {
        const rep = extractReports(tokens);
        if (!rep.requested || !rep.items.length) { add('notificacion_omitida'); return; }
        if (rep.items.length > 1) { add('notificacion_incompleta', 'Se solicitaron varias notificaciones a la vez.'); return; }
        const item = rep.items[0];
        if (item.type === 'final_incomplete') { add('notificacion_incompleta', 'Debe indicar final corto o final largo.'); return; }
        const entryId = extracted.entry;
        if (!entryId) { extracted.report = item.type; return; } // la maniobra ya fue rechazada
        const allowed = visualPoints.validReports[entryId];
        const entrySide = visualPoints.maneuvers[entryId].side;
        if (!allowed.includes(item.type) || (item.side && entrySide && item.side !== entrySide)) {
          add('notificacion_incompatible', `Solicitó notificar ${visualPoints.reportLabels[item.type]}${item.side ? ' ' + (item.side === 'left' ? 'izquierdo' : 'derecho') : ''}.`);
          return;
        }
        extracted.report = item.type;
      },
      askBase() {
        const rep = extractReports(tokens);
        const base = rep.items.find((i) => i.type === 'base');
        if (!base) { add('notifique_basico_omitido'); return; }
        const entrySide = ctx.accepted.entryId ? visualPoints.maneuvers[ctx.accepted.entryId].side : null;
        if (base.side && entrySide && base.side !== entrySide) add('notificacion_incompatible', 'El lado del básico no coincide con el circuito autorizado.');
      },
      gear() {
        const g = phraseology.military.gearInstruction;
        if (text.includes(g)) return;
        if (text.includes('tren abajo') || text.includes('asegurado')) add('instruccion_militar_parcial');
        else add('instruccion_militar_omitida');
      },
      landing() {
        const cl = extractClearances(tokens, ['aterrizar']);
        const bad = extractClearances(tokens, ['despegar']);
        if (cl.length === 0) { add('autorizacion_aterrizar_omitida'); return; }
        const okCount = cl.filter((c) => c.prep === 'para').length;
        if (okCount === 0 || cl.some((c) => c.prep !== 'para')) add('autorizacion_aterrizar_incorrecta', `Dijo «autorizado ${cl[0].prep ?? '(sin preposición)'} aterrizar».`);
        if (bad.length) add('autorizacion_prematura', 'Se autorizó también el despegue.');
      },
      takeoff() {
        const cl = extractClearances(tokens, ['despegar']);
        const bad = extractClearances(tokens, ['aterrizar']);
        if (cl.length === 0) { add('autorizacion_despegar_omitida'); return; }
        const okCount = cl.filter((c) => c.prep === 'a').length;
        if (okCount === 0 || cl.some((c) => c.prep !== 'a')) add('autorizacion_despegar_incorrecta', `Dijo «autorizado ${cl[0].prep ?? '(sin preposición)'} despegar».`);
        if (bad.length) add('autorizacion_prematura', 'Se autorizó también el aterrizaje.');
      },
      prematureClearance(allowedVerb) {
        const verbs = ['aterrizar', 'despegar'].filter((v) => v !== allowedVerb);
        if (extractClearances(tokens, verbs).length || (allowedVerb === null && extractClearances(tokens, ['aterrizar', 'despegar']).length)) {
          add('autorizacion_prematura');
        }
      },
      vacate() {
        const r = extractRoute(tokens);
        const hasAbandone = tokens.some((t) => t.startsWith('abandon'));
        if (!hasAbandone && !r.letters.length) { add('abandono_instruccion_omitida'); return; }
        if (!r.letters.length) { add('abandono_calle_omitida'); return; }
        const first = r.letters[0];
        if (!phraseology.taxiwaysForRunwayExit.includes(first)) { add('abandono_calle_invalida', `Dijo ${first}.`); return; }
        extracted.street = first;
        if (!tokens.includes('abandonando')) add('abandonando_omitido');
      },
      transferGround() {
        const dep = extractDependencies(tokens);
        if (!tokens.includes('contacte')) add('transferencia_omitida');
        else if (!dep.terrestre) add('transferencia_dependencia', dep.torre ? 'Contactó Torre en vez de Control Terrestre.' : '');
        C.frequencyCheck('ground');
      },
      transferTower() {
        const dep = extractDependencies(tokens);
        if (!tokens.includes('contacte')) add('transferencia_omitida');
        else if (!dep.torre) add('transferencia_dependencia', dep.terrestre ? 'Contactó Control Terrestre en vez de Santiago Torre.' : '');
        const i = tokens.indexOf('cuando');
        if (!(i >= 0 && tokens[i + 1] === 'listo')) add('cuando_listo_omitido');
        C.frequencyCheck('tower');
      },
      frequencyCheck(which) {
        const x = extractFrequency(tokens);
        if (!x.found) { add('frecuencia_omitida'); return; }
        if (x.digits !== phraseology.frequencies[which].digits) add('frecuencia_incorrecta', `Dijo ${x.digits}.`);
      },
    };

    // ---------- aplicar las comprobaciones de la fase ----------
    for (const spec of state.checks) {
      const [name, ...args] = Array.isArray(spec) ? spec : [spec];
      if (typeof C[name] !== 'function') throw new Error(`Comprobación desconocida: ${name}`);
      C[name](...args);
    }
    // autorización crítica emitida antes de tiempo
    if (!state.checks.includes('landing') && !state.checks.includes('takeoff')) C.prematureClearance(null);

    // repetición indebida de dependencia
    const deps = extractDependencies(tokens);
    const allowed = new Set(state.allowedDependencies ?? []);
    const alreadyWrong = has('dependencia_incorrecta') || has('transferencia_dependencia');
    const misuse = ['torre', 'terrestre'].filter((k) => deps[k] && !allowed.has(k));
    if (misuse.length && !alreadyWrong) {
      const prior = ctx.misuseCount ?? 0;
      add('dependencia_repetida', `Nombró ${misuse.map((k) => phraseology.dependencies[k].spoken).join(' y ')} donde no corresponde.`);
      const f = findings[findings.length - 1];
      f.severity = prior + 1 >= limits.dependencyMisuseGraveAtCount ? 'grave' : 'minor';
      extracted.dependencyMisuse = true;
    }

    const outcome = findings.some((f) => f.severity === 'grave') ? OUTCOME.GRAVE
      : findings.some((f) => f.severity === 'minor') ? OUTCOME.MINOR : OUTCOME.CORRECT;
    return { outcome, findings, extracted, normalized: text };
  }

  /** ¿La transcripción indica una falla técnica y no un error del estudiante? (prompt §26) */
  function detectTechnicalFailure(transcript, meta = {}) {
    if (meta.error) return { technical: true, reason: meta.error };
    const { tokens } = normalizeTranscript(transcript);
    if (!tokens.length) return { technical: true, reason: 'empty-transcript' };
    if (typeof meta.confidence === 'number' && meta.confidence < limits.lowConfidenceThreshold) {
      return { technical: true, reason: 'low-confidence' };
    }
    return { technical: false };
  }

  return { evaluate, detectTechnicalFailure };
}

export { pad2 };
