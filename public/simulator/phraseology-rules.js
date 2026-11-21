// Renderizado de fraseología a partir de data/phraseology-rules.json.
// Cada texto del piloto y cada frase de referencia del ATCO se construye aquí, de modo que
// ajustar la redacción académica no requiere tocar el motor.

import { phoneticRoute } from './phonetic.js';

export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Falta la variable «${k}» en la plantilla: ${template}`);
    return String(vars[k]);
  });
}

export function windSpoken(w) {
  return w.calm ? 'viento calma' : `viento ${w.windDirection} grados ${w.windSpeed} nudos`;
}

export function windPanel(w) {
  return w.calm ? 'CALMA' : `${String(w.windDirection).padStart(3, '0')}° / ${String(w.windSpeed).padStart(2, '0')} KT`;
}

export function createPhraseology(cfg) {
  const T = cfg.pilot;
  const pilot = (key, vars) => fill(T[key], vars);
  return {
    cfg,
    pilot,
    event: (key) => cfg.events[key],
    dep: (key) => cfg.dependencies[key].spoken,
    freq: (which) => cfg.frequencies[which].display,
    routeSpoken: phoneticRoute,
    windSpoken,
    xpdrSpoken: (w) => (w.transponder === 'INSTITUTIONAL' ? cfg.militaryTransponderSpoken : w.transponder),
    militaryConfirmation: (phase) => fill(cfg.military.pilotConfirmation, { phase: cfg.military.phaseLabels[phase] }),
  };
}
