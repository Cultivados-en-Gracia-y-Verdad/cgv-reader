import type { ReaderBookId } from "@cgv/core";
import { getWorkshopBookId } from "./workshop-book";
import { loadLbfAlignmentRaw } from "./book-assets";

/**
 * Greek (MorphGNT/BLE token number) → LBF Spanish word index.
 *
 * LBF is the Spanish surface for Observer's reverse/outcome reading.
 * The Greek workstation spine stays MorphGNT so brick marks / clause ids keep working.
 */

export interface LbfAlignmentRecord {
  chapter: number;
  verse: number;
  token: number;
  greekSurface: string;
  lbfSurface: string;
  lbfWordIndex: number;
}

interface RawAlignmentFile {
  records: LbfAlignmentRecord[];
}

const cacheByBook = new Map<
  string,
  {
    raw: string;
    byVerse: Map<string, Map<number, number>>;
    surfacesByVerse: Map<string, Map<number, string>>;
  }
>();

function ensureCaches(bookId: ReaderBookId = getWorkshopBookId()): void {
  const raw = loadLbfAlignmentRaw(bookId);
  const cached = cacheByBook.get(bookId);
  if (cached && cached.raw === raw) return;

  const data = JSON.parse(raw) as RawAlignmentFile;
  const byVerse = new Map<string, Map<number, number>>();
  const surfaces = new Map<string, Map<number, string>>();

  for (const record of data.records ?? []) {
    const key = `${record.chapter}:${record.verse}`;
    const indexMap = byVerse.get(key) ?? new Map<number, number>();
    const surfaceMap = surfaces.get(key) ?? new Map<number, string>();
    indexMap.set(record.token, record.lbfWordIndex);
    surfaceMap.set(record.token, record.lbfSurface);
    byVerse.set(key, indexMap);
    surfaces.set(key, surfaceMap);
  }

  cacheByBook.set(bookId, { raw, byVerse, surfacesByVerse: surfaces });
}

/** token number → LBF word index for one verse */
export function loadLbfTokenWordMap(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): Map<number, number> {
  ensureCaches(bookId);
  return cacheByBook.get(bookId)!.byVerse.get(`${chapter}:${verse}`) ?? new Map();
}

/** token number → LBF surface string for one verse */
export function loadLbfTokenSurfaces(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): Map<number, string> {
  ensureCaches(bookId);
  return cacheByBook.get(bookId)!.surfacesByVerse.get(`${chapter}:${verse}`) ?? new Map();
}

export function findWordIndexBySurface(
  words: { index: number; text: string }[],
  targetSurface: string
): number | null {
  const wanted = normalizeSpanish(targetSurface);
  const match = words.find(word => normalizeSpanish(word.text) === wanted);
  return match ? match.index : null;
}

/**
 * LBF often stores a multi-word Spanish phrase for one Greek token
 * ("son guardados" for φρουρουμένους). Whitespace tokenization splits that
 * phrase, and the recorded index may land on an edge word.
 *
 * - `last` (default): last content word.
 * - `finite`: conjugated Spanish verb (*respondía con insultos* → *respondía*;
 *   *lo soportan* → *soportan*).
 * - `participle`: participial head, stopping before a trailing PP
 *   (*muertos a los pecados* → *muertos*; *siendo golpeados* → *golpeados*).
 */
export function resolveLbfPhraseWordIndex(
  words: { index: number; text: string }[],
  recordedIndex: number | undefined,
  lbfSurface: string | undefined,
  prefer: "first" | "last" | "finite" | "participle" = "last"
): number | undefined {
  if (recordedIndex === undefined) return undefined;
  if (!lbfSurface) return recordedIndex;
  const parts = lbfSurface
    .trim()
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return recordedIndex;

  const lastWanted = normalizeSpanish(parts[parts.length - 1] ?? "");
  if (!lastWanted) return recordedIndex;

  const endWord =
    words.find(word => word.index >= recordedIndex && normalizeSpanish(word.text) === lastWanted) ??
    words.find(word => word.index <= recordedIndex && normalizeSpanish(word.text) === lastWanted);
  if (!endWord) return recordedIndex;

  const startIndex = endWord.index - (parts.length - 1);
  if (startIndex < 0) return recordedIndex;

  const phraseWords: { index: number; text: string }[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const word = words.find(candidate => candidate.index === startIndex + i);
    if (!word || normalizeSpanish(word.text) !== normalizeSpanish(parts[i] ?? "")) {
      return recordedIndex;
    }
    phraseWords.push(word);
  }

  if (prefer === "first") return phraseWords[0]?.index ?? recordedIndex;
  if (prefer === "last") return endWord.index;

  if (prefer === "finite") {
    // haber + participle (*han vuelto*): prefer the participle head, not the aux.
    if (phraseWords.length >= 2) {
      const head = phraseWords[0]!;
      const tail = phraseWords[phraseWords.length - 1]!;
      if (isSpanishHaberForm(head.text) && looksLikeSpanishParticipleForm(tail.text)) {
        return tail.index;
      }
    }
    const finiteHit = phraseWords.find(word => looksLikeSpanishFiniteForm(word.text));
    return finiteHit?.index ?? endWord.index;
  }

  // participle: ignore a trailing prepositional complement (*a los pecados*).
  const prepAt = phraseWords.findIndex(word => isSpanishPreposition(word.text));
  const search = prepAt > 0 ? phraseWords.slice(0, prepAt) : phraseWords;
  const participleHits = search.filter(word => looksLikeSpanishParticipleForm(word.text));
  if (participleHits.length) return participleHits[participleHits.length - 1]!.index;
  return search[search.length - 1]?.index ?? endWord.index;
}

function isSpanishHaberForm(text: string): boolean {
  return /^(he|has|ha|han|hemos|habeis|habia|habias|habian|habiamos|hubo|hubieron|haya|hayan|habre|habran)$/.test(
    normalizeSpanish(text)
  );
}

function isSpanishPreposition(text: string): boolean {
  return /^(a|al|de|del|en|con|por|para|sin|sobre|ante|bajo|entre|hacia|hasta|segun)$/.test(
    normalizeSpanish(text)
  );
}

/** Prefer a conjugated Spanish head over clitics / nouns in a multi-word gloss. */
function looksLikeSpanishFiniteForm(text: string): boolean {
  const n = normalizeSpanish(text);
  if (!n || n.length < 2) return false;
  if (
    /^(lo|la|los|las|le|les|me|te|se|nos|os|el|un|una|unos|unas|de|del|al|a|en|con|por|para|sin|y|o|que|no|si|cuando|pues|pero)$/.test(
      n
    )
  ) {
    return false;
  }
  if (
    /^(es|son|soy|somos|fue|fueron|era|eran|hay|he|ha|han|hemos|sea|sean|esta|estan|estoy|estamos)$/.test(n)
  ) {
    return true;
  }
  return /(aba|abas|aban|abamos|ia|ias|ian|iamos|aron|ieron|aste|iste|amos|ais|an|en|io|ara|era|ira|aria|eria|iria)$/.test(
    n
  );
}

function looksLikeSpanishParticipleForm(text: string): boolean {
  const n = normalizeSpanish(text);
  if (!n || n.length < 3) return false;
  if (isSpanishPreposition(text)) return false;
  if (/^(lo|la|los|las|el|un|una|unos|unas|y|o|que|no|si)$/.test(n)) return false;
  return /(ado|ados|ada|adas|ido|idos|ida|idas|ando|endo|iendo|iendo|to|tos|ta|tas|so|sos|cho|chos|muerto|muertos)$/.test(
    n
  );
}

function normalizeSpanish(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
