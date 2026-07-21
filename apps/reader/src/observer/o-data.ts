import { getReaderBookInfo, type ReaderBookId } from "@cgv/core";
import { parseNblaContent } from "cgv-bible";
import type { BibleVerse } from "cgv-bible";
import { loadInterlinearRaw, loadMorphRaw, loadNblaRaw, loadTokensRaw } from "./book-assets";
import { getWorkshopBookId } from "./workshop-book";

export interface GreekToken {
  id: string;
  chapter: number;
  verse: number;
  token: number;
  surface: string;
  sourceMorph: string;
  rmac: string;
  lemma: string;
}

export interface GreekVerse {
  chapter: number;
  verse: number;
  label: string;
  tokens: GreekToken[];
}

export interface AlignmentToken {
  id: string;
  chapter: number;
  verse: number;
  token: number;
  surface: string;
  lemma: string;
  morph: string;
  es: string;
}

export interface BookMorphData {
  alignment: AlignmentToken[];
  greek: Array<[number, GreekVerse[]]>;
  spanish: BibleVerse[];
}

/** @deprecated Prefer BookMorphData — kept for call sites during migration. */
export type TitusData = BookMorphData;

function parseMorphLine(line: string, index: number): GreekToken | null {
  const match = line.match(/^(\d{6})\s+(\S+)\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s+(.+)$/);
  if (!match) return null;

  const [, reference, partOfSpeech, morph, surface, lemma] = match;
  const chapter = Number(reference.slice(2, 4));
  const verse = Number(reference.slice(4, 6));
  const sourceMorph = `${partOfSpeech}${morph}`;

  return {
    id: `${reference}-${index}`,
    chapter,
    verse,
    token: 0,
    surface,
    sourceMorph,
    rmac: morphGntToRmac(sourceMorph, lemma),
    lemma
  };
}

function parseAlignmentLine(line: string, bookId: ReaderBookId): AlignmentToken | null {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || parsed.book !== bookId) return null;
    if (
      typeof parsed.ch !== "number" ||
      typeof parsed.vs !== "number" ||
      typeof parsed.tok !== "number" ||
      typeof parsed.surface !== "string" ||
      typeof parsed.lemma !== "string" ||
      typeof parsed.morph !== "string" ||
      typeof parsed.es !== "string"
    ) {
      return null;
    }

    return {
      id: `${parsed.ch}:${parsed.vs}:${parsed.tok}`,
      chapter: parsed.ch,
      verse: parsed.vs,
      token: parsed.tok,
      surface: parsed.surface,
      lemma: parsed.lemma,
      morph: parsed.morph,
      es: parsed.es.replace(/·/g, " ")
    };
  } catch {
    return null;
  }
}

export interface VerseInterlinearToken {
  surface: string;
  lemma: string;
  strongs: string;
  morph: string;
  gloss: string;
}

// One line per verse: "{book} {chapter}:{verse}\t{Surface<Lemma|Strongs|Morph|Gloss>}...".
// Read-only, whole-verse context — solves what the token-by-token alignment
// can't: judging who an imperative is addressed to needs the words around
// it, not just the isolated verb and its person/number.
const INTERLINEAR_TOKEN_PATTERN = /(\S+?)<([^|<>]+)\|([^|<>]+)\|([^|<>]+)\|([^<>]+)>/g;

function parseInterlinearVerseLine(
  line: string,
  bookId: ReaderBookId
): { chapter: number; verse: number; tokens: VerseInterlinearToken[] } | null {
  const tabIndex = line.indexOf("\t");
  if (tabIndex === -1) return null;

  const reference = line.slice(0, tabIndex).trim();
  const match = reference.match(new RegExp(`^${bookId}\\s+(\\d+):(\\d+)$`, "i"));
  if (!match) return null;

  const tokens: VerseInterlinearToken[] = [];
  for (const tokenMatch of line.slice(tabIndex + 1).matchAll(INTERLINEAR_TOKEN_PATTERN)) {
    const [, surface, lemma, strongs, morph, gloss] = tokenMatch;
    tokens.push({ surface, lemma, strongs, morph, gloss: gloss.replace(/·/g, " ") });
  }

  return { chapter: Number(match[1]), verse: Number(match[2]), tokens };
}

const interlinearCache = new Map<ReaderBookId, Map<string, VerseInterlinearToken[]>>();
const bookDataCache = new Map<ReaderBookId, BookMorphData>();
const interlinearPending = new Map<ReaderBookId, Promise<Map<string, VerseInterlinearToken[]>>>();
const bookDataPending = new Map<ReaderBookId, Promise<BookMorphData>>();

async function loadVerseInterlinearMap(
  bookId: ReaderBookId
): Promise<Map<string, VerseInterlinearToken[]>> {
  const cached = interlinearCache.get(bookId);
  if (cached) return cached;

  const pending = interlinearPending.get(bookId);
  if (pending) return pending;

  const promise = (async () => {
    const map = new Map<string, VerseInterlinearToken[]>();
    const raw = await loadInterlinearRaw(bookId);
    for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
      if (!line.trim()) continue;
      const parsed = parseInterlinearVerseLine(line, bookId);
      if (parsed) map.set(`${parsed.chapter}:${parsed.verse}`, parsed.tokens);
    }
    interlinearCache.set(bookId, map);
    interlinearPending.delete(bookId);
    return map;
  })();
  interlinearPending.set(bookId, promise);
  return promise;
}

/** Prime interlinear cache for a book (call before sync getVerseInterlinear). */
export async function ensureVerseInterlinear(bookId: ReaderBookId): Promise<void> {
  await loadVerseInterlinearMap(bookId);
}

export function getVerseInterlinear(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): VerseInterlinearToken[] {
  return interlinearCache.get(bookId)?.get(`${chapter}:${verse}`) ?? [];
}

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

  if (["1", "2", "3"].includes(person) && number) {
    return `V-${tense}${voice}${mood}-${person}${number}`;
  }
  return `V-${tense}${voice}${mood}`;
}

function declinedRmac(prefix: string, morph: string, lemma = ""): string {
  const pronounPerson: Record<string, string> = {
    "ἐγώ": "1",
    "σύ": "2",
    "ἡμεῖς": "1",
    "ὑμεῖς": "2",
    "αὐτός": "3",
    "ἑαυτοῦ": "3",
    "ἑαυτός": "3"
  };

  if (prefix === "P" && pronounPerson[lemma]) {
    const suffix = declensionSuffix(morph, true);
    return suffix ? `P-${pronounPerson[lemma]}${suffix}${degreeSuffix(morph)}` : prefix;
  }

  const suffix = declensionSuffix(morph);
  return suffix ? `${prefix}-${suffix}${degreeSuffix(morph)}` : prefix;
}

function morphGntToRmac(morph: string, lemma = ""): string {
  if (!morph || morph === "-") return morph;
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

const RMAC_CASE_NAMES: Record<string, string> = { N: "nominative", G: "genitive", D: "dative", A: "accusative", V: "vocative" };
const RMAC_NUMBER_NAMES: Record<string, string> = { S: "singular", P: "plural" };
const RMAC_GENDER_NAMES: Record<string, string> = { M: "masculine", F: "feminine", N: "neuter" };
const RMAC_TENSE_NAMES: Record<string, string> = { P: "present", I: "imperfect", F: "future", A: "aorist", X: "perfect", Y: "pluperfect" };
const RMAC_VOICE_NAMES: Record<string, string> = { A: "active", M: "middle", P: "passive", E: "middle/passive" };
const RMAC_MOOD_NAMES: Record<string, string> = { I: "indicative", S: "subjunctive", O: "optative", M: "imperative", N: "infinitive", P: "participle" };
const RMAC_PERSON_NAMES: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd" };
const RMAC_DEGREE_NAMES: Record<string, string> = { C: "comparative", S: "superlative" };
const RMAC_POS_NAMES: Record<string, string> = {
  N: "Noun",
  A: "Adjective",
  T: "Article",
  D: "Demonstrative pronoun",
  I: "Interrogative/indefinite pronoun",
  R: "Relative pronoun",
  P: "Personal/reflexive pronoun",
  CONJ: "Conjunction",
  ADV: "Adverb",
  INJ: "Interjection",
  PREP: "Preposition",
  PRT: "Particle"
};

/**
 * Decodes an already-computed RMAC/Robinson tag (this file's own output —
 * see morphGntToRmac) back into a plain-English gloss for a hover tooltip,
 * e.g. "V-AAM-3S" -> "Verb-aorist, active, imperative - 3rd person singular".
 * Never throws on an unrecognized shape — falls back to the raw code.
 */
export function describeRmac(rmac: string): string {
  if (!rmac) return "";

  if (rmac.startsWith("V-")) {
    const [main, personNumber] = rmac.slice(2).split("-");
    if (!main || main.length < 3) return rmac;
    const tense = RMAC_TENSE_NAMES[main[0]] ?? main[0];
    const voice = RMAC_VOICE_NAMES[main[1]] ?? main[1];
    const mood = RMAC_MOOD_NAMES[main[2]] ?? main[2];
    let result = `Verb-${tense}, ${voice}, ${mood}`;
    if (personNumber && personNumber.length >= 2) {
      const person = RMAC_PERSON_NAMES[personNumber[0]] ?? personNumber[0];
      const number = RMAC_NUMBER_NAMES[personNumber[1]] ?? personNumber[1];
      result += ` - ${person} person ${number}`;
    }
    return result;
  }

  if (rmac in RMAC_POS_NAMES && !rmac.includes("-")) {
    return RMAC_POS_NAMES[rmac];
  }

  const declMatch = rmac.match(/^([NATDIRP])-(.+)$/);
  if (declMatch) {
    const [, posLetter, rawSuffix] = declMatch;
    const posName = RMAC_POS_NAMES[posLetter] ?? posLetter;

    let core = rawSuffix;
    let degree = "";
    const degreeMatch = core.match(/-(C|S)$/);
    if (degreeMatch) {
      degree = RMAC_DEGREE_NAMES[degreeMatch[1]] ?? "";
      core = core.slice(0, -2);
    }

    if (posLetter === "P") {
      const personMatch = core.match(/^([123])(.+)$/);
      if (personMatch) {
        const [, person, rest] = personMatch;
        const grammaticalCase = RMAC_CASE_NAMES[rest[0]] ?? rest[0];
        const number = RMAC_NUMBER_NAMES[rest[1]] ?? rest[1];
        const gender = rest[2] ? RMAC_GENDER_NAMES[rest[2]] : null;
        return `${posName}-${RMAC_PERSON_NAMES[person] ?? person} person, ${grammaticalCase}, ${number}${gender ? ", " + gender : ""}`;
      }
    }

    const grammaticalCase = RMAC_CASE_NAMES[core[0]] ?? core[0];
    const number = RMAC_NUMBER_NAMES[core[1]] ?? core[1];
    const gender = core[2] ? RMAC_GENDER_NAMES[core[2]] : null;
    let result = `${posName}-${grammaticalCase}, ${number}${gender ? ", " + gender : ""}`;
    if (degree) result += `, ${degree}`;
    return result;
  }

  return rmac;
}

export async function loadBookData(bookId: ReaderBookId): Promise<BookMorphData> {
  const cached = bookDataCache.get(bookId);
  if (cached) return cached;

  const pending = bookDataPending.get(bookId);
  if (pending) return pending;

  const promise = (async () => {
    const displayName = getReaderBookInfo(bookId).displayName;
    const verses = new Map<string, GreekVerse>();
    const [morphRaw, tokensRaw, nblaRaw] = await Promise.all([
      loadMorphRaw(bookId),
      loadTokensRaw(bookId),
      loadNblaRaw(bookId),
      loadVerseInterlinearMap(bookId)
    ]);

    morphRaw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .forEach((line, index) => {
        const token = parseMorphLine(line.trim(), index);
        if (!token) return;

        const key = `${token.chapter}:${token.verse}`;
        const verse =
          verses.get(key) ??
          {
            chapter: token.chapter,
            verse: token.verse,
            label: `${displayName} ${token.chapter}:${token.verse}`,
            tokens: []
          };

        token.token = verse.tokens.length + 1;
        verse.tokens.push(token);
        verses.set(key, verse);
      });

    const byChapter = new Map<number, GreekVerse[]>();
    for (const verse of verses.values()) {
      const chapter = byChapter.get(verse.chapter) ?? [];
      chapter.push(verse);
      byChapter.set(verse.chapter, chapter);
    }

    const data: BookMorphData = {
      alignment: tokensRaw
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map(line => parseAlignmentLine(line.trim(), bookId))
        .filter((token): token is AlignmentToken => Boolean(token)),
      greek: Array.from(byChapter.entries()),
      spanish: parseNblaContent(nblaRaw)
    };
    bookDataCache.set(bookId, data);
    bookDataPending.delete(bookId);
    return data;
  })();
  bookDataPending.set(bookId, promise);
  return promise;
}

export async function loadTitusData(): Promise<BookMorphData> {
  return loadBookData("tito");
}
