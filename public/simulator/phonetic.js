// Alfabeto fonético aeronáutico (prompt §17.1) y variantes de transcripción habituales.
export const PHONETIC = {
  A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel',
  I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa',
  Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
  X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
};

// palabra normalizada (minúsculas, sin tildes) -> letra
export const WORD_TO_LETTER = {
  alfa: 'A', alpha: 'A',
  bravo: 'B',
  charlie: 'C', charly: 'C', charli: 'C', charlee: 'C', charley: 'C',
  delta: 'D',
  echo: 'E', eco: 'E',
  foxtrot: 'F', foxtrop: 'F',
  golf: 'G', golfo: 'G',
  hotel: 'H', jotel: 'H',
  india: 'I', hindia: 'I',
  juliett: 'J', juliet: 'J', julieta: 'J', juliette: 'J',
  kilo: 'K',
  lima: 'L',
  mike: 'M', maik: 'M',
  november: 'N', noviembre: 'N',
  oscar: 'O',
  papa: 'P',
  quebec: 'Q', quebeck: 'Q', kebec: 'Q', quebek: 'Q',
  romeo: 'R',
  sierra: 'S',
  tango: 'T',
  uniform: 'U', uniforme: 'U',
  victor: 'V',
  whiskey: 'W', whisky: 'W', wiski: 'W',
  xray: 'X',
  yankee: 'Y', yanqui: 'Y',
  zulu: 'Z',
};

// Nombres de letras en español (deletreo): se usan solo para reconocer callsigns deletreados.
export const SPANISH_LETTER_NAMES = {
  a: 'A', be: 'B', ce: 'C', de: 'D', e: 'E', efe: 'F', ge: 'G', hache: 'H', i: 'I', jota: 'J',
  ka: 'K', ele: 'L', eme: 'M', ene: 'N', o: 'O', pe: 'P', cu: 'Q', erre: 'R', ese: 'S', te: 'T',
  u: 'U', uve: 'V', equis: 'X', ye: 'Y', zeta: 'Z',
};

export const LETTER_TO_SPOKEN = PHONETIC;

export function phoneticName(letter) {
  return PHONETIC[String(letter).toUpperCase()] ?? String(letter);
}

export function phoneticRoute(letters) {
  return letters.map(phoneticName).join(', ');
}
