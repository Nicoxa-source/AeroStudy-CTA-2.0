// Interfaz del Simulador. El estudiante actúa como ATCO: el piloto escribe (texto) y el ATCO responde por voz (PTT).
import { loadSimulatorData } from './data-loader.js';
import { createSimulator } from './simulator-engine.js';
import { createStorage } from './simulator-storage.js';
import { createSpeechAdapter, describeSpeechError } from './speech-adapter.js';
import { timerBand } from './timer.js';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DEP_LABEL = { local: 'Control Local', ground: 'Control Terrestre', full: 'Operación completa' };
const OP_LABEL = { arrival: 'Llegadas', departure: 'Salidas', random: 'Aleatoria' };
const CTL_LABEL = { local: 'CONTROL LOCAL · SANTIAGO TORRE', ground: 'CONTROL TERRESTRE' };
const STATUS = {
  passed: ['ok', 'Ejercicio completado', 'Completaste la operación sin errores registrados.'],
  passed_obs: ['minor', 'Completado con observaciones', 'Completaste la operación; hubo errores leves que conviene corregir.'],
  failed: ['grave', 'Ejercicio finalizado por error grave', 'Un error crítico terminó el ejercicio. Revisa la explicación y vuelve a intentarlo.'],
  abandoned: ['neutral', 'Ejercicio abandonado', 'Abandonaste el ejercicio antes de terminarlo.'],
};

let data; let sim; let storage; let speech;
let settings = { dependency: 'full', operation: 'random' };
let micPermission = 'unknown';
let pttState = 'idle'; // idle | recording | processing
let pressAt = 0; let turnAtPress = 0;
let notice = '';
let tickId = null; let announced = new Set();

// ---------------------------------------------------------------- arranque
async function boot() {
  try {
    data = await loadSimulatorData();
    sim = createSimulator(data);
    storage = createStorage(window);
    speech = createSpeechAdapter(window);
    settings = { ...settings, ...storage.getSettings() };
    renderSetup();
  } catch (e) {
    app.innerHTML = `<div class="panel"><h2>No se pudo cargar el simulador</h2><p class="note">${esc(e.message)}</p><a class="back" href="index.html">← Volver a AeroStudy</a></div>`;
  }
}

// ---------------------------------------------------------------- configuración
function renderSetup() {
  stopTick();
  const sum = storage.summary();
  const switchHtml = (name, labels, current) => `<div class="switch" data-switch="${name}" style="grid-template-columns:repeat(${Object.keys(labels).length},1fr)">${
    Object.entries(labels).map(([k, v]) => `<button type="button" data-v="${k}" class="${k === current ? 'active' : ''}">${v}</button>`).join('')}</div>`;
  const speechMsg = !speech.isAvailable()
    ? '<div class="sim-warning">Este navegador o dispositivo no ofrece reconocimiento de voz, por lo que no se puede transmitir por PTT. Prueba con Chrome o Edge en Android, Safari en iPhone, o la aplicación Android.</div>' : '';
  app.innerHTML = `
    <a class="back" href="index.html">← Volver a AeroStudy</a>
    <div class="section-header"><div class="eyebrow">SIMULADOR · SCEL · PISTA 17L · VFR</div><h1>Tú eres el controlador.</h1>
      <p>El piloto escribe; tú respondes por voz con la fraseología correcta. Un solo ejercicio a la vez, con 60 segundos por respuesta.</p></div>
    ${speechMsg}
    <div class="panel">
      <label>Dependencia</label>${switchHtml('dependency', DEP_LABEL, settings.dependency)}
      <label>Operación</label>${switchHtml('operation', OP_LABEL, settings.operation)}
      <p class="note" id="modeNote"></p>
      <button class="primary" id="start" ${speech.isAvailable() ? '' : 'disabled'}>Iniciar ejercicio</button>
      <div id="setupNotice"></div>
    </div>
    <div class="stats" style="margin-bottom:0"><div class="stat"><b>${sum.total}</b><small>ejercicios</small></div><div class="stat"><b>${sum.passed}</b><small>completados</small></div><div class="stat"><b>${sum.failed}</b><small>con error grave</small></div></div>
    <div class="row" style="margin-top:12px"><button class="ghost" id="hist">Historial y exportación</button></div>
    <p class="sim-disclaimer">${esc(data.phraseology.disclaimer)} ${storage.persistent ? '' : 'El almacenamiento local no está disponible: los resultados solo duran esta sesión.'}</p>`;
  paintModeNote();
  app.querySelectorAll('[data-switch]').forEach((sw) => sw.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    settings[sw.dataset.switch] = b.dataset.v;
    sw.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    storage.saveSettings(settings); paintModeNote();
  }));
  app.querySelector('#start').addEventListener('click', startExercise);
  app.querySelector('#hist').addEventListener('click', renderHistory);
}

function paintModeNote() {
  const d = settings.dependency; const o = settings.operation;
  const arr = { local: 'Comienza en el primer contacto con Santiago Torre y termina al transferir a Control Terrestre.', ground: 'Comienza en el contacto con Control Terrestre y termina al recibir «estacionado».', full: 'Llegada completa: Local → Terrestre.' };
  const dep = { local: 'Comienza con «listo a salir» y termina al autorizar el despegue.', ground: 'Comienza en el contacto con Control Terrestre y termina al transferir a Santiago Torre.', full: 'Salida completa: Terrestre → Local.' };
  const el = app.querySelector('#modeNote'); if (!el) return;
  el.textContent = o === 'arrival' ? arr[d] : o === 'departure' ? dep[d] : `Llegada o salida al azar. ${d === 'full' ? 'Se completa la operación en ambas dependencias.' : 'Se ejerce solo ' + DEP_LABEL[d] + '.'}`;
}

async function startExercise() {
  const box = app.querySelector('#setupNotice');
  const btn = app.querySelector('#start'); btn.disabled = true;
  micPermission = await speech.requestPermission();
  if (micPermission !== 'granted') {
    btn.disabled = false;
    box.innerHTML = `<div class="notice">${esc(describeSpeechError(micPermission === 'denied' ? 'not-allowed' : 'audio-capture'))}</div>`;
    return;
  }
  announced = new Set(); notice = ''; pttState = 'idle';
  sim.start({ dependency: settings.dependency, operation: settings.operation, history: storage.getScenarioHistory() });
  storage.pushScenario(sim.historyEntry());
  renderExercise();
  startTick();
}

// ---------------------------------------------------------------- ejercicio
function renderExercise() {
  const v = sim.getView();
  const wx = v.weather.map(([k, val]) => `<div><small>${esc(k.toUpperCase())}</small><b>${esc(val)}</b></div>`).join('');
  const pilot = v.pilotMessages.map((m, i) => `<div class="msg pilot"><small>${esc(m.n)} · PILOTO</small>${esc(m.text)}</div>`).join('');
  const atco = v.atcoMessages.length
    ? v.atcoMessages.map((m) => `<div class="msg atco ${m.outcome === 'minor' ? 'minor' : ''}"><small>TU TRANSMISIÓN ${esc(m.n)}</small>${esc(m.text)}${m.outcome === 'minor' ? '<span class="obs">● observación registrada</span>' : ''}</div>`).join('')
    : '<div class="empty">Tus transmisiones aparecerán aquí.</div>';
  app.innerHTML = `
    <div class="chips" style="margin-top:16px">
      <span class="chip">${esc(v.scenario.airport)}</span><span class="chip">PISTA ${esc(v.scenario.runway)}</span><span class="chip">${esc(v.scenario.rules)}</span>
      <span class="chip">${v.scenario.operation === 'arrival' ? 'LLEGADA' : 'SALIDA'}</span>
      <span class="chip ctl" id="ctl">${esc(CTL_LABEL[v.control] ?? '')}</span>
    </div>
    <div class="cards">
      <div class="cardbox"><h3>AERONAVE</h3><b style="font-size:17px">${esc(v.scenario.callsign)}</b> <span style="color:#a3b6cb">· ${esc(v.scenario.aircraft)}</span></div>
      <div class="cardbox"><h3>CONDICIONES</h3><div class="wx">${wx}</div></div>
      <div class="cardbox"><h3>TIEMPO DE RESPUESTA · INTERVENCIÓN ${esc(v.turn.number)}</h3>
        <div class="timerbox"><div class="timer-num" id="tnum" role="timer" aria-live="off">60</div><div class="track"><div id="tbar" style="width:100%"></div></div></div>
        <p class="situation" id="situation">${esc(v.situation ?? '')}</p></div>
      <div class="cardbox"><h3>COMUNICACIÓN DEL PILOTO (TEXTO)</h3><div class="log" id="pilotLog">${pilot}</div></div>
      <div class="cardbox"><h3>TU TRANSMISIÓN (VOZ → TEXTO)</h3><div class="log" id="atcoLog">${atco}</div></div>
    </div>
    <div id="notice" aria-live="polite">${notice ? `<div class="notice">${esc(notice)}</div>` : ''}</div>
    <p class="sr" id="sr" aria-live="polite" style="position:absolute;left:-9999px"></p>
    <div class="ptt-dock">
      <button class="ptt" id="ptt" type="button" aria-label="Mantener presionado para hablar"></button>
      <div class="micstate" id="micstate"></div>
    </div>
    <div class="row" style="margin-top:6px"><button class="ghost" id="abort">Abandonar ejercicio</button></div>`;
  for (const id of ['pilotLog', 'atcoLog']) { const el = app.querySelector('#' + id); el.scrollTop = el.scrollHeight; }
  bindPtt(); paintPtt(); paintTimer();
}

function paintPtt() {
  const b = app.querySelector('#ptt'); const m = app.querySelector('#micstate'); if (!b) return;
  b.className = 'ptt' + (pttState === 'recording' ? ' recording' : pttState === 'processing' ? ' processing' : '');
  b.disabled = pttState === 'processing';
  const label = { idle: ['🎙 Mantén para hablar', 'Suelta al terminar'], recording: ['● Transmitiendo…', 'Suelta para enviar'], processing: ['Procesando voz…', 'El reloj está en pausa'] }[pttState];
  b.innerHTML = `${label[0]}<small>${label[1]}</small>`;
  m.textContent = { idle: 'Micrófono listo', recording: 'Grabando', processing: 'Reconociendo tu transmisión' }[pttState];
}

function paintTimer() {
  const num = app.querySelector('#tnum'); const bar = app.querySelector('#tbar'); if (!num) return;
  const v = sim.getView();
  const rem = v.turn.remainingMs;
  const band = timerBand(rem);
  num.textContent = String(Math.ceil(rem / 1000));
  num.className = 'timer-num ' + (band === 'normal' ? '' : band);
  bar.className = band === 'normal' ? '' : band;
  bar.style.width = `${(rem / v.turn.limitMs) * 100}%`;
  const key = `${v.turn.id}:${band}`;
  if (band !== 'normal' && !announced.has(key)) { announced.add(key); const sr = app.querySelector('#sr'); if (sr) sr.textContent = band === 'critical' ? 'Quedan 10 segundos' : 'Quedan 30 segundos'; }
}

function startTick() {
  stopTick();
  tickId = setInterval(() => {
    const r = sim.tick();
    if (r) { speech.cancel(); pttState = 'idle'; finishFlow(r.result); return; }
    paintTimer();
  }, 200);
}
function stopTick() { if (tickId) { clearInterval(tickId); tickId = null; } }

// ---------------------------------------------------------------- PTT
function bindPtt() {
  const b = app.querySelector('#ptt');
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* ignorar */ } pressStart(); });
  b.addEventListener('pointerup', (e) => { e.preventDefault(); release(); });
  b.addEventListener('pointercancel', release);
  b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); pressStart(); } });
  b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } });
  app.querySelector('#abort').addEventListener('click', () => {
    if (!confirm('¿Abandonar el ejercicio? Quedará registrado como abandonado.')) return;
    speech.cancel(); pttState = 'idle';
    finishFlow(sim.abort());
  });
}

function pressStart() {
  if (pttState !== 'idle' || sim.getView()?.status !== 'running') return;
  turnAtPress = sim.getView().turn.id;
  sim.beginAttempt();
  try {
    speech.start();
    pttState = 'recording'; pressAt = performance.now(); notice = '';
    const n = app.querySelector('#notice'); if (n) n.innerHTML = '';
  } catch {
    sim.cancelAttempt(); notice = describeSpeechError('audio-capture'); const n = app.querySelector('#notice'); if (n) n.innerHTML = `<div class="notice">${esc(notice)}</div>`;
  }
  paintPtt();
}

async function release() {
  if (pttState !== 'recording') return;
  const held = performance.now() - pressAt;
  pttState = 'processing'; sim.endAttempt(); paintPtt();
  const res = await speech.stop();
  if (held < 350) { sim.cancelAttempt(); pttState = 'idle'; notice = describeSpeechError('too-short'); renderExercise(); return; }
  const out = sim.submit(res.transcript, { error: res.error, confidence: res.confidence }, turnAtPress);
  pttState = 'idle';
  if (out.outcome === 'technical') notice = `${describeSpeechError(out.reason)} No se descontó tiempo de esa transmisión.`;
  else notice = '';
  if (out.result) { finishFlow(out.result); return; }
  if (out.outcome === 'ignored' && sim.getView()?.status !== 'running') { finishFlow(sim.getResult()); return; }
  renderExercise();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && pttState === 'recording') { speech.cancel(); sim.cancelAttempt(); pttState = 'idle'; notice = 'La grabación se canceló al salir de la aplicación. Vuelve a transmitir.'; if (sim.getView()?.status === 'running') renderExercise(); }
});

function finishFlow(result) {
  stopTick();
  if (!result) { renderSetup(); return; }
  storage.saveResult(result);
  renderReport(result, 'exercise');
}

// ---------------------------------------------------------------- informe
function fmtDate(ms) { try { return new Date(ms).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } }

function renderReport(r, from) {
  const [cls, title, sub] = STATUS[r.status] ?? STATUS.failed;
  const w = r.scenario.weather;
  const windT = w.calm ? 'Calma' : `${String(w.windDirection).padStart(3, '0')}°/${w.windSpeed} KT`;
  const errs = r.errors.length ? r.errors.map((e) => `
    <div class="err"><h4><span class="badge ${e.severity === 'grave' ? 'grave' : 'minor'}">${e.severity === 'grave' ? 'GRAVE' : 'LEVE'}</span> ${esc(e.element)}</h4>
      <small style="color:#8ba5bd">Intervención ${esc(e.intervention)} · ${esc(e.control === 'local' ? 'Control Local' : 'Control Terrestre')} · ${esc(e.phase)}</small>
      <div class="q">${e.transcript ? '«' + esc(e.transcript) + '»' : '(sin transmisión: se agotó el tiempo)'}</div>
      <div>${esc(e.explanation)} ${e.detail ? '<b>' + esc(e.detail) + '</b>' : ''}</div>
      <div class="exp" style="margin-top:6px"><b>Fraseología esperada:</b> ${esc(e.expected)}</div></div>`).join('')
    : '<p class="note">No se registraron errores.</p>';
  app.innerHTML = `
    <div class="result-banner" style="margin-top:20px">
      <span class="badge ${cls}">${cls === 'ok' ? 'APROBADO' : cls === 'minor' ? 'CON OBSERVACIONES' : cls === 'grave' ? 'NO APROBADO' : 'ABANDONADO'}</span>
      <div class="result-title">${esc(title)}</div><p>${esc(sub)}</p>
      <div class="metrics">
        <div><b>${r.counts.interventions}</b><small>INTERVENCIONES</small></div><div><b>${r.counts.correct}</b><small>CORRECTAS</small></div>
        <div><b>${r.counts.minor}</b><small>CON ERROR LEVE</small></div><div><b>${r.counts.grave}</b><small>CON ERROR GRAVE</small></div>
        <div><b>${r.totalSeconds}s</b><small>TIEMPO TOTAL</small></div><div><b>${r.averageSeconds}s</b><small>PROMEDIO / RESPUESTA</small></div>
      </div>
      <p class="note">${esc(r.callsign)} · ${esc(r.aircraft)} · ${r.operation === 'arrival' ? 'Llegada' : 'Salida'} · ${esc(DEP_LABEL[r.dependencyMode])} · Viento ${esc(windT)} · QNH ${esc(w.qnh)} · ${esc(fmtDate(r.startedAt))}</p>
    </div>
    <h2>Errores y fraseología correcta</h2>
    <div class="stack">${errs}</div>
    <div class="row" style="margin-top:20px">
      ${from === 'exercise' ? '<button class="primary" id="again" style="margin-top:0">Nuevo escenario</button>' : ''}
      <button class="ghost" id="menu">${from === 'history' ? '← Historial' : 'Menú del simulador'}</button>
    </div>`;
  window.scrollTo?.(0, 0);
  app.querySelector('#again')?.addEventListener('click', startExercise);
  app.querySelector('#menu').addEventListener('click', from === 'history' ? renderHistory : renderSetup);
}

// ---------------------------------------------------------------- historial
function renderHistory() {
  const results = storage.getResults();
  const rows = results.length ? results.map((r, i) => {
    const [cls, title] = STATUS[r.status] ?? STATUS.failed;
    return `<div class="hist"><div><b>${esc(r.callsign)}</b> · ${r.operation === 'arrival' ? 'Llegada' : 'Salida'} · ${esc(DEP_LABEL[r.dependencyMode])}<small>${esc(fmtDate(r.startedAt))} · ${r.counts.interventions} interv. · ${r.counts.grave} graves · ${r.counts.minor} leves</small></div>
      <div style="text-align:right"><span class="badge ${cls}">${esc(title)}</span><br><button class="ghost" data-i="${i}" style="margin-top:6px;min-height:36px;padding:6px 10px">Ver</button></div></div>`;
  }).join('') : '<p class="note">Aún no hay ejercicios guardados en este dispositivo.</p>';
  app.innerHTML = `
    <button class="back" id="back">← Volver al simulador</button>
    <div class="section-header"><h1>Historial</h1><p>Se guarda únicamente en este dispositivo. Puedes exportarlo a un archivo para respaldarlo o pasarlo a otro dispositivo.</p></div>
    <div class="panel">${rows}</div>
    <div class="row" style="margin-top:14px">
      <button class="ghost" id="exp">Exportar historial</button><button class="ghost" id="imp">Importar historial</button><button class="ghost" id="clr">Borrar historial</button>
    </div>
    <input type="file" id="file" accept="application/json,.json" hidden><div id="hmsg" class="note"></div>`;
  app.querySelector('#back').addEventListener('click', renderSetup);
  app.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => renderReport(results[Number(b.dataset.i)], 'history')));
  const msg = (t) => { app.querySelector('#hmsg').textContent = t; };
  app.querySelector('#exp').addEventListener('click', async () => {
    const text = storage.exportJson();
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'aerostudy-simulador-historial.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000); msg('Archivo generado.');
    } catch {
      try { await navigator.clipboard.writeText(text); msg('No se pudo descargar; el historial se copió al portapapeles.'); } catch { msg('No se pudo exportar en este dispositivo.'); }
    }
  });
  app.querySelector('#imp').addEventListener('click', () => app.querySelector('#file').click());
  app.querySelector('#file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = storage.importJson(await f.text()); renderHistory(); app.querySelector('#hmsg').textContent = `Se importaron ${n} ejercicios nuevos.`; }
    catch (err) { msg(err.message); }
  });
  app.querySelector('#clr').addEventListener('click', () => { if (confirm('¿Borrar todo el historial del simulador en este dispositivo?')) { storage.clear(); renderHistory(); } });
}

boot();
