// Extractores deterministas sobre tokens ya normalizados (ver speech-normalizer.js).
// No evalúan: solo leen datos de la transmisión (callsign, ruta, viento, QNH, etc.).

import { WORD_TO_LETTER, SPANISH_LETTER_NAMES } from './phonetic.js';
import { readDigits, isNumeric } from './speech-normalizer.js';

// ---------- callsign ----------
function letterStream(tokens) {
  const out = [];
  for (const t of tokens) {
    const L = WORD_TO_LETTER[t] ?? SPANISH_LETTER_NAMES[t];
    if (L) out.push(L);
    else if (/^[a-z]{1,3}$/.test(t)) for (const c of t) out.push(c.toUpperCase());
    else out.push(null);
  }
  return out;
}

function containsSeq(stream, pattern) {
  if (!pattern.length) return false;
  outer: for (let i = 0; i + pattern.length <= stream.length; i++) {
    for (let k = 0; k < pattern.length; k++) if (stream[i + k] !== pattern[k]) continue outer;
    return true;
  }
  return false;
}

/**
 * callsign: {kind:'registration', letters:'CCABC', short:'ABC'} | {kind:'tactical', word:'halcon', number:'21'}
 */
export function matchCallsign(tokens, callsign) {
  if (!callsign) return false;
  if (callsign.kind === 'tactical') {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] === callsign.word && isNumeric(tokens[i + 1]) && tokens[i + 1] === callsign.number) return true;
    }
    return false;
  }
  const stream = letterStream(tokens);
  return containsSeq(stream, callsign.letters.split('')) || containsSeq(stream, callsign.short.split(''));
}

// ---------- rutas de rodaje ----------
const TAXIWAY_SINGLE = new Set('abcdefghijklmnqst'.split(''));

function tokenToTaxiwayLetter(t) {
  if (WORD_TO_LETTER[t]) return WORD_TO_LETTER[t];
  if (TAXIWAY_SINGLE.has(t)) return t.toUpperCase();
  return null;
}

/** Lee las calles dichas tras «vía». Sin «vía», intenta la mayor serie de nombres fonéticos (marca viaMissing). */
export function extractRoute(tokens) {
  let viaIdx = tokens.indexOf('via');
  if (viaIdx >= 0) {
    const letters = [];
    let j = viaIdx + 1;
    while (j < tokens.length) {
      const L = tokenToTaxiwayLetter(tokens[j]);
      if (!L) break;
      letters.push(L);
      j++;
    }
    return { letters, viaMissing: false, viaIdx, endIdx: j };
  }
  let best = { start: -1, len: 0 };
  for (let i = 0; i < tokens.length; i++) {
    let j = i;
    while (j < tokens.length && WORD_TO_LETTER[tokens[j]]) j++;
    if (j - i > best.len) best = { start: i, len: j - i };
    i = Math.max(i, j);
  }
  if (best.len >= 2) {
    const letters = tokens.slice(best.start, best.start + best.len).map((t) => WORD_TO_LETTER[t]);
    return { letters, viaMissing: true, viaIdx: -1, endIdx: best.start + best.len };
  }
  return { letters: [], viaMissing: false, viaIdx: -1, endIdx: -1 };
}

// ---------- ubicaciones (destino de rodaje en llegadas) ----------
export function findLocation(tokens, locations, { before = tokens.length } = {}) {
  const scope = tokens.slice(0, before);
  let best = null;
  for (const loc of locations) {
    for (const alias of loc.aliases) {
      const a = alias.split(' ');
      for (let i = 0; i + a.length <= scope.length; i++) {
        let ok = true;
        for (let k = 0; k < a.length; k++) if (scope[i + k] !== a[k]) { ok = false; break; }
        if (ok && (!best || a.length > best.len)) best = { code: loc.code, len: a.length };
      }
    }
  }
  return best ? best.code : null;
}

// ---------- pista ----------
export function extractRunway(tokens) {
  const p = tokens.indexOf('pista');
  let idx = -1;
  let hasWord = false;
  if (p >= 0 && isNumeric(tokens[p + 1] ?? '')) { idx = p + 1; hasWord = true; }
  else {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (isNumeric(tokens[i]) && ['izquierda', 'derecha', 'centro'].includes(tokens[i + 1])) { idx = i; break; }
    }
  }
  if (idx < 0) return { found: false };
  const sideTok = tokens[idx + 1];
  const side = sideTok === 'izquierda' ? 'left' : sideTok === 'derecha' ? 'right' : sideTok === 'centro' ? 'center' : null;
  return { found: true, hasWord, number: tokens[idx], side };
}

// ---------- viento ----------
export function extractWind(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'viento') continue;
    if (tokens[i - 1] === 'del' && tokens[i - 2] === 'favor') continue; // «a favor del viento»
    let j = i + 1;
    while (['en', 'de', 'el'].includes(tokens[j])) j++;
    if (tokens[j] === 'calma') return { found: true, calm: true };
    const d = readDigits(tokens, j, 3);
    if (!d.digits) continue;
    let k = d.next;
    while (['grados', 'con', 'de'].includes(tokens[k])) k++;
    const sp = readDigits(tokens, k, 2);
    return { found: true, calm: false, direction: d.digits, speed: sp.digits ? Number(sp.digits) : null };
  }
  return { found: false };
}

// ---------- QNH, temperatura, hora, transpondedor, frecuencia ----------
export function extractQnh(tokens) {
  const i = tokens.indexOf('qnh');
  if (i < 0) return { found: false };
  const d = readDigits(tokens, i + 1, 4);
  return { found: true, digits: d.digits };
}

export function extractTemperature(tokens) {
  const i = tokens.indexOf('temperatura');
  if (i < 0) return { found: false };
  const d = readDigits(tokens, i + 1, 2);
  return { found: true, digits: d.digits };
}

export function extractTime(tokens) {
  const i = tokens.findIndex((t) => t === 'hora' || t === 'horas');
  if (i < 0) return { found: false };
  let j = i + 1;
  while (['utc', 'zulu', 'z', 'de', 'es', 'las'].includes(tokens[j])) j++;
  const groups = [];
  while (j < tokens.length && groups.length < 2) {
    const t = tokens[j];
    if (isNumeric(t)) { groups.push(t); j++; if (t.length >= 3) break; }
    else if (groups.length > 0 && ['horas', 'hora', 'y', 'con', 'minutos'].includes(t)) j++;
    else break;
  }
  let hh = null;
  let mm = null;
  if (groups.length === 1) {
    const s = groups[0];
    if (s.length === 4) { hh = s.slice(0, 2); mm = s.slice(2); }
    else if (s.length === 3) { hh = s.slice(0, 1); mm = s.slice(1); }
  } else if (groups.length === 2) { [hh, mm] = groups; }
  if (hh === null || mm === null || hh.length > 2 || mm.length > 2) return { found: true, value: null };
  return { found: true, value: `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}` };
}

export function extractTransponder(tokens) {
  const i = tokens.indexOf('transpondedor');
  if (i < 0) return { found: false };
  let j = i + 1;
  while (['codigo', 'de', 'el'].includes(tokens[j])) j++;
  if (tokens[j] === 'institucional') return { found: true, institutional: true };
  const d = readDigits(tokens, j, 4);
  return { found: true, institutional: false, digits: d.digits };
}

export function extractFrequency(tokens) {
  const i = tokens.indexOf('frecuencia');
  if (i < 0) return { found: false };
  const d = readDigits(tokens, i + 1, 4);
  return { found: true, digits: d.digits };
}

// ---------- dependencias ----------
export function extractDependencies(tokens) {
  const res = { torre: null, terrestre: null };
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'santiago' && tokens[i + 1] === 'torre') res.torre = 'full';
    else if (tokens[i] === 'torre' && !res.torre) res.torre = 'partial';
    if (tokens[i] === 'control' && tokens[i + 1] === 'terrestre') res.terrestre = 'full';
    else if (tokens[i] === 'terrestre' && !res.terrestre) res.terrestre = 'partial';
  }
  return res;
}

// ---------- autorizaciones ----------
/** Busca «autorizado [a|para] <verbo>» para los verbos indicados. */
export function extractClearances(tokens, verbs) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'autorizado') continue;
    let j = i + 1;
    let prep = null;
    if (tokens[j] === 'a' || tokens[j] === 'para') { prep = tokens[j]; j++; }
    if (verbs.includes(tokens[j])) out.push({ prep, verb: tokens[j] });
  }
  return out;
}

// ---------- ingreso a circuito (Control Local llegadas) ----------
const sideOf = (w) => (!w ? null : /^izquierd/.test(w) ? 'left' : /^derech/.test(w) ? 'right' : null);

export function extractEntries(tokens) {
  const n = tokens.indexOf('notifique');
  const seg = (n >= 0 ? tokens.slice(0, n) : tokens).join(' ');
  const found = [];
  const reDown = /\b(?:tramo )?a favor del viento(?: (izquierd[oa]|derech[oa]))?/g;
  const reBase = /\bbasico(?: (izquierd[oa]|derech[oa]))?/g;
  const reStraight = /\baproximacion directa/g;
  let m;
  while ((m = reDown.exec(seg))) found.push({ family: 'downwind', side: sideOf(m[1]) });
  while ((m = reBase.exec(seg))) found.push({ family: 'base', side: sideOf(m[1]) });
  while ((m = reStraight.exec(seg))) found.push({ family: 'straight', side: null });
  return found;
}

export function extractReports(tokens) {
  const n = tokens.indexOf('notifique');
  if (n < 0) return { requested: false, items: [] };
  const seg = tokens.slice(n + 1).join(' ');
  const items = [];
  const reShort = /\bfinal corto\b/;
  const reLong = /\bfinal largo\b/;
  if (reShort.test(seg)) items.push({ type: 'short_final', side: null });
  if (reLong.test(seg)) items.push({ type: 'long_final', side: null });
  const mDown = /\b(?:tramo|a favor del viento)(?: a favor del viento)?(?: (izquierd[oa]|derech[oa]))?/.exec(seg);
  if (mDown) items.push({ type: 'downwind', side: sideOf(mDown[1]) });
  const mBase = /\bbasico(?: (izquierd[oa]|derech[oa]))?/.exec(seg);
  if (mBase) items.push({ type: 'base', side: sideOf(mBase[1]) });
  if (!items.length && /\bfinal\b/.test(seg)) items.push({ type: 'final_incomplete', side: null });
  return { requested: true, items };
}
