// Motor del simulador: orquesta escenario, estados, temporizador y evaluación (prompt §5, §26–§29).
// No toca el DOM ni el micrófono: recibe transcripciones y devuelve resultados, por lo que es
// totalmente comprobable con pruebas automáticas.

import { createTimer } from './timer.js';
import { createEvaluator, OUTCOME } from './evaluation-engine.js';
import { createScenarioGenerator } from './scenario-generator.js';
import { createPhraseology, windPanel } from './phraseology-rules.js';
import { buildStates, initialPilotMessages, END } from './communication-states.js';

export function createSimulator(data, { now = () => Date.now() } = {}) {
  const phraseology = createPhraseology(data.phraseology);
  const locationsByCode = Object.fromEntries(data.locations.locations.map((l) => [l.code, l]));
  const routeGroups = data.routes.groups;
  const states = buildStates({ phraseology, visual: data.visual, locationsByCode, routeGroups });
  const evaluator = createEvaluator({
    rules: data.rules, phraseology: data.phraseology, visualPoints: data.visual, routeGroups, locations: data.locations.locations,
  });
  const generator = createScenarioGenerator({
    db: data.db, fleet: data.fleet, routes: data.routes, parking: data.parking, locations: data.locations.locations,
    visual: data.visual, weatherRules: data.weather, phraseology: data.phraseology,
  });
  const limits = data.rules.limits;

  let run = null;

  function pushPilot(texts, control) {
    for (const text of texts) run.pilotMessages.push({ n: run.pilotMessages.length + 1, text, control });
  }

  function enterState(id) {
    run.stateId = id;
    run.turnId += 1;
    run.techRetries = 0;
    run.timer.start();
  }

  function start({ dependency = 'full', operation = 'random', seed, history = [] } = {}) {
    const scenario = generator.generate({ dependency, operation, seed, history });
    run = {
      scenario,
      ctx: { scenario, accepted: { initialTaxiway: scenario.operation === 'arrival' && dependency === 'ground' ? scenario.initialTaxiway : null }, misuseCount: 0 },
      timer: createTimer({ now, limitMs: limits.turnSeconds * 1000 }),
      status: 'running',
      startedAt: now(),
      turnId: 0,
      stateId: null,
      techRetries: 0,
      pilotMessages: [],
      atcoMessages: [],
      situation: null,
      interventions: [],
      errors: [],
      result: null,
    };
    pushPilot(initialPilotMessages(scenario, phraseology), states[scenario.startState].control);
    enterState(scenario.startState);
    return getView();
  }

  function weatherPanel() {
    const sc = run.scenario;
    const w = sc.weather;
    const rows = [
      ['Viento', windPanel(w)],
      ['QNH', `${w.qnh} hPa`],
      ['Temperatura', `${w.temperature} °C`],
      ['Hora UTC', w.utc],
    ];
    if (sc.operation === 'departure') rows.push(['Transpondedor', w.transponder === 'INSTITUTIONAL' ? 'INSTITUCIONAL' : w.transponder]);
    return rows;
  }

  function getView() {
    if (!run) return null;
    const sc = run.scenario;
    const st = states[run.stateId];
    return {
      status: run.status,
      scenario: {
        airport: sc.airport, runway: sc.runway, rules: sc.flightRules, operation: sc.operation, dependencyMode: sc.dependencyMode,
        aircraft: sc.aircraft.label, callsign: sc.callsign.display, military: sc.aircraft.military,
      },
      weather: weatherPanel(),
      control: st?.control ?? null,
      turn: { id: run.turnId, number: run.interventions.length + 1, remainingMs: run.timer.remainingMs(), limitMs: run.timer.limitMs, running: run.timer.isRunning() },
      pilotMessages: run.pilotMessages.map((m) => ({ ...m })),
      atcoMessages: run.atcoMessages.map((m) => ({ ...m })),
      situation: run.situation,
      technical: { retries: run.techRetries, retriesLeft: Math.max(0, limits.technicalRetryLimit - run.techRetries) },
      result: run.result,
    };
  }

  /** El estudiante presionó PTT: se fija el punto al que se puede volver si el intento falla por causa técnica. */
  function beginAttempt() {
    if (!run || run.status !== 'running') return false;
    run.timer.resume();
    run.timer.mark();
    return true;
  }

  /** El estudiante soltó PTT: se congela el reloj mientras la voz se procesa (no se descuenta el procesamiento). */
  function endAttempt() {
    if (!run || run.status !== 'running') return false;
    run.timer.pause();
    return true;
  }

  /** PTT demasiado breve (toque accidental): se devuelve el tiempo sin contar reintento ni intervención. */
  function cancelAttempt() {
    if (!run || run.status !== 'running') return false;
    run.timer.restoreMark();
    run.timer.resume();
    return true;
  }

  function finish(status, reason) {
    run.timer.stop();
    run.status = 'finished';
    const iv = run.interventions;
    const correct = iv.filter((i) => i.outcome === OUTCOME.CORRECT).length;
    const minor = iv.filter((i) => i.outcome === OUTCOME.MINOR).length;
    const grave = iv.filter((i) => i.outcome === OUTCOME.GRAVE).length;
    const total = iv.reduce((s, i) => s + i.seconds, 0);
    const sc = run.scenario;
    const hasMinor = run.errors.some((e) => e.severity === 'minor');
    run.result = {
      id: sc.id,
      startedAt: run.startedAt,
      finishedAt: now(),
      status: status === 'completed' ? (hasMinor ? 'passed_obs' : 'passed') : status,
      reason: reason ?? null,
      operation: sc.operation,
      dependencyMode: sc.dependencyMode,
      aircraft: sc.aircraft.label,
      callsign: sc.callsign.display,
      military: sc.aircraft.military,
      scenario: JSON.parse(JSON.stringify(sc)),
      counts: { interventions: iv.length, correct, minor, grave },
      totalSeconds: Math.round(total * 10) / 10,
      averageSeconds: iv.length ? Math.round((total / iv.length) * 10) / 10 : 0,
      interventions: iv,
      errors: run.errors,
    };
    return run.result;
  }

  function record({ state, transcript, evaluation, seconds }) {
    const n = run.interventions.length + 1;
    const iv = { n, control: state.control, phase: state.phase, transcript, outcome: evaluation.outcome, seconds: Math.round(seconds * 10) / 10 };
    run.interventions.push(iv);
    for (const f of evaluation.findings) {
      run.errors.push({
        intervention: n, control: state.control, phase: state.phase, transcript, severity: f.severity, code: f.code,
        element: f.element, explanation: f.explanation, detail: f.detail, expected: state.ideal(run.ctx),
      });
    }
    run.atcoMessages.push({ n, text: transcript, outcome: evaluation.outcome, control: state.control });
    return iv;
  }

  /**
   * Evalúa la transmisión del estudiante.
   * @returns {{outcome:'technical'|'correct'|'minor'|'grave'|'ignored', ...}}
   */
  function submit(transcript, meta = {}, turnId) {
    if (!run || run.status !== 'running') return { outcome: 'ignored', reason: 'no-active-exercise' };
    if (turnId !== undefined && turnId !== run.turnId) return { outcome: 'ignored', reason: 'stale-turn' };
    if (run.busy) return { outcome: 'ignored', reason: 'busy' };
    run.busy = true;
    try {
      run.timer.pause();
      if (run.timer.expired()) return timeoutInternal();
      const tech = evaluator.detectTechnicalFailure(transcript, meta);
      if (tech.technical) {
        run.techRetries += 1;
        if (run.techRetries <= limits.technicalRetryLimit) run.timer.restoreMark();
        run.timer.resume();
        return { outcome: 'technical', reason: tech.reason, retriesLeft: Math.max(0, limits.technicalRetryLimit - run.techRetries), view: getView() };
      }
      const state = states[run.stateId];
      const seconds = run.timer.elapsedMs() / 1000;
      const evaluation = evaluator.evaluate(state, transcript, run.ctx);
      if (evaluation.extracted.dependencyMisuse) run.ctx.misuseCount += 1;
      record({ state, transcript, evaluation, seconds });

      if (evaluation.outcome === OUTCOME.GRAVE) {
        const first = evaluation.findings.find((f) => f.severity === 'grave');
        const result = finish('failed', first.code);
        return { outcome: 'grave', findings: evaluation.findings, result, view: getView() };
      }
      state.accept?.(run.ctx, evaluation.extracted);
      const tr = state.transition(run.ctx);
      run.situation = tr.events?.length ? tr.events[tr.events.length - 1] : null;
      if (tr.next === END) {
        pushPilot(tr.pilot, state.control);
        const result = finish('completed');
        return { outcome: evaluation.outcome, findings: evaluation.findings, completed: true, result, view: getView() };
      }
      pushPilot(tr.pilot, states[tr.next].control);
      enterState(tr.next);
      return { outcome: evaluation.outcome, findings: evaluation.findings, completed: false, view: getView() };
    } finally {
      run.busy = false;
    }
  }

  function timeoutInternal() {
    const state = states[run.stateId];
    const def = data.rules.errors.tiempo_agotado;
    const n = run.interventions.length + 1;
    run.interventions.push({ n, control: state.control, phase: state.phase, transcript: '', outcome: OUTCOME.GRAVE, seconds: run.timer.limitMs / 1000 });
    run.errors.push({
      intervention: n, control: state.control, phase: state.phase, transcript: '', severity: def.severity, code: 'tiempo_agotado',
      element: def.element, explanation: def.explain, detail: '', expected: state.ideal(run.ctx),
    });
    const result = finish('failed', 'tiempo_agotado');
    return { outcome: 'grave', timeout: true, findings: [{ code: 'tiempo_agotado', severity: 'grave' }], result, view: getView() };
  }

  /** Llamar periódicamente desde la interfaz. Devuelve el resultado si el tiempo se agotó. */
  function tick() {
    if (!run || run.status !== 'running' || run.busy) return null;
    if (run.timer.isRunning() && run.timer.expired()) return timeoutInternal();
    return null;
  }

  function abort() {
    if (!run || run.status !== 'running') return run?.result ?? null;
    return finish('abandoned', 'abandonado');
  }

  return {
    start, getView, beginAttempt, endAttempt, cancelAttempt, submit, tick, abort,
    getResult: () => run?.result ?? null,
    historyEntry: (sc) => generator.historyEntry(sc ?? run.scenario),
    _states: states,
    _debugState: () => run?.stateId,
    _debugContext: () => run?.ctx, // SOLO pruebas: expone la respuesta esperada; la interfaz no debe usarlo
  };
}
