// Generador de escenarios (prompt §6–§9, §14). Usa las bases existentes (shared-db.json) y las
// reglas de data/*.json. Con una semilla produce siempre el mismo escenario (útil para pruebas).

import { createRng } from './rng.js';

const HISTORY_SIZE = 10;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
};

export function createScenarioGenerator({ db, fleet, routes, parking, locations, visual, weatherRules, phraseology }) {
  const aircraftByCode = new Map(db.aircraft.map((a) => [a.code, a]));
  const adByCode = new Map([...db.chile.map((a) => [a.code, { ...a, domestic: true }]), ...db.international.map((a) => [a.code, { ...a, domestic: false }])]);
  const cityCount = new Map();
  db.chile.forEach((a) => cityCount.set(a.city, (cityCount.get(a.city) ?? 0) + 1));

  const spokenAd = (code) => {
    const a = adByCode.get(code);
    if (fleet.aerodromes.spokenOverrides[code]) return fleet.aerodromes.spokenOverrides[code];
    if (!a.domestic) return a.city;
    return cityCount.get(a.city) === 1 ? a.city : a.name;
  };

  const enabledPending = (id) => parking.pendingConfirmation[id]?.enabled === true;
  const civilParkings = routes.groups.filter((g) => g.id !== 'MIL').flatMap((g) => g.members);
  const hangarCodes = locations.filter((l) => l.kind !== 'military').map((l) => l.code);

  function genCallsign(rng, military) {
    if (military) {
      const w = rng.pick(fleet.militaryCallsigns.words);
      const n = String(rng.int(fleet.militaryCallsigns.numberMin, fleet.militaryCallsigns.numberMax));
      const word = w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      return { kind: 'tactical', display: `${w} ${n}`, word, number: n };
    }
    let s = '';
    for (let i = 0; i < fleet.civilCallsign.lettersLength; i++) s += rng.pick(LETTERS.split(''));
    return { kind: 'registration', display: `${fleet.civilCallsign.prefix}-${s}`, letters: fleet.civilCallsign.prefix + s, short: s };
  }

  function genWeather(rng, military, operation) {
    const r = weatherRules;
    const calm = rng.chance(r.windSpeedKt.calmProbability);
    const windSpeed = calm ? 0 : rng.int(Math.max(1, r.windSpeedKt.min), r.windSpeedKt.max);
    const steps = (r.windDirection.max - r.windDirection.min) / r.windDirection.step;
    const windDirection = calm ? null : r.windDirection.min + r.windDirection.step * rng.int(0, steps);
    const qnh = rng.int(r.qnh.min, r.qnh.max);
    const h = rng.int(0, 23);
    const m = rng.int(0, 59);
    const local = (h + r.coherence.localOffsetHours + 24) % 24;
    const c = r.coherence;
    const band = local >= c.night.fromLocalHour && local < c.night.toLocalHour ? c.night
      : local >= c.day.fromLocalHour && local <= c.day.toLocalHour ? c.day : c.other;
    const temperature = Math.min(r.temperatureC.max, Math.max(r.temperatureC.min, rng.int(band.min, band.max)));
    let transponder = null;
    if (operation === 'departure') {
      if (military) transponder = 'INSTITUTIONAL';
      else {
        const t = r.transponder;
        if (t.mode === 'bank' && t.bank.length) transponder = rng.pick(t.bank);
        else {
          do {
            transponder = Array.from({ length: t.length }, () => rng.int(t.digitMin, t.digitMax)).join('');
          } while (t.excludedCodes.includes(transponder) || t.excludedFirstDigits.includes(Number(transponder[0])));
        }
      }
    }
    return { calm, windDirection, windSpeed, qnh, temperature, utc: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, transponder };
  }

  function candidateAerodromes(category, military) {
    const a = fleet.aerodromes;
    let list = [...a.tier1];
    if (military) list = [...list, ...a.militaryExtra];
    else {
      if (category.maxTier >= 2) list = [...list, ...a.tier2];
      if (category.maxTier >= 3) list = [...list, ...a.tier3International];
    }
    return [...new Set(list)].filter((c) => adByCode.has(c) && c !== 'SCEL');
  }

  function generate({ dependency = 'full', operation = 'random', seed, history = [] } = {}) {
    const rng = createRng(seed);
    const last = history[history.length - 1] ?? {};
    const recent = new Set(history.slice(-HISTORY_SIZE).map((h) => h.signature));
    let scenario = null;

    for (let attempt = 0; attempt < 40 && !scenario; attempt++) {
      const op = operation === 'random' ? (rng.chance(0.5) ? 'arrival' : 'departure') : operation;
      const catName = rng.weighted(Object.keys(fleet.categories), (k) => fleet.categoryWeights[k]);
      const category = fleet.categories[catName];
      const military = category.military;
      const codes = category.codes.filter((c) => aircraftByCode.has(c));
      const pool = codes.filter((c) => c !== last.aircraft);
      const code = rng.pick(pool.length ? pool : codes);
      const ac = aircraftByCode.get(code);
      const callsign = genCallsign(rng, military);
      const ads = candidateAerodromes(category, military);
      const adPool = ads.filter((c) => c !== last.adCode);
      const adCode = rng.pick(adPool.length ? adPool : ads);
      const weather = genWeather(rng, military, op);

      const sc = {
        airport: phraseology.airport,
        runway: phraseology.runway.id,
        flightRules: 'VFR',
        operation: op,
        dependencyMode: dependency,
        aircraft: { code, label: fleet.labels[code] ?? `${ac.make} ${ac.model}`, make: ac.make, model: ac.model, category: catName, military },
        callsign,
        weather,
      };
      if (op === 'arrival') {
        const points = visual.points.filter((p) => p.id !== last.visualPoint);
        sc.origin = { code: adCode, spoken: spokenAd(adCode) };
        sc.visualPoint = rng.pick(points).id;
        const dests = military ? parking.arrivalDestinations.militaryAircraftOnlyTo : hangarCodes.filter((c) => !parking.arrivalDestinations.civilAircraftNeverTo.includes(c));
        const dPool = dests.filter((c) => c !== last.destination);
        sc.destination = rng.pick(dPool.length ? dPool : dests);
        sc.initialTaxiway = rng.pick(phraseology.taxiwaysForRunwayExit);
        sc.startState = dependency === 'ground' ? 'A_G_CONTACT' : 'A_L_CONTACT';
      } else {
        sc.flightDestination = { code: adCode, spoken: spokenAd(adCode) };
        const parkings = military ? parking.departureParking.militaryAircraftOnlyFrom
          : civilParkings.filter((p) => !(p in parking.pendingConfirmation) || enabledPending(p));
        const pPool = parkings.filter((p) => p !== last.parking);
        sc.parking = rng.pick(pPool.length ? pPool : parkings);
        sc.startState = dependency === 'local' ? 'D_L_TAKEOFF' : 'D_G_CONTACT';
      }
      sc.signature = [op, code, callsign.display, sc.origin?.code ?? sc.flightDestination.code, sc.visualPoint ?? '', sc.destination ?? '', sc.parking ?? '',
        weather.qnh, weather.windDirection, weather.windSpeed, weather.utc].join('|');
      if (recent.has(sc.signature)) continue;
      if (last.weather && last.weather === `${weather.qnh}|${weather.windDirection}|${weather.windSpeed}|${weather.temperature}`) continue;
      scenario = sc;
    }
    if (!scenario) throw new Error('No se pudo generar un escenario distinto del historial reciente.');
    scenario.id = `sc-${Date.now().toString(36)}-${Math.floor(rng.next() * 1e6).toString(36)}`;
    return deepFreeze(scenario);
  }

  /** Entrada compacta para guardar en el historial anti-repetición. */
  function historyEntry(sc) {
    return {
      signature: sc.signature,
      aircraft: sc.aircraft.code,
      adCode: (sc.origin ?? sc.flightDestination).code,
      visualPoint: sc.visualPoint,
      destination: sc.destination,
      parking: sc.parking,
      weather: `${sc.weather.qnh}|${sc.weather.windDirection}|${sc.weather.windSpeed}|${sc.weather.temperature}`,
    };
  }

  return { generate, historyEntry, spokenAd, civilParkings, hangarCodes };
}
