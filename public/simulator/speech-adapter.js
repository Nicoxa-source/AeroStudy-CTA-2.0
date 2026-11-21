// Adaptador de reconocimiento de voz (prompt §20, §23). Aísla el motor de voz del resto del simulador.
//
// Motores soportados (en orden de preferencia):
//   1. Plugin de Capacitor «@capacitor-community/speech-recognition» (APK Android).
//   2. Web Speech API (SpeechRecognition / webkitSpeechRecognition): Chrome, Edge, Safari.
//   3. Ninguno: la interfaz muestra un mensaje claro y no se puede transmitir.
//
// IMPORTANTE: el reconocimiento real depende del dispositivo y NO pudo verificarse en el entorno de
// desarrollo. La lógica de este adaptador se prueba con motores simulados (tests/speech.test.mjs).
//
// Contrato:  adapter.start() -> void;   adapter.stop() -> Promise<{transcript, confidence?, error?}>
//            adapter.cancel() -> void;  adapter.requestPermission() -> Promise<'granted'|'denied'|'unavailable'>

const FINAL_WAIT_MS = 4000;

export function detectEngine(win = globalThis) {
  const cap = win.Capacitor?.Plugins?.SpeechRecognition;
  if (win.Capacitor?.isNativePlatform?.() && cap) return 'capacitor';
  if (win.SpeechRecognition || win.webkitSpeechRecognition) return 'webspeech';
  return 'none';
}

export function createSpeechAdapter(win = globalThis, { lang = 'es-CL' } = {}) {
  const kind = detectEngine(win);
  let session = null;

  const requestPermission = async () => {
    try {
      if (kind === 'capacitor') {
        const p = win.Capacitor.Plugins.SpeechRecognition;
        const avail = await p.available?.();
        if (avail && avail.available === false) return 'unavailable';
        const r = await p.requestPermissions?.();
        return r?.speechRecognition === 'denied' ? 'denied' : 'granted';
      }
      if (kind === 'webspeech') {
        const md = win.navigator?.mediaDevices;
        if (!md?.getUserMedia) return 'granted'; // el permiso se pedirá al iniciar
        const stream = await md.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        return 'granted';
      }
      return 'unavailable';
    } catch (e) {
      return e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'unavailable';
    }
  };

  // ---------- Web Speech API
  function startWeb() {
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    const s = { rec, finals: [], interim: '', confidence: undefined, error: null, ended: false, waiters: [] };
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) { s.finals.push(r[0].transcript); if (typeof r[0].confidence === 'number' && r[0].confidence > 0) s.confidence = r[0].confidence; }
        else interim += r[0].transcript;
      }
      s.interim = interim;
    };
    rec.onerror = (ev) => { s.error = ev.error || 'error'; };
    rec.onend = () => { s.ended = true; s.waiters.splice(0).forEach((f) => f()); };
    rec.start();
    return s;
  }

  async function stopWeb(s) {
    const done = new Promise((res) => { if (s.ended) res(); else s.waiters.push(res); });
    try { s.rec.stop(); } catch { /* ya detenido */ }
    await Promise.race([done, new Promise((r) => setTimeout(r, FINAL_WAIT_MS))]);
    const text = (s.finals.join(' ') || s.interim).trim();
    if (!text) return { transcript: '', error: s.error ?? 'no-speech' };
    return { transcript: text, confidence: s.confidence };
  }

  // ---------- Plugin Capacitor
  async function startCap() {
    const p = win.Capacitor.Plugins.SpeechRecognition;
    const s = { p, latest: '', handle: null, error: null };
    try {
      s.handle = await p.addListener?.('partialResults', (e) => { s.latest = e?.matches?.[0] ?? s.latest; });
      await p.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
    } catch (e) { s.error = e?.message ?? 'start-failed'; }
    return s;
  }

  async function stopCap(s) {
    try { await s.p.stop?.(); } catch { /* ignorar */ }
    try { await s.handle?.remove?.(); } catch { /* ignorar */ }
    const text = (s.latest ?? '').trim();
    if (!text) return { transcript: '', error: s.error ?? 'no-speech' };
    return { transcript: text };
  }

  return {
    kind,
    isAvailable: () => kind !== 'none',
    requestPermission,
    start() {
      if (kind === 'none') throw new Error('unavailable');
      if (session) this.cancel();
      session = kind === 'webspeech' ? startWeb() : startCap();
    },
    async stop() {
      if (!session) return { transcript: '', error: 'not-started' };
      const s = await session; // Capacitor devuelve una promesa
      session = null;
      return kind === 'webspeech' ? stopWeb(s) : stopCap(s);
    },
    cancel() {
      const s = session; session = null;
      Promise.resolve(s).then((x) => {
        if (!x) return;
        try { if (kind === 'webspeech') x.rec.abort(); else x.p.stop?.(); } catch { /* ignorar */ }
      });
    },
  };
}

/** Mensajes en español para el estudiante según el código técnico del motor. */
export function describeSpeechError(code) {
  switch (code) {
    case 'not-allowed': case 'service-not-allowed': return 'El navegador no tiene permiso para usar el micrófono o el reconocimiento de voz. Revisa los permisos del sitio o de la aplicación.';
    case 'audio-capture': return 'No se detectó un micrófono disponible.';
    case 'network': return 'El reconocimiento de voz necesita conexión a internet en este dispositivo y no pudo conectarse.';
    case 'language-not-supported': return 'El idioma español no está disponible en el motor de voz de este dispositivo.';
    case 'no-speech': case 'empty-transcript': return 'No se detectó voz. Mantén presionado, habla con claridad y suelta al terminar.';
    case 'low-confidence': return 'El reconocimiento no tuvo suficiente confianza. Repite la transmisión.';
    case 'too-short': return 'Mantén presionado mientras hablas.';
    default: return 'No se pudo procesar la transmisión. Intenta de nuevo.';
  }
}
