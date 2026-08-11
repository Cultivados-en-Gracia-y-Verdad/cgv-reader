import type { ReaderBookId } from "@cgv/core";
import { getWorkshopBookId } from "./workshop-book";
import { loadLbfAlignmentRaw, loadLbfRaw } from "./book-assets";

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
  /** Discontinuous Spanish indices when word order differs (OT hand-align). */
  lbfWordIndexes?: number[];
  /** Canonical source-token id when loaded from an OSHB reverse-link artifact. */
  sourceTokenId?: string;
  /** Canonical Spanish alignment-unit id when loaded from an OSHB reverse-link artifact. */
  unitId?: string;
  charStart?: number;
  charEnd?: number;
}

export interface LbfSourceTokenUnit {
  sourceTokenId: string;
  unitId: string;
  surface: string;
  charStart: number;
  charEnd: number;
  lbfWordIndex: number;
  lbfWordIndexes: number[];
}

interface RawAlignmentFile {
  records: LbfAlignmentRecord[];
}

interface ReverseLinkUnit {
  unitId?: string;
  surface: string;
  charStart: number;
  charEnd: number;
  sourceTokenIds: string[];
}

interface ReverseLinkRecord {
  reference: string;
  units: ReverseLinkUnit[];
}

interface ReverseLinkFile {
  links: ReverseLinkRecord[];
}

const cacheByBook = new Map<
  string,
  {
    raw: string;
    byVerse: Map<string, Map<number, number>>;
    surfacesByVerse: Map<string, Map<number, string>>;
    indexesByVerse: Map<string, Map<number, number[]>>;
    sourceUnitsByVerse: Map<string, Map<string, LbfSourceTokenUnit[]>>;
  }
>();

function ensureCaches(bookId: ReaderBookId = getWorkshopBookId()): void {
  const raw = loadLbfAlignmentRaw(bookId);
  const cached = cacheByBook.get(bookId);
  if (cached && cached.raw === raw) return;

  const parsed = JSON.parse(raw) as RawAlignmentFile | ReverseLinkFile | (RawAlignmentFile & ReverseLinkFile);
  const hasReverseLinks = "links" in parsed && Array.isArray(parsed.links);
  const records = hasReverseLinks ? reverseLinksToRecords(parsed, bookId) : "records" in parsed ? parsed.records ?? [] : [];
  const byVerse = new Map<string, Map<number, number>>();
  const surfaces = new Map<string, Map<number, string>>();
  const indexes = new Map<string, Map<number, number[]>>();
  const sourceUnits = hasReverseLinks ? reverseLinksToSourceUnits(parsed, bookId) : recordsToSourceUnits(records);

  for (const record of records) {
    const key = `${record.chapter}:${record.verse}`;
    const indexMap = byVerse.get(key) ?? new Map<number, number>();
    const surfaceMap = surfaces.get(key) ?? new Map<number, string>();
    const multiMap = indexes.get(key) ?? new Map<number, number[]>();
    indexMap.set(record.token, record.lbfWordIndex);
    surfaceMap.set(record.token, record.lbfSurface);
    if (record.lbfWordIndexes?.length) {
      multiMap.set(record.token, [...record.lbfWordIndexes]);
    }
    byVerse.set(key, indexMap);
    surfaces.set(key, surfaceMap);
    indexes.set(key, multiMap);
  }

  if (hasReverseLinks) {
    applyReverseLinkUnitSurfaces(sourceUnits, byVerse, surfaces, indexes);
  }

  cacheByBook.set(bookId, {
    raw,
    byVerse,
    surfacesByVerse: surfaces,
    indexesByVerse: indexes,
    sourceUnitsByVerse: sourceUnits
  });
}

function applyReverseLinkUnitSurfaces(
  sourceUnits: Map<string, Map<string, LbfSourceTokenUnit[]>>,
  byVerse: Map<string, Map<number, number>>,
  surfaces: Map<string, Map<number, string>>,
  indexes: Map<string, Map<number, number[]>>
): void {
  for (const [verseKey, tokenUnits] of sourceUnits) {
    const indexMap = byVerse.get(verseKey) ?? new Map<number, number>();
    const surfaceMap = surfaces.get(verseKey) ?? new Map<number, string>();
    const multiMap = indexes.get(verseKey) ?? new Map<number, number[]>();

    for (const [sourceTokenId, units] of tokenUnits) {
      const parsed = tokenFromSourceTokenId(sourceTokenId);
      if (!parsed || !units.length) continue;
      const orderedUnits = [...units].sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd);
      const indexesForToken = Array.from(
        new Set(orderedUnits.flatMap(unit => (unit.lbfWordIndexes.length ? unit.lbfWordIndexes : [unit.lbfWordIndex])))
      ).sort((a, b) => a - b);
      const surface = Array.from(new Set(orderedUnits.map(unit => unit.surface))).join(" / ");
      indexMap.set(parsed.token, orderedUnits[orderedUnits.length - 1]!.lbfWordIndex);
      surfaceMap.set(parsed.token, surface);
      if (indexesForToken.length) multiMap.set(parsed.token, indexesForToken);
    }

    byVerse.set(verseKey, indexMap);
    surfaces.set(verseKey, surfaceMap);
    indexes.set(verseKey, multiMap);
  }
}

function reverseLinksToRecords(data: ReverseLinkFile, bookId: ReaderBookId): LbfAlignmentRecord[] {
  const lbf = loadLbfVerses(bookId);
  const records = new Map<string, LbfAlignmentRecord>();

  for (const link of data.links ?? []) {
    const ref = link.reference.match(/(\d+):(\d+)$/);
    if (!ref) continue;
    const chapter = Number(ref[1]);
    const verse = Number(ref[2]);
    const text = lbf.get(`${chapter}:${verse}`);
    if (!text) continue;
    const words = wordsWithSpans(text);

    for (const unit of link.units ?? []) {
      const overlapping = words.filter(word => word.start < unit.charEnd && word.end > unit.charStart);
      const anchorWords = overlapping.length ? overlapping : findUnitWords(words, unit.surface);
      if (!anchorWords.length) continue;
      const anchor = preferFirstWord(anchorWords[0]?.text ?? "") ? anchorWords[0]!.index : anchorWords[anchorWords.length - 1]!.index;

      for (const sourceTokenId of unit.sourceTokenIds ?? []) {
        const token = tokenFromSourceTokenId(sourceTokenId);
        if (!token || token.chapter !== chapter || token.verse !== verse) continue;
        records.set(`${chapter}:${verse}:${token.token}`, {
          chapter,
          verse,
          token: token.token,
          greekSurface: sourceTokenId,
          lbfSurface: unit.surface,
          lbfWordIndex: anchor,
          sourceTokenId,
          unitId: unit.unitId,
          charStart: unit.charStart,
          charEnd: unit.charEnd
        });
      }
    }
  }

  return Array.from(records.values()).sort((a, b) => a.chapter - b.chapter || a.verse - b.verse || a.token - b.token);
}

function reverseLinksToSourceUnits(data: ReverseLinkFile, bookId: ReaderBookId): Map<string, Map<string, LbfSourceTokenUnit[]>> {
  const lbf = loadLbfVerses(bookId);
  const byVerse = new Map<string, Map<string, LbfSourceTokenUnit[]>>();

  for (const link of data.links ?? []) {
    const ref = link.reference.match(/(\d+):(\d+)$/);
    if (!ref) continue;
    const chapter = Number(ref[1]);
    const verse = Number(ref[2]);
    const text = lbf.get(`${chapter}:${verse}`);
    if (!text) continue;
    const words = wordsWithSpans(text);
    const verseKey = `${chapter}:${verse}`;
    const tokenUnits = byVerse.get(verseKey) ?? new Map<string, LbfSourceTokenUnit[]>();

    for (const unit of link.units ?? []) {
      const overlapping = words.filter(word => word.start < unit.charEnd && word.end > unit.charStart);
      const anchorWords = overlapping.length ? overlapping : findUnitWords(words, unit.surface);
      if (!anchorWords.length) continue;
      const anchor = preferFirstWord(anchorWords[0]?.text ?? "") ? anchorWords[0]!.index : anchorWords[anchorWords.length - 1]!.index;
      const wordIndexes = anchorWords.map(word => word.index);

      for (const sourceTokenId of unit.sourceTokenIds ?? []) {
        const token = tokenFromSourceTokenId(sourceTokenId);
        if (!token || token.chapter !== chapter || token.verse !== verse) continue;
        const entries = tokenUnits.get(sourceTokenId) ?? [];
        entries.push({
          sourceTokenId,
          unitId: unit.unitId ?? "",
          surface: unit.surface,
          charStart: unit.charStart,
          charEnd: unit.charEnd,
          lbfWordIndex: anchor,
          lbfWordIndexes: wordIndexes
        });
        tokenUnits.set(sourceTokenId, entries);
      }
    }

    byVerse.set(verseKey, tokenUnits);
  }

  return byVerse;
}

function recordsToSourceUnits(records: LbfAlignmentRecord[]): Map<string, Map<string, LbfSourceTokenUnit[]>> {
  const byVerse = new Map<string, Map<string, LbfSourceTokenUnit[]>>();
  for (const record of records) {
    const sourceTokenId = record.sourceTokenId ?? record.greekSurface;
    const key = `${record.chapter}:${record.verse}`;
    const tokenUnits = byVerse.get(key) ?? new Map<string, LbfSourceTokenUnit[]>();
    const entries = tokenUnits.get(sourceTokenId) ?? [];
    entries.push({
      sourceTokenId,
      unitId: record.unitId ?? "",
      surface: record.lbfSurface,
      charStart: record.charStart ?? -1,
      charEnd: record.charEnd ?? -1,
      lbfWordIndex: record.lbfWordIndex,
      lbfWordIndexes: record.lbfWordIndexes ?? [record.lbfWordIndex]
    });
    tokenUnits.set(sourceTokenId, entries);
    byVerse.set(key, tokenUnits);
  }
  return byVerse;
}

function loadLbfVerses(bookId: ReaderBookId): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of loadLbfRaw(bookId).replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(/^\s*.+?\s+(\d+):(\d+)\s+(.+?)\s*$/);
    if (match) {
      map.set(`${Number(match[1])}:${Number(match[2])}`, match[3].trim());
    }
  }
  return map;
}

function wordsWithSpans(text: string): Array<{ text: string; start: number; end: number; index: number }> {
  const out: Array<{ text: string; start: number; end: number; index: number }> = [];
  const pattern = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]*/gu;
  for (const match of text.matchAll(pattern)) {
    out.push({
      text: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      index: out.length
    });
  }
  return out;
}

function findUnitWords(
  words: Array<{ text: string; start: number; end: number; index: number }>,
  surface: string
): Array<{ text: string; start: number; end: number; index: number }> {
  const parts = surface.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]*/gu)?.map(normalizeSpanish) ?? [];
  if (!parts.length) return [];
  for (let i = 0; i <= words.length - parts.length; i += 1) {
    const window = words.slice(i, i + parts.length).map(word => normalizeSpanish(word.text));
    if (window.every((part, index) => part === parts[index])) return words.slice(i, i + parts.length);
  }
  return [];
}

function tokenFromSourceTokenId(id: string): { chapter: number; verse: number; token: number } | null {
  const match = id.match(/^h\d{2}(\d{3})(\d{3})(\d{3})$/);
  if (!match) return null;
  const mtChapter = Number(match[1]);
  const mtVerse = Number(match[2]);
  const mapped = mtToProtestant(mtChapter, mtVerse);
  return { chapter: mapped.chapter, verse: mapped.verse, token: Number(match[3]) };
}

function mtToProtestant(chapter: number, verse: number): { chapter: number; verse: number } {
  if (chapter === 3 && verse >= 31) return { chapter: 4, verse: verse - 30 };
  if (chapter === 4) return { chapter: 4, verse: verse + 3 };
  if (chapter === 6 && verse === 1) return { chapter: 5, verse: 31 };
  if (chapter === 6 && verse >= 2) return { chapter: 6, verse: verse - 1 };
  return { chapter, verse };
}

function preferFirstWord(text: string): boolean {
  return /^(esta|estan|estoy|estamos|esteis|es|son|soy|somos|sois|sea|sean|ser|sera|seran|fue|fueron|fui|era|eran|hay|habra|vino|vinieron|dijo|dijeron|dio|hubo|habia|puso|busco|estuvo|estuvieron|sono|soño|respondio|mando|envio|llamo)$/u.test(
    normalizeSpanish(text)
  );
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

/** token number → all Spanish word indexes (discontinuous-aware). */
export function loadLbfTokenWordIndexes(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): Map<number, number[]> {
  ensureCaches(bookId);
  return cacheByBook.get(bookId)!.indexesByVerse.get(`${chapter}:${verse}`) ?? new Map();
}

/** sourceTokenId → canonical Spanish alignment unit(s) for one verse. */
export function loadLbfSourceTokenUnits(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): Map<string, LbfSourceTokenUnit[]> {
  ensureCaches(bookId);
  return cacheByBook.get(bookId)!.sourceUnitsByVerse.get(`${chapter}:${verse}`) ?? new Map();
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
  // Explicit 1sg presents that do not match the tense-ending list (*escribo*).
  if (/^(escribo|digo|hago|veo|tengo|vengo|pongo|salgo|oigo|conozco|parezco|ando|estoy)$/.test(n)) {
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
