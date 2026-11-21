// Máquina de estados de las comunicaciones (prompt §10–§13, §15–§16, §22).
// Cada estado es un turno del estudiante (ATCO). Define:
//   control / phase   -> dependencia activa y nombre de la fase (solo se muestra en el informe)
//   checks            -> comprobaciones del evaluador
//   allowedDependencies / requiredDependency (para detectar repetición indebida)
//   ideal(ctx)        -> frase de referencia (solo visible al terminar)
//   accept(ctx, ex)   -> guarda lo que el estudiante instruyó (ruta, maniobra, calle…)
//   transition(ctx)   -> { next, pilot:[…], events:[…] }  (next = 'END' termina bien el ejercicio)

import { phoneticName } from './phonetic.js';

export const END = 'END';

export function buildStates({ phraseology: P, visual, locationsByCode, routeGroups }) {
  const cfg = P.cfg;
  const L = (code) => locationsByCode[code];
  const cs = (ctx) => ctx.scenario.callsign.display;
  const rwy = cfg.runway.spoken;
  const wind = (ctx) => P.windSpoken(ctx.scenario.weather);
  const maneuverLabel = (id) => visual.maneuvers[id].label;
  const reportLabel = (t) => visual.reportLabels[t];
  const point = (ctx) => visual.points.find((p) => p.id === ctx.scenario.visualPoint);
  const localOnly = (ctx) => ctx.scenario.dependencyMode === 'local';
  const groundOnly = (ctx) => ctx.scenario.dependencyMode === 'ground';
  const reportText = (ctx) => {
    const t = ctx.accepted.reportType;
    if (t === 'downwind') {
      const side = visual.maneuvers[ctx.accepted.entryId].side;
      return `${reportLabel(t)} ${side === 'left' ? 'izquierdo' : 'derecho'}`;
    }
    return reportLabel(t);
  };
  const phaseKey = (t) => (t === 'short_final' || t === 'long_final' ? 'final' : 'base');

  const S = {};
  const def = (id, spec) => { S[id] = { id, allowedDependencies: [], ...spec }; };

  // ------------------------------------------------------------ LLEGADA · CONTROL LOCAL
  def('A_L_CONTACT', {
    control: 'local', phase: 'Contacto inicial (Control Local)',
    checks: ['callsign', ['dependencyRequired', 'torre'], 'prosiga'], allowedDependencies: ['torre'],
    ideal: (c) => `${cs(c)}, ${P.dep('torre')}, prosiga.`,
    transition: (c) => ({ next: 'A_L_ENTRY', pilot: [P.pilot('arrivalRequest', { cs: cs(c), aircraft: c.scenario.aircraft.label, origin: c.scenario.origin.spoken, point: point(c).name })] }),
  });

  def('A_L_ENTRY', {
    control: 'local', phase: 'Instrucción de ingreso y condiciones',
    checks: ['callsign', 'recibido', 'entry', 'runway', 'wind', 'qnh', 'notify'],
    accept: (c, ex) => { c.accepted.entryId = ex.entry; c.accepted.reportType = ex.report; },
    ideal: (c) => {
      const p = point(c);
      const q = c.scenario.weather.qnh;
      const one = (e) => `${cs(c)}, recibido, ingrese a ${maneuverLabel(e)}, pista 17 izquierda, ${wind(c)}, QNH ${q}, notifique ${visual.validReports[e].map(reportLabel).join(' o ')}.`;
      return one(p.entries[0]) + (p.entries.length > 1 ? ` (También válido: ingreso a ${maneuverLabel(p.entries[1])}.)` : '');
    },
    transition: (c) => ({
      next: 'A_L_ENTRY_CONFIRM',
      pilot: [P.pilot('entryReadback', { cs: cs(c), maneuver: maneuverLabel(c.accepted.entryId), qnh: c.scenario.weather.qnh, report: reportText(c) })],
    }),
  });

  def('A_L_ENTRY_CONFIRM', {
    control: 'local', phase: 'Confirmación de la colación de ingreso',
    checks: ['callsign', 'correcto'],
    ideal: (c) => `${cs(c)}, correcto.`,
    transition: (c) => {
      const mil = c.scenario.aircraft.military;
      const t = c.accepted.reportType;
      const next = mil ? (t === 'base' ? 'A_L_GEAR_BASE' : t === 'downwind' ? 'A_L_ASK_BASE_GEAR' : 'A_L_GEAR_FINAL')
        : (t === 'downwind' ? 'A_L_ASK_BASE' : 'A_L_LAND');
      return { next, pilot: [P.pilot('report', { cs: cs(c), report: reportText(c) })] };
    },
  });

  def('A_L_ASK_BASE', {
    control: 'local', phase: 'Respuesta a notificación de tramo: solicitar básico',
    checks: ['callsign', 'recibido', 'askBase'],
    ideal: (c) => `${cs(c)}, recibido, notifique básico.`,
    transition: (c) => ({ next: 'A_L_LAND', pilot: [P.pilot('reportThenAskedBase', { cs: cs(c) })] }),
  });

  def('A_L_GEAR_BASE', {
    control: 'local', phase: 'Respuesta a notificación de básico (militar)',
    checks: ['callsign', 'recibido', 'gear'],
    ideal: (c) => `${cs(c)}, recibido, ${cfg.military.gearInstruction}.`,
    transition: (c) => ({ next: 'A_L_LAND', pilot: [`${cs(c)}, ${P.militaryConfirmation('base')}.`] }),
  });

  def('A_L_ASK_BASE_GEAR', {
    control: 'local', phase: 'Respuesta a notificación de tramo (militar)',
    checks: ['callsign', 'recibido', 'askBase', 'gear'],
    ideal: (c) => `${cs(c)}, recibido, notifique básico, ${cfg.military.gearInstruction}.`,
    transition: (c) => ({ next: 'A_L_LAND', pilot: [`${cs(c)}, ${P.militaryConfirmation('base')}.`] }),
  });

  def('A_L_GEAR_FINAL', {
    control: 'local', phase: 'Respuesta a notificación de final (militar)',
    checks: ['callsign', 'recibido', 'gear'],
    ideal: (c) => `${cs(c)}, recibido, ${cfg.military.gearInstruction}.`,
    transition: (c) => ({ next: 'A_L_LAND', pilot: [`${cs(c)}, ${P.militaryConfirmation('final')}.`] }),
  });

  def('A_L_LAND', {
    control: 'local', phase: 'Autorización de aterrizaje',
    checks: ['callsign', 'recibido', 'runway', 'landing'],
    ideal: (c) => `${cs(c)}, recibido, pista 17 izquierda, autorizado PARA aterrizar.`,
    transition: (c) => ({ next: 'A_L_VACATE', pilot: [P.pilot('landingReadback', { cs: cs(c) })], events: [P.event('landed')] }),
  });

  def('A_L_VACATE', {
    control: 'local', phase: 'Abandono de pista y transferencia a Control Terrestre',
    checks: ['callsign', 'vacate', 'transferGround'], allowedDependencies: ['terrestre'],
    accept: (c, ex) => { c.accepted.initialTaxiway = ex.street; },
    ideal: (c) => `${cs(c)}, abandone por vía Delta / Charlie / Bravo / Alfa, abandonando pista contacte ${P.dep('terrestre')}, frecuencia ${P.freq('ground')}.`,
    transition: (c) => {
      const readback = P.pilot('vacateReadback', { cs: cs(c), street: phoneticName(c.accepted.initialTaxiway), freq: P.freq('ground') });
      if (localOnly(c)) return { next: END, pilot: [readback] };
      return { next: 'A_G_CONTACT', pilot: [readback, P.pilot('contactGround', { cs: cs(c) })] };
    },
  });

  // ------------------------------------------------------------ LLEGADA · CONTROL TERRESTRE
  def('A_G_CONTACT', {
    control: 'ground', phase: 'Contacto inicial (Control Terrestre)',
    checks: ['callsign', ['dependencyRequired', 'terrestre'], 'prosiga'], allowedDependencies: ['terrestre'],
    ideal: (c) => `${cs(c)}, ${P.dep('terrestre')}, prosiga.`,
    transition: (c) => ({
      next: 'A_G_REQUEST',
      pilot: [P.pilot('groundArrivalRequest', { cs: cs(c), street: phoneticName(c.accepted.initialTaxiway), dest: L(c.scenario.destination).taxiName })],
    }),
  });

  def('A_G_REQUEST', {
    control: 'ground', phase: 'Instrucción de rodaje a la plataforma',
    checks: ['callsign', 'recibido', 'arrivalTaxi'],
    accept: (c, ex) => { c.accepted.route = ex.route; },
    ideal: (c) => `${cs(c)}, recibido, ruede a plataforma ${L(c.scenario.destination).taxiName}, vía ${phoneticName(c.accepted.initialTaxiway)}, … (la primera calle debe ser ${phoneticName(c.accepted.initialTaxiway)}; las siguientes no se evalúan).`,
    transition: (c) => ({
      next: 'A_G_CONFIRM',
      pilot: [P.pilot('groundArrivalReadback', { cs: cs(c), dest: L(c.scenario.destination).taxiName, route: P.routeSpoken(c.accepted.route) })],
    }),
  });

  def('A_G_CONFIRM', {
    control: 'ground', phase: 'Confirmación de la colación de rodaje',
    checks: ['callsign', 'correcto'],
    ideal: (c) => `${cs(c)}, correcto.`,
    transition: (c) => ({
      next: 'A_G_PARKED',
      pilot: [P.pilot('parked', { cs: cs(c), dest: L(c.scenario.destination).spoken })],
      events: [P.event('taxiArrival')],
    }),
  });

  def('A_G_PARKED', {
    control: 'ground', phase: 'Recepción de «estacionado»',
    checks: ['callsign', 'recibidoObligatorio'],
    ideal: (c) => `${cs(c)}, recibido.`,
    transition: () => ({ next: END, pilot: [] }),
  });

  // ------------------------------------------------------------ SALIDA · CONTROL TERRESTRE
  def('D_G_CONTACT', {
    control: 'ground', phase: 'Contacto inicial (Control Terrestre)',
    checks: ['callsign', ['dependencyRequired', 'terrestre'], 'prosiga'], allowedDependencies: ['terrestre'],
    ideal: (c) => `${cs(c)}, ${P.dep('terrestre')}, prosiga.`,
    transition: (c) => ({
      next: 'D_G_REQUEST',
      pilot: [P.pilot('departureRequest', {
        cs: cs(c), aircraft: c.scenario.aircraft.label, destination: c.scenario.flightDestination.spoken,
        parking: parkingSpoken(c.scenario.parking),
      })],
    }),
  });

  const parkingSpoken = (id) => (locationsByCode[id] ? locationsByCode[id].spoken : `el estacionamiento ${id}`);

  def('D_G_REQUEST', {
    control: 'ground', phase: 'Autorización de rodaje con condiciones',
    checks: ['callsign', 'recibido', 'departureTaxi', 'runway', 'departureRoute', 'wind', 'qnh', 'temperature', 'hour', 'transponder'],
    accept: (c, ex) => { c.accepted.route = ex.route; },
    ideal: (c) => {
      const g = routeGroups.find((x) => x.members.includes(c.scenario.parking));
      const w = c.scenario.weather;
      const xp = w.transponder === 'INSTITUTIONAL' ? 'active transpondedor institucional' : `active transpondedor ${w.transponder}`;
      const r = g.routes.map((x) => P.routeSpoken(x));
      return `${cs(c)}, recibido, ruede a punto de espera pista 17 izquierda, vía ${r[0]}, ${wind(c)}, QNH ${w.qnh}, temperatura ${w.temperature} grados, hora ${w.utc} UTC, ${xp}.`
        + (r.length > 1 ? ` (Ruta alternativa válida: ${r.slice(1).join(' / ')}.)` : '');
    },
    transition: (c) => {
      const w = c.scenario.weather;
      return {
        next: 'D_G_CONFIRM',
        pilot: [P.pilot('departureReadback', { cs: cs(c), route: P.routeSpoken(c.accepted.route), qnh: w.qnh, xpdr: P.xpdrSpoken(w) })],
      };
    },
  });

  def('D_G_CONFIRM', {
    control: 'ground', phase: 'Confirmación de la colación de rodaje',
    checks: ['callsign', 'correcto'],
    ideal: (c) => `${cs(c)}, correcto.`,
    transition: () => ({ next: 'D_G_TRANSFER', pilot: [], events: [P.event('taxiProgress')] }),
  });

  def('D_G_TRANSFER', {
    control: 'ground', phase: 'Transferencia a Santiago Torre',
    checks: ['callsign', 'transferTower'], allowedDependencies: ['torre'],
    ideal: (c) => `${cs(c)}, cuando listo contacte ${P.dep('torre')}, frecuencia ${P.freq('tower')}.`,
    transition: (c) => {
      const rb = P.pilot('transferReadback', { cs: cs(c), freq: P.freq('tower') });
      if (groundOnly(c)) return { next: END, pilot: [rb] };
      return { next: 'D_L_TAKEOFF', pilot: [rb, P.pilot('readyForDeparture', { cs: cs(c) })] };
    },
  });

  // ------------------------------------------------------------ SALIDA · CONTROL LOCAL
  def('D_L_TAKEOFF', {
    control: 'local', phase: 'Autorización de despegue',
    checks: ['callsign', 'recibido', 'runway', 'takeoff'],
    ideal: (c) => `${cs(c)}, recibido, pista 17 izquierda, autorizado A despegar.`,
    transition: () => ({ next: END, pilot: [] }),
  });

  return S;
}

/** Mensajes iniciales del piloto para el estado de partida. */
export function initialPilotMessages(sc, P) {
  const cs = sc.callsign.display;
  switch (sc.startState) {
    case 'A_L_CONTACT': return [P.pilot('contactTower', { cs })];
    case 'A_G_CONTACT': return [P.pilot('contactGround', { cs })];
    case 'D_G_CONTACT': return [P.pilot('contactGround', { cs })];
    case 'D_L_TAKEOFF': return [P.pilot('readyForDeparture', { cs })];
    default: throw new Error(`Estado inicial desconocido: ${sc.startState}`);
  }
}
