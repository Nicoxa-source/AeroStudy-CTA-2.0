// Temporizador de 60 s por intervención (prompt §27).
// - Se basa en marcas de tiempo (no en contar ticks), por lo que no se desincroniza al minimizar la app.
// - pause()/resume() permiten excluir el procesamiento técnico del reconocimiento de voz.
// - mark()/restoreMark() permiten devolver el tiempo de un intento fallido por causa técnica.
// - elapsed nunca supera el límite en remaining(): no hay conteos negativos.

export function createTimer({ now = () => Date.now(), limitMs = 60000 } = {}) {
  let startedAt = null;
  let accumulated = 0;
  let running = false;
  let markMs = 0;

  const elapsedMs = () => accumulated + (running ? now() - startedAt : 0);

  return {
    limitMs,
    start() { accumulated = 0; markMs = 0; startedAt = now(); running = true; },
    pause() { if (running) { accumulated += now() - startedAt; running = false; } },
    resume() { if (!running && startedAt !== null) { startedAt = now(); running = true; } },
    stop() { this.pause(); },
    isRunning: () => running,
    elapsedMs,
    remainingMs: () => Math.max(0, limitMs - elapsedMs()),
    expired: () => elapsedMs() >= limitMs,
    mark() { markMs = elapsedMs(); },
    restoreMark() { accumulated = markMs; if (running) startedAt = now(); },
  };
}

export function timerBand(remainingMs) {
  const s = Math.ceil(remainingMs / 1000);
  if (s <= 10) return 'critical';
  if (s <= 30) return 'warning';
  return 'normal';
}
