// Capa de normalización de transcripciones (prompt §24), independiente del evaluador.
//
// Objetivos:
//  - minúsculas, sin tildes, sin puntuación, espacios simples;
//  - números hablados -> dígitos (diecisiete -> 17, mil diecisiete -> 1017, cuatro dos cinco uno -> 4251);
//  - frecuencias 118,1 / 118.1 / «ciento dieciocho coma uno»;
//  - QNH / «Q N H» / «cu ene hache»; Stgo -> santiago; Juliet -> juliett, etc.
//
// Reglas que NO se rompen:
//  - Las preposiciones «a» y «para» se conservan (críticas en «autorizado PARA aterrizar» /
//    «autorizado A despegar»). Nada aquí elimina palabras de enlace.
//  - No hay coincidencia aproximada de números: un dígito distinto sigue siendo distinto.

import { WORD_TO_LETTER } from './phonetic.js';

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const UNITS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const TEENS = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isNumberWord = (t) => has(UNITS, t) || has(TEENS, t) || has(TENS, t) || has(HUNDREDS, t) || t === 'mil';

function parseNumberAt(tokens, i) {
  let j = i;
  let total = 0;
  let consumed = false;
  if (tokens[j] === 'mil') { total += 1000; j++; consumed = true; }
  else if (has(UNITS, tokens[j]) && UNITS[tokens[j]] > 0 && tokens[j + 1] === 'mil') {
    total += UNITS[tokens[j]] * 1000; j += 2; consumed = true;
  }
  if (has(HUNDREDS, tokens[j])) { total += HUNDREDS[tokens[j]]; j++; consumed = true; }
  const t = tokens[j];
  if (has(TEENS, t)) { total += TEENS[t]; j++; consumed = true; }
  else if (has(TENS, t)) {
    total += TENS[t]; j++; consumed = true;
    if (tokens[j] === 'y' && has(UNITS, tokens[j + 1]) && UNITS[tokens[j + 1]] > 0) { total += UNITS[tokens[j + 1]]; j += 2; }
  } else if (consumed && has(UNITS, t) && UNITS[t] > 0) { total += UNITS[t]; j++; }
  if (!consumed) {
    if (has(UNITS, tokens[i])) return { digit: String(UNITS[tokens[i]]), next: i + 1 };
    return null;
  }
  return { value: String(total), next: j };
}

function convertNumberWords(tokens) {
  const out = [];
  let digitRun = '';
  const flush = () => { if (digitRun) { out.push(digitRun); digitRun = ''; } };
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (isNumberWord(t)) {
      const r = parseNumberAt(tokens, i);
      if (r) {
        if (r.digit !== undefined) digitRun += r.digit;
        else { flush(); out.push(r.value); }
        i = r.next;
        continue;
      }
    }
    flush();
    out.push(t);
    i++;
  }
  flush();
  return out;
}

const isNumeric = (t) => /^\d+$/.test(t);

export function normalizeTranscript(raw) {
  let s = strip(String(raw ?? '').toLowerCase());
  s = s.replace(/\bstgo\b\.?/g, 'santiago');
  s = s.replace(/\bq\.?\s*n\.?\s*h\b\.?/g, 'qnh');
  s = s.replace(/\b(cu|que|ku)\s+ene\s+h?ache\b/g, 'qnh');
  s = s.replace(/\b(quenh|cunh|kunh|kuenh|cuenh)\b/g, 'qnh');
  s = s.replace(/\bfox\s+trot\b/g, 'foxtrot');
  s = s.replace(/\bx[\s-]?ray\b/g, 'xray');
  s = s.replace(/(\d):(\d)/g, '$1 $2');
  s = s.replace(/(\d)[.,](\d)/g, '$1 $2');
  s = s.replace(/\b(\d{1,2})\s*l\b/g, '$1 izquierda');
  s = s.replace(/\b(\d{1,2})\s*r\b/g, '$1 derecha');
  s = s.replace(/\b(\d{1,2})\s*c\b/g, '$1 centro');
  s = s.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  let tokens = s.split(/\s+/).filter(Boolean);
  const SYN = {
    transponder: 'transpondedor', transponedor: 'transpondedor', transpondor: 'transpondedor',
    transpondedores: 'transpondedor', izq: 'izquierda', der: 'derecha', mantenga: 'mantenga',
    notifica: 'notifique', hectopascales: 'hectopascales',
  };
  tokens = tokens.map((t) => SYN[t] ?? t);
  tokens = convertNumberWords(tokens);
  // «coma»/«decimal» y «punto» entre números (frecuencias habladas) se descartan; «punto de espera» no.
  tokens = tokens.filter((t, i) => {
    if (t === 'coma' || t === 'decimal') return !(isNumeric(tokens[i - 1] ?? '') && isNumeric(tokens[i + 1] ?? ''));
    if (t === 'punto') return !(isNumeric(tokens[i - 1] ?? '') && isNumeric(tokens[i + 1] ?? ''));
    return true;
  });
  return { raw: String(raw ?? ''), tokens, text: tokens.join(' ') };
}

/** Une dígitos de tokens numéricos consecutivos a partir de i (tras saltar rellenos mínimos). */
export function readDigits(tokens, i, maxLen, { fillers = ['de', 'es'] } = {}) {
  let j = i;
  while (j < tokens.length && fillers.includes(tokens[j])) j++;
  let digits = '';
  while (j < tokens.length && isNumeric(tokens[j]) && digits.length < maxLen) {
    digits += tokens[j];
    j++;
  }
  return { digits, next: j };
}

export { isNumeric };

/** Letra fonética o letra suelta para un token, si corresponde. */
export function tokenToLetter(t) {
  if (has(WORD_TO_LETTER, t)) return WORD_TO_LETTER[t];
  return null;
}
