/**
 * Morphology helpers for Observer hover tooltips and MorphGNT→RMAC conversion.
 *
 * `describeMorph` accepts whatever code the token layer already carries:
 * - Robinson/RMAC (`N-NSM`, `V-AAI-3S`) — NT interlinear + Mark `rmac`
 * - MorphGNT packed (`N-----NSM-`, `V-3AAI-S--`) — alignment / raw MorphGNT
 * - OSHB (`HVqp3ms`, `HR/Ncfsc`) — Daniel / OT
 *
 * Never throws — unknown shapes fall back to the raw code.
 */

// --- MorphGNT → RMAC ---

function ch(value: string, index: number): string {
  return value[index] ?? "-";
}

function declensionSuffix(morph: string, allowNoGender = false): string {
  const grammaticalCase = ch(morph, 6);
  const number = ch(morph, 7);
  const gender = ch(morph, 8);
  if (grammaticalCase === "-" || grammaticalCase === "?" || number === "-" || number === "?") {
    return "";
  }
  if (gender === "-" || gender === "?") {
    return allowNoGender ? `${grammaticalCase}${number}` : "";
  }
  return `${grammaticalCase}${number}${gender}`;
}

function degreeSuffix(morph: string): string {
  const degree = ch(morph, 9);
  if (degree === "C") return "-C";
  if (degree === "S") return "-S";
  return "";
}

function verbRmac(morph: string): string {
  const code = morph.startsWith("V-") ? morph.slice(2) : morph.slice(1);
  if (code.length < 4) return morph;

  const tenseMap: Record<string, string> = { P: "P", I: "I", F: "F", A: "A", R: "X", L: "Y", X: "X" };
  const voiceMap: Record<string, string> = { A: "A", M: "M", P: "P", E: "E", D: "M", O: "P", N: "E" };
  const moodMap: Record<string, string> = { I: "I", S: "S", O: "O", D: "M", M: "M", N: "N", P: "P" };
  const numberMap: Record<string, string> = { S: "S", P: "P" };
  const person = code[0];
  const tense = tenseMap[code[1]] ?? code[1];
  const voice = voiceMap[code[2]] ?? code[2];
  const mood = moodMap[code[3]] ?? code[3];
  const number = numberMap[code[5]] ?? code[5] ?? "";

  // Participle: person often `-`; case/number/gender follow (V--PAP-NPM-).
  if (mood === "P" || (person === "-" && code[3] === "P")) {
    const caseNumGender = code.slice(5).replace(/-/g, "");
    if (caseNumGender.length >= 2) {
      return `V-${tense}${voice}P-${caseNumGender.slice(0, 3)}`;
    }
    return `V-${tense}${voice}P`;
  }

  if (["1", "2", "3"].includes(person) && number) {
    return `V-${tense}${voice}${mood}-${person}${number}`;
  }
  return `V-${tense}${voice}${mood}`;
}

function declinedRmac(prefix: string, morph: string, lemma = ""): string {
  const pronounPerson: Record<string, string> = {
    ἐγώ: "1",
    σύ: "2",
    ἡμεῖς: "1",
    ὑμεῖς: "2",
    αὐτός: "3",
    ἑαυτοῦ: "3",
    ἑαυτός: "3"
  };

  if (prefix === "P" && pronounPerson[lemma]) {
    const suffix = declensionSuffix(morph, true);
    return suffix ? `P-${pronounPerson[lemma]}${suffix}${degreeSuffix(morph)}` : prefix;
  }

  const suffix = declensionSuffix(morph);
  return suffix ? `${prefix}-${suffix}${degreeSuffix(morph)}` : prefix;
}

/** Convert packed MorphGNT (`N-----NSM-`) to RMAC (`N-NSM`). */
export function morphGntToRmac(morph: string, lemma = ""): string {
  if (!morph || morph === "-") return morph;
  // Already RMAC verb (V-AAI-3S), not packed (V-3AAI-S--)
  if (/^V-[PIFAXY][AMPE][ISOMNP]/.test(morph)) return morph;
  if (morph.startsWith("V-")) return verbRmac(morph);

  const twoLetterPrefixes: Record<string, string> = {
    RA: "T",
    RD: "D",
    RI: "I",
    RR: "R",
    RP: "P"
  };
  const twoLetter = morph.slice(0, 2);
  if (twoLetterPrefixes[twoLetter]) {
    return declinedRmac(twoLetterPrefixes[twoLetter], morph, lemma);
  }

  const posPrefixes: Record<string, string> = {
    N: "N",
    A: "A",
    C: "CONJ",
    D: "ADV",
    I: "INJ",
    P: "PREP",
    X: "PRT"
  };
  const pos = morph[0];
  if (pos === "N" || pos === "A") return declinedRmac(posPrefixes[pos], morph, lemma);
  return posPrefixes[pos] ?? morph;
}

function looksLikeMorphGnt(code: string): boolean {
  // Packed declension: N-----NSM- / RA----GSM-
  if (/^[NADCRIPX]A?-/.test(code) && code.includes("---")) return true;
  // Packed verb: V-3AAI-S-- or V--PAP-NPM-
  if (/^V-[\d-]/.test(code)) return true;
  return false;
}

// --- RMAC describe (español) ---

const RMAC_CASE: Record<string, string> = {
  N: "nominativo",
  G: "genitivo",
  D: "dativo",
  A: "acusativo",
  V: "vocativo"
};
const RMAC_NUMBER: Record<string, string> = { S: "singular", P: "plural" };
const RMAC_GENDER: Record<string, string> = { M: "masculino", F: "femenino", N: "neutro" };
const RMAC_TENSE: Record<string, string> = {
  P: "presente",
  I: "imperfecto",
  F: "futuro",
  A: "aoristo",
  X: "perfecto",
  Y: "pluscuamperfecto"
};
const RMAC_VOICE: Record<string, string> = {
  A: "activa",
  M: "media",
  P: "pasiva",
  E: "media/pasiva"
};
const RMAC_MOOD: Record<string, string> = {
  I: "indicativo",
  S: "subjuntivo",
  O: "optativo",
  M: "imperativo",
  N: "infinitivo",
  P: "participio"
};
const RMAC_PERSON: Record<string, string> = { "1": "1.ª", "2": "2.ª", "3": "3.ª" };
const RMAC_DEGREE: Record<string, string> = { C: "comparativo", S: "superlativo" };
const RMAC_POS: Record<string, string> = {
  N: "Sustantivo",
  A: "Adjetivo",
  T: "Artículo",
  D: "Pronombre demostrativo",
  I: "Pronombre interrogativo/indefinido",
  R: "Pronombre relativo",
  P: "Pronombre personal/reflexivo",
  CONJ: "Conjunción",
  ADV: "Adverbio",
  INJ: "Interjección",
  PREP: "Preposición",
  PRT: "Partícula"
};

/** Decode an RMAC/Robinson tag into a one-line Spanish gloss. */
export function describeRmac(rmac: string): string {
  if (!rmac) return "";

  if (rmac.startsWith("V-")) {
    const [main, personNumber] = rmac.slice(2).split("-");
    if (!main || main.length < 3) return rmac;
    const tense = RMAC_TENSE[main[0]] ?? main[0];
    const voice = RMAC_VOICE[main[1]] ?? main[1];
    const mood = RMAC_MOOD[main[2]] ?? main[2];

    // Participios suelen llevar caso/número/género (V-PAP-NSM).
    if (main[2] === "P" && personNumber && /^[NGDAV][SP][MFN]?$/.test(personNumber)) {
      const grammaticalCase = RMAC_CASE[personNumber[0]] ?? personNumber[0];
      const number = RMAC_NUMBER[personNumber[1]] ?? personNumber[1];
      const gender = personNumber[2] ? RMAC_GENDER[personNumber[2]] : null;
      return `Verbo — ${tense}, ${voice}, participio — ${grammaticalCase}, ${number}${
        gender ? `, ${gender}` : ""
      }`;
    }

    let result = `Verbo — ${tense}, ${voice}, ${mood}`;
    if (personNumber && personNumber.length >= 2 && /^[123]/.test(personNumber)) {
      const person = RMAC_PERSON[personNumber[0]] ?? personNumber[0];
      const number = RMAC_NUMBER[personNumber[1]] ?? personNumber[1];
      result += ` — ${person} persona ${number}`;
    }
    return result;
  }

  if (rmac in RMAC_POS && !rmac.includes("-")) {
    return RMAC_POS[rmac];
  }

  const declMatch = rmac.match(/^([NATDIRP])-(.+)$/);
  if (declMatch) {
    const [, posLetter, rawSuffix] = declMatch;
    const posName = RMAC_POS[posLetter] ?? posLetter;

    let core = rawSuffix;
    let degree = "";
    const degreeMatch = core.match(/-(C|S)$/);
    if (degreeMatch) {
      degree = RMAC_DEGREE[degreeMatch[1]] ?? "";
      core = core.slice(0, -2);
    }

    if (posLetter === "P") {
      const personMatch = core.match(/^([123])(.+)$/);
      if (personMatch) {
        const [, person, rest] = personMatch;
        const grammaticalCase = RMAC_CASE[rest[0]] ?? rest[0];
        const number = RMAC_NUMBER[rest[1]] ?? rest[1];
        const gender = rest[2] ? RMAC_GENDER[rest[2]] : null;
        return `${posName} — ${RMAC_PERSON[person] ?? person} persona, ${grammaticalCase}, ${number}${
          gender ? `, ${gender}` : ""
        }`;
      }
    }

    const grammaticalCase = RMAC_CASE[core[0]] ?? core[0];
    const number = RMAC_NUMBER[core[1]] ?? core[1];
    const gender = core[2] ? RMAC_GENDER[core[2]] : null;
    let result = `${posName} — ${grammaticalCase}, ${number}${gender ? `, ${gender}` : ""}`;
    if (degree) result += `, ${degree}`;
    return result;
  }

  return rmac;
}

// --- OSHB (MorphHB), glosas en español ---

const OSHB_POS: Record<string, string> = {
  A: "Adjetivo",
  C: "Conjunción",
  D: "Adverbio",
  N: "Sustantivo",
  P: "Pronombre",
  R: "Preposición",
  S: "Sufijo",
  T: "Partícula",
  V: "Verbo"
};

const OSHB_STEM_HEBREW: Record<string, string> = {
  q: "qal",
  N: "nifal",
  p: "piel",
  P: "pual",
  h: "hifil",
  H: "hofal",
  t: "hitpael",
  o: "polel",
  O: "polal",
  r: "hitpolel",
  m: "poel",
  M: "poal",
  k: "palel",
  K: "pulal",
  Q: "qal pasivo",
  l: "pilpel",
  L: "polpal",
  f: "hitpalpel",
  D: "nitpael",
  j: "pealal",
  i: "pilel",
  u: "hotpaal",
  c: "tifil",
  v: "hishtafel",
  w: "nitpalel",
  y: "nitpoel",
  z: "hitpoel"
};

const OSHB_STEM_ARAMAIC: Record<string, string> = {
  q: "peal",
  Q: "peil",
  u: "hitpeel",
  p: "pael",
  P: "itpaal",
  M: "hitpaal",
  a: "afel",
  h: "hafel",
  s: "safel",
  e: "shafel",
  H: "hofal",
  i: "itpeel",
  t: "hishtafel",
  v: "ishtafel",
  w: "hitafel",
  o: "polel",
  z: "itpoel",
  r: "hitpolel",
  f: "hitpalpel",
  b: "hefal",
  c: "tifel",
  m: "poel",
  l: "palpel",
  L: "itpalpel",
  O: "itpolel",
  G: "ittafal"
};

const OSHB_VERB_TYPE: Record<string, string> = {
  p: "perfecto",
  q: "perfecto secuencial",
  i: "imperfecto",
  w: "imperfecto secuencial",
  h: "cohortativo",
  j: "yusivo",
  v: "imperativo",
  r: "participio (activo)",
  s: "participio (pasivo)",
  a: "infinitivo absoluto",
  c: "infinitivo constructo"
};

const OSHB_NOUN_TYPE: Record<string, string> = {
  c: "común",
  g: "gentilicio",
  p: "propio"
};

const OSHB_ADJ_TYPE: Record<string, string> = {
  a: "adjetivo",
  c: "cardinal",
  g: "gentilicio",
  o: "ordinal"
};

const OSHB_PRONOUN_TYPE: Record<string, string> = {
  d: "demostrativo",
  f: "indefinido",
  i: "interrogativo",
  p: "personal",
  r: "relativo"
};

const OSHB_PARTICLE_TYPE: Record<string, string> = {
  a: "afirmación",
  d: "artículo definido",
  e: "exhortación",
  i: "interrogativo",
  j: "interjección",
  m: "demostrativo",
  n: "negación",
  o: "marcador de objeto directo",
  r: "relativo"
};

const OSHB_SUFFIX_TYPE: Record<string, string> = {
  d: "he direccional",
  h: "he paragogica",
  n: "nun paragogica",
  p: "pronominal"
};

const OSHB_GENDER: Record<string, string> = {
  b: "ambos",
  c: "común",
  f: "femenino",
  m: "masculino"
};

const OSHB_NUMBER: Record<string, string> = {
  d: "dual",
  p: "plural",
  s: "singular"
};

const OSHB_STATE: Record<string, string> = {
  a: "absoluto",
  c: "constructo",
  d: "determinado"
};

const OSHB_PERSON: Record<string, string> = {
  "1": "1.ª",
  "2": "2.ª",
  "3": "3.ª"
};

function looksLikeOshb(code: string): boolean {
  if (!code) return false;
  if (/^[HA]([ACDNPRSTV]|To|Td|Rd)/.test(code)) return true;
  if (code.includes("/") && /^[HA]?[ACDNPRSTV]/.test(code.split("/")[0])) return true;
  return false;
}

function describeOshbComponent(comp: string, lang: "H" | "A"): string {
  if (!comp) return "";

  let body = comp;
  if (body.startsWith("H") || body.startsWith("A")) body = body.slice(1);

  if (body === "C") return "Conjunción";
  if (body === "R") return "Preposición";
  if (body === "D") return "Adverbio";
  if (body === "To") return "Partícula — marcador de objeto directo";
  if (body === "Td") return "Partícula — artículo definido";
  if (body.startsWith("Rd")) return "Preposición — con artículo";

  const pos = body[0];
  const rest = body.slice(1);

  if (pos === "V") {
    const stemCode = rest[0] ?? "";
    const typeCode = rest[1] ?? "";
    const stemTable = lang === "A" ? OSHB_STEM_ARAMAIC : OSHB_STEM_HEBREW;
    const stem = stemTable[stemCode] ?? stemCode;
    const type = OSHB_VERB_TYPE[typeCode] ?? typeCode;
    const bits = [`Verbo — ${stem}, ${type}`];

    const png = rest.slice(2);
    const personMatch = png.match(/([123])([mfc])([spd])/);
    if (personMatch) {
      bits.push(
        `${OSHB_PERSON[personMatch[1]]} persona`,
        OSHB_GENDER[personMatch[2]] ?? personMatch[2],
        OSHB_NUMBER[personMatch[3]] ?? personMatch[3]
      );
    } else {
      const gn = png.match(/([mfcb])([spd])([acd])?/);
      if (gn) {
        bits.push(OSHB_GENDER[gn[1]] ?? gn[1], OSHB_NUMBER[gn[2]] ?? gn[2]);
        if (gn[3]) bits.push(OSHB_STATE[gn[3]] ?? gn[3]);
      }
    }
    return bits.join(", ");
  }

  if (pos === "N") {
    const type = OSHB_NOUN_TYPE[rest[0]] ?? "";
    const bits = [type ? `Sustantivo — ${type}` : "Sustantivo"];
    const bodyChars = rest.slice(1);
    if (
      bodyChars.length >= 3 &&
      bodyChars[0] in OSHB_GENDER &&
      bodyChars[1] in OSHB_NUMBER &&
      bodyChars[2] in OSHB_STATE
    ) {
      bits.push(OSHB_GENDER[bodyChars[0]], OSHB_NUMBER[bodyChars[1]], OSHB_STATE[bodyChars[2]]);
    } else {
      for (const c of bodyChars) {
        if (c in OSHB_GENDER) bits.push(OSHB_GENDER[c]);
        else if (c in OSHB_NUMBER) bits.push(OSHB_NUMBER[c]);
        else if (c in OSHB_STATE) bits.push(OSHB_STATE[c]);
      }
    }
    return bits.join(", ");
  }

  if (pos === "A") {
    const type = OSHB_ADJ_TYPE[rest[0]] ?? "adjetivo";
    const bits = [`Adjetivo — ${type}`];
    const bodyChars = rest.slice(1);
    if (
      bodyChars.length >= 3 &&
      bodyChars[0] in OSHB_GENDER &&
      bodyChars[1] in OSHB_NUMBER &&
      bodyChars[2] in OSHB_STATE
    ) {
      bits.push(OSHB_GENDER[bodyChars[0]], OSHB_NUMBER[bodyChars[1]], OSHB_STATE[bodyChars[2]]);
    } else {
      for (const c of bodyChars) {
        if (c in OSHB_GENDER) bits.push(OSHB_GENDER[c]);
        else if (c in OSHB_NUMBER) bits.push(OSHB_NUMBER[c]);
        else if (c in OSHB_STATE) bits.push(OSHB_STATE[c]);
      }
    }
    return bits.join(", ");
  }

  if (pos === "P") {
    const type = OSHB_PRONOUN_TYPE[rest[0]] ?? "";
    const bits = [type ? `Pronombre — ${type}` : "Pronombre"];
    const png = rest.slice(1);
    const personMatch = png.match(/([123])([mfc])([spd])/);
    if (personMatch) {
      bits.push(
        `${OSHB_PERSON[personMatch[1]]} persona`,
        OSHB_GENDER[personMatch[2]] ?? personMatch[2],
        OSHB_NUMBER[personMatch[3]] ?? personMatch[3]
      );
    } else {
      for (const c of png) {
        if (c in OSHB_GENDER) bits.push(OSHB_GENDER[c]);
        else if (c in OSHB_NUMBER) bits.push(OSHB_NUMBER[c]);
      }
    }
    return bits.join(", ");
  }

  if (pos === "S") {
    const type = OSHB_SUFFIX_TYPE[rest[0]] ?? rest[0] ?? "";
    const bits = [type ? `Sufijo — ${type}` : "Sufijo"];
    const png = rest.slice(1);
    const personMatch = png.match(/([123])([mfc])([spd])/);
    if (personMatch) {
      bits.push(
        `${OSHB_PERSON[personMatch[1]]} persona`,
        OSHB_GENDER[personMatch[2]] ?? personMatch[2],
        OSHB_NUMBER[personMatch[3]] ?? personMatch[3]
      );
    }
    return bits.join(", ");
  }

  if (pos === "T") {
    const type = OSHB_PARTICLE_TYPE[rest[0]] ?? rest;
    return type ? `Partícula — ${type}` : "Partícula";
  }

  if (pos === "R") {
    return rest.startsWith("d") ? "Preposición — con artículo" : "Preposición";
  }

  return OSHB_POS[pos] ?? body;
}

/** Decode an OSHB morph string (`HVqp3ms`, `HR/Ncfsc`) into a one-line gloss. */
export function describeOshb(morph: string): string {
  if (!morph) return "";
  const lang: "H" | "A" = morph.startsWith("A") ? "A" : "H";
  const parts = morph
    .split("/")
    .map(part => describeOshbComponent(part, lang))
    .filter(Boolean);
  if (!parts.length) return morph;
  return parts.join(" + ");
}

/**
 * Explain whatever morphology code Observer already has on a token.
 * Prefer this over calling describeRmac / describeOshb directly from UI.
 */
export function describeMorph(code: string): string {
  if (!code) return "";
  if (looksLikeOshb(code)) return describeOshb(code);
  if (looksLikeMorphGnt(code)) return describeRmac(morphGntToRmac(code));
  const rmac = describeRmac(code);
  if (rmac !== code) return rmac;
  const converted = morphGntToRmac(code);
  if (converted !== code) {
    const described = describeRmac(converted);
    if (described !== converted) return described;
  }
  return code;
}
