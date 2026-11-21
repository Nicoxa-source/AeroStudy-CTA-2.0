import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechAdapter, detectEngine, describeSpeechError } from '../public/simulator/speech-adapter.js';
import { createStorage } from '../public/simulator/simulator-storage.js';

class FakeSR {
  static last = null;
  constructor() { FakeSR.last = this; }
  start() { this.started = true; }
  stop() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: FakeSR.text, confidence: 0.8 }], { isFinal: true })] }); this.onend?.(); }, 5); }
  abort() { this.aborted = true; }
}

test('detecta motor: webspeech, capacitor y ninguno', () => {
  assert.equal(detectEngine({}), 'none');
  assert.equal(detectEngine({ webkitSpeechRecognition: FakeSR }), 'webspeech');
  assert.equal(detectEngine({ Capacitor: { isNativePlatform: () => true, Plugins: { SpeechRecognition: {} } }, webkitSpeechRecognition: FakeSR }), 'capacitor');
});

test('Web Speech: PTT presionar/soltar entrega la transcripción final', async () => {
  FakeSR.text = 'Charlie Charlie Alfa Bravo Charlie recibido';
  const a = createSpeechAdapter({ SpeechRecognition: FakeSR });
  a.start();
  assert.equal(FakeSR.last.lang, 'es-CL');
  const r = await a.stop();
  assert.equal(r.transcript, FakeSR.text);
  assert.equal(r.confidence, 0.8);
});

test('Web Speech: sin voz o con error devuelve error técnico', async () => {
  class Silent extends FakeSR { stop() { setTimeout(() => { this.onerror?.({ error: 'no-speech' }); this.onend?.(); }, 5); } }
  const a = createSpeechAdapter({ SpeechRecognition: Silent });
  a.start();
  const r = await a.stop();
  assert.equal(r.transcript, ''); assert.equal(r.error, 'no-speech');
  assert.match(describeSpeechError('not-allowed'), /permiso/);
});

test('permiso de micrófono denegado se informa', async () => {
  const a = createSpeechAdapter({ SpeechRecognition: FakeSR, navigator: { mediaDevices: { getUserMedia: async () => { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; } } } });
  assert.equal(await a.requestPermission(), 'denied');
  assert.equal(await createSpeechAdapter({}).requestPermission(), 'unavailable');
});

test('Capacitor: usa el plugin y devuelve el último parcial', async () => {
  let cb;
  const plugin = { available: async () => ({ available: true }), requestPermissions: async () => ({ speechRecognition: 'granted' }),
    addListener: async (_, f) => { cb = f; return { remove: async () => {} }; }, start: async () => { setTimeout(() => cb({ matches: ['hola torre'] }), 2); }, stop: async () => {} };
  const a = createSpeechAdapter({ Capacitor: { isNativePlatform: () => true, Plugins: { SpeechRecognition: plugin } } });
  assert.equal(a.kind, 'capacitor');
  assert.equal(await a.requestPermission(), 'granted');
  a.start(); await new Promise((r) => setTimeout(r, 20));
  assert.equal((await a.stop()).transcript, 'hola torre');
});

test('almacenamiento: guarda, exporta, importa sin duplicar y funciona sin localStorage', () => {
  const store = {}; const win = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  const s = createStorage(win);
  s.saveResult({ id: 'a', status: 'passed', finishedAt: 2 }); s.saveResult({ id: 'b', status: 'failed', finishedAt: 1 });
  assert.deepEqual(s.summary(), { total: 2, passed: 1, failed: 1 });
  const exp = s.exportJson();
  const s2 = createStorage({ localStorage: { getItem: () => null, setItem: () => {} } });
  assert.equal(s2.importJson(exp), 2); assert.equal(s2.importJson(exp), 0);
  assert.throws(() => s.importJson('{"x":1}'));
  const blocked = createStorage({ get localStorage() { throw new Error('blocked'); } });
  blocked.saveResult({ id: 'z', status: 'passed' });
  assert.equal(blocked.getResults().length, 1);
});

import { readFileSync as _rf } from 'node:fs';
test('service worker y páginas sin referencias obsoletas (aero-login, Netlify Identity)', () => {
  for (const f of ['public/sw.js', 'public/index.html', 'public/simulador.html', 'public/identificacion.html', 'public/manifest.webmanifest']) {
    const t = _rf(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/aero-login|netlify-identity|netlifyIdentity|identity\.netlify/i.test(t), f);
  }
});

test('Android: stop y remove sin resolución no bloquean y se conserva resultado tardío', async () => {
  let cb, removed = false;
  const never = () => new Promise(() => {});
  const plugin = { addListener: async (_, f) => { cb=f; return {remove: () => { removed=true; return never(); }}; }, start: async () => {}, stop: () => { setTimeout(() => cb({matches:['comunicacion completa']}), 5); return never(); } };
  const a = createSpeechAdapter({ Capacitor: {isNativePlatform:()=>true, Plugins:{SpeechRecognition:plugin}} }, {capWaitMs:25,capStartMs:25});
  a.start(); assert.equal((await a.stop()).transcript,'comunicacion completa'); assert.ok(removed);
});

test('Android: start sin resolución devuelve error técnico y permite nuevo intento', async () => {
  let cb, count=0;
  const plugin = { addListener: async (_, f) => { cb=f; return {remove: async()=>{}}; }, start: () => ++count===1 ? new Promise(()=>{}) : Promise.resolve(), stop: () => { if(count===2) cb({matches:['recibido']}); return new Promise(()=>{}); } };
  const a = createSpeechAdapter({ Capacitor: {isNativePlatform:()=>true, Plugins:{SpeechRecognition:plugin}} }, {capWaitMs:15,capStartMs:15});
  a.start(); assert.equal((await a.stop()).error,'speech-timeout'); a.start(); assert.equal((await a.stop()).transcript,'recibido');
});
