import type { BibleVerse } from "cgv-bible";
import {
  getReaderBookInfo,
  workshopProgressKeys,
  type ReaderBookId
} from "@cgv/core";
import type { FrameType } from "./clause-signals";
import { loadLbfRaw, loadMorphRawSync, loadTokensRawSync } from "./book-assets";
import { loadLbfTokenSurfaces, loadLbfTokenWordMap } from "./lbf-alignment";
import { getWorkshopBookId } from "./workshop-book";

// The Clause Builder / Observer workshop reads LBF (La Biblia Fiel) as its
// Spanish surface — reverse-interlinear / settled reading. Greek workstation
// ids stay on MorphGNT/BLE so brick progress migrates. NBLA remains the main
// Reader text (see reader-data.ts).
function parseLbfContent(content: string, displayName: string): BibleVerse[] {
  const verses: BibleVerse[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let chapter: number | null = null;
  let verse: number | null = null;
  const buffer: string[] = [];

  function flush(): void {
    if (chapter === null || verse === null || buffer.length === 0) {
      buffer.length = 0;
      return;
    }
    const text = buffer.join(" ").trim();
    if (text) {
      verses.push({ book: displayName, chapter, verse, text });
    }
    buffer.length = 0;
  }

  for (const line of lines) {
    const chapterHeader = line.match(/^##\s+Capítulo\s+(\d+)/i);
    if (chapterHeader) {
      flush();
      chapter = Number(chapterHeader[1]);
      verse = null;
      continue;
    }

    const verseHeader = line.match(/^###\s+(\d+):(\d+)/);
    if (verseHeader) {
      flush();
      chapter = Number(verseHeader[1]);
      verse = Number(verseHeader[2]);
      continue;
    }

    if (!line.trim() || line.startsWith("#") || line.startsWith(">")) continue;
    if (chapter !== null && verse !== null) buffer.push(line.trim());
  }
  flush();
  return verses;
}

export interface SpanishWord {
  id: string;
  chapter: number;
  verse: number;
  index: number;
  text: string;
  finiteVerbId: string | null;
  dependentIntroducerId: string | null;
  greekSurface?: string;
  greekMorph?: string;
  greekLemma?: string;
  dependentGreekSurface?: string;
  startChar: number;
  endChar: number;
  /** Greek alignment id ("chapter:verse:token"), same format as finiteVerbId, when this word carries a participle. */
  participleId?: string;
  participleSurface?: string;
  participleLemma?: string;
  participleTense?: string;
  participleVoice?: string;
  participleCase?: string;
  participleNumber?: string;
  participleGender?: string;
  /** Only meaningful when participleCase is "G" — is the preceding Greek token a preposition? */
  participlePrecededByPreposition?: boolean;
  /** Greek alignment id when this word carries an infinitive (mood N) — mechanical morph lookup. */
  infinitiveId?: string;
  infinitiveSurface?: string;
  infinitiveLemma?: string;
}

export interface SpanishClauseVerse {
  chapter: number;
  verse: number;
  label: string;
  text: string;
  words: SpanishWord[];
}

interface FiniteAlignment {
  id: string;
  chapter: number;
  verse: number;
  token: number;
  greekSurface: string;
  greekMorph: string;
  greekLemma: string;
  spanishHint: string;
}

export interface ClauseAssignment {
  finiteVerbId: string;
  selectedSpan: string[];
  greekStartTokenId?: string;
  greekEndTokenId?: string;
  /**
   * Set only when a human has actually saved this clause through the
   * Greek-token interaction (clause-selection-greek-spec.md) — i.e. genuinely
   * re-walked and re-confirmed its boundary in Greek, not just carrying data
   * built under the old Spanish-selection flow. Undefined means "not yet
   * re-confirmed," regardless of whether auditGreekSpanConsistency finds it
   * internally consistent — that audit only proves the stored range matches
   * itself, not that a human has actually looked at it since the migration.
   */
  greekConfirmedAt?: string;
}

export type ClauseAssignments = Record<string, ClauseAssignment>;

export interface ClauseBeginningToken {
  id: string;
  greek: string;
  ble: string;
  lemma: string;
  morph: string;
}

export interface GreekClauseRange {
  greekStartTokenId: string;
  greekEndTokenId: string;
}

const WORD_PATTERN = /[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+/gu;
const DEPENDENT_INTRODUCER_SURFACES = new Set([
  "ἵνα",
  "ὅτι",
  "εἰ",
  "ἐάν",
  "ὅταν",
  "ἐπειδή",
  "ἐπεί",
  "καθώς",
  "ὡς",
  "πρίν"
]);

function progressKeys(bookId: ReaderBookId = getWorkshopBookId()) {
  return workshopProgressKeys(bookId);
}

/** @deprecated Prefer workshopProgressKeys(bookId).clauseAssignments — kept for older imports. */
export const CLAUSE_STORAGE_KEY = "the-reader:spanish-clause-builder:titus:v3";

function wordId(chapter: number, verse: number, index: number): string {
  return `${chapter}:${verse}:${index}`;
}

function finiteAlignmentId(chapter: number, verse: number, token: number): string {
  return `${chapter}:${verse}:${token}`;
}

function parseAlignmentId(id: string): { chapter: number; verse: number; token: number } | null {
  const [chapter, verse, token] = id.split(":").map(Number);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse) || !Number.isFinite(token)) return null;
  return { chapter, verse, token };
}

function stripGreekPunctuation(value: string): string {
  return value.replace(/[⸀⸁⸂⸃,.;·]/g, "");
}

// Every Greek token's MorphGNT-line id (e.g. "170201-253"), mapped to its
// "chapter:verse:token" alignment id — the same conversion every brick's
// marks go through, factored out so recipient groups (which carry Greek ids
// grouped by recipient, not a flat marked set) can reuse it too.
function buildGreekIdToAlignmentIdMap(bookId: ReaderBookId = getWorkshopBookId()): Map<string, string> {
  const map = new Map<string, string>();
  const verseTokenCounts = new Map<string, number>();
  const morphRaw = loadMorphRawSync(bookId);

  morphRaw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line, index) => {
      const match = line.trim().match(/^(\d{6})\s+/);
      if (!match) return;

      const reference = match[1];
      const chapter = Number(reference.slice(2, 4));
      const verse = Number(reference.slice(4, 6));
      const verseKey = `${chapter}:${verse}`;
      const token = (verseTokenCounts.get(verseKey) ?? 0) + 1;
      verseTokenCounts.set(verseKey, token);

      map.set(`${reference}-${index}`, finiteAlignmentId(chapter, verse, token));
    });

  return map;
}

export function readMarkedAlignmentIds(
  storageKey: string,
  bookId: ReaderBookId = getWorkshopBookId()
): Set<string> {
  let markedGreekIds: string[];

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    markedGreekIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return new Set();
  }

  if (!markedGreekIds.length) return new Set();

  const greekIdToAlignmentId = buildGreekIdToAlignmentIdMap(bookId);
  const alignmentIds = new Set<string>();
  for (const greekId of markedGreekIds) {
    const alignmentId = greekIdToAlignmentId.get(greekId);
    if (alignmentId) alignmentIds.add(alignmentId);
  }

  return alignmentIds;
}

// Brick 2B keeps its original purpose — who an imperative is addressed to —
// stored as { id, recipient, tokenIds: Greek MorphGNT-line ids }[]. Read-only
// here: this converts to alignment ids and flattens to one label per clause,
// for the Sequence view to display; it never writes to this key.
export function readCommandRecipientAssignments(
  bookId: ReaderBookId = getWorkshopBookId()
): Map<string, string> {
  const assignments = new Map<string, string>();
  const storageKey = progressKeys(bookId).commandRecipients;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return assignments;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return assignments;

    const greekIdToAlignmentId = buildGreekIdToAlignmentIdMap(bookId);
    for (const group of parsed) {
      if (!group || typeof group !== "object") continue;
      const record = group as { recipient?: unknown; tokenIds?: unknown };
      if (typeof record.recipient !== "string" || !record.recipient.trim() || !Array.isArray(record.tokenIds)) continue;
      for (const tokenId of record.tokenIds) {
        if (typeof tokenId !== "string") continue;
        const alignmentId = greekIdToAlignmentId.get(tokenId);
        if (alignmentId) assignments.set(alignmentId, record.recipient);
      }
    }
  } catch {
    return assignments;
  }

  return assignments;
}

function readFiniteMarkedAlignmentIds(bookId: ReaderBookId): Set<string> {
  return readMarkedAlignmentIds(progressKeys(bookId).finiteMarks, bookId);
}

function readDependentIntroducerMarkedAlignmentIds(bookId: ReaderBookId): Set<string> {
  return readMarkedAlignmentIds(progressKeys(bookId).dependentIntroducers, bookId);
}

function tokenizeVerse(verse: BibleVerse): SpanishWord[] {
  const words: SpanishWord[] = [];
  let index = 0;
  const pattern = new RegExp(WORD_PATTERN.source, WORD_PATTERN.flags);

  for (let match = pattern.exec(verse.text); match; match = pattern.exec(verse.text)) {
    const piece = match[0];
    if (!/[\wáéíóúüñÁÉÍÓÚÜÑ]/i.test(piece)) continue;
    words.push({
      id: wordId(verse.chapter, verse.verse, index),
      chapter: verse.chapter,
      verse: verse.verse,
      index,
      text: piece,
      finiteVerbId: null,
      dependentIntroducerId: null,
      startChar: match.index,
      endChar: match.index + piece.length
    });
    index += 1;
  }

  return words;
}

function parseFiniteAlignments(bookId: ReaderBookId = getWorkshopBookId()): FiniteAlignment[] {
  const tokensRaw = loadTokensRawSync(bookId);
  return tokensRaw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .filter(row => {
      return (
        row.book === bookId &&
        typeof row.ch === "number" &&
        typeof row.vs === "number" &&
        typeof row.tok === "number" &&
        typeof row.surface === "string" &&
        typeof row.morph === "string" &&
        typeof row.es === "string" &&
        /^V-[123]/.test(row.morph)
      );
    })
    .map(row => ({
      id: finiteAlignmentId(row.ch as number, row.vs as number, row.tok as number),
      chapter: row.ch as number,
      verse: row.vs as number,
      token: row.tok as number,
      greekSurface: row.surface as string,
      greekMorph: row.morph as string,
      greekLemma: typeof row.lemma === "string" ? row.lemma : "",
      spanishHint: row.es as string
    }));
}

function parseTokenAlignments(bookId: ReaderBookId = getWorkshopBookId()): FiniteAlignment[] {
  const tokensRaw = loadTokensRawSync(bookId);
  return tokensRaw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .filter(row => {
      return (
        row.book === bookId &&
        typeof row.ch === "number" &&
        typeof row.vs === "number" &&
        typeof row.tok === "number" &&
        typeof row.surface === "string" &&
        typeof row.morph === "string" &&
        typeof row.es === "string"
      );
    })
    .map(row => ({
      id: finiteAlignmentId(row.ch as number, row.vs as number, row.tok as number),
      chapter: row.ch as number,
      verse: row.vs as number,
      token: row.tok as number,
      greekSurface: row.surface as string,
      greekMorph: row.morph as string,
      greekLemma: typeof row.lemma === "string" ? row.lemma : "",
      spanishHint: row.es as string
    }));
}

// MorphGNT's verb tag is "V-" + 8 chars: person, tense, voice, mood, case,
// number, gender, degree. Finite verbs carry a person digit in slot 0 and no
// case/number/gender; participles carry "-" for person and mood "P", with
// case/number/gender filled in since they decline like adjectives. Pure
// morphology lookup — same mechanical certainty as Brick 1's finite-verb
// detection, no judgment involved in deciding whether a token is one.
function isParticipleMorph(morph: string): boolean {
  return morph.startsWith("V-") && morph[5] === "P";
}

/** MorphGNT mood slot N — infinitive (e.g. V--PAN---- εἶναι). */
export function isInfinitiveMorph(morph: string): boolean {
  return morph.startsWith("V-") && morph[5] === "N";
}

/**
 * Verses whose Greek text has no finite verb at all (e.g. Titus 1:1's long
 * verbless run of appositions) — computed from the Greek morphology directly,
 * independent of whether Brick 1 marking has reached that verse yet. These
 * are deliberately out of scope for the skeleton pass (spec: "Do not invent
 * a category for them now... leave them alone"); this only identifies them
 * so the app can show them as visibly excluded rather than silently absent.
 */
export function getVersesWithoutFiniteVerb(): Set<string> {
  const hasFiniteVerb = new Set<string>();
  const allVerses = new Set<string>();

  for (const alignment of parseTokenAlignments()) {
    const key = `${alignment.chapter}:${alignment.verse}`;
    allVerses.add(key);
    if (/^V-[123]/.test(alignment.greekMorph)) hasFiniteVerb.add(key);
  }

  const verbless = new Set<string>();
  for (const key of allVerses) {
    if (!hasFiniteVerb.has(key)) verbless.add(key);
  }
  return verbless;
}

/**
 * Greek-token-number -> LBF-word-index for one verse.
 * Lookup against the committed LBF alignment (see lbf-alignment.ts / data/lbf).
 */
export function buildVerseTokenWordMap(
  chapter: number,
  verse: number,
  _words: SpanishWord[],
  bookId: ReaderBookId = getWorkshopBookId()
): Map<number, number> {
  return new Map(loadLbfTokenWordMap(chapter, verse, bookId));
}

export function loadClauseVerses(bookId: ReaderBookId = getWorkshopBookId()): SpanishClauseVerse[] {
  const displayName = getReaderBookInfo(bookId).displayName;
  const verses = parseLbfContent(loadLbfRaw(bookId), displayName).map(verse => ({
    chapter: verse.chapter,
    verse: verse.verse,
    label: `${displayName} ${verse.chapter}:${verse.verse}`,
    text: verse.text,
    words: tokenizeVerse(verse)
  }));

  const verseByKey = new Map(verses.map(verse => [`${verse.chapter}:${verse.verse}`, verse]));
  const markedFiniteAlignmentIds = readFiniteMarkedAlignmentIds(bookId);
  const markedDependentIntroducerAlignmentIds = readDependentIntroducerMarkedAlignmentIds(bookId);
  const tokenWordMapCache = new Map<string, Map<number, number>>();

  function getTokenWordMap(chapter: number, verse: number, words: SpanishWord[]): Map<number, number> {
    const key = `${chapter}:${verse}`;
    const cached = tokenWordMapCache.get(key);
    if (cached) return cached;
    const map = buildVerseTokenWordMap(chapter, verse, words, bookId);
    tokenWordMapCache.set(key, map);
    return map;
  }

  // Two Greek tokens legitimately sharing one Spanish word index is expected
  // (a periphrastic construction collapsing into one LBF word) — but if
  // both tokens also carry the *same* marking category, the second write
  // would silently clobber the first's id and lose it from every downstream
  // view with no trace. Loud rather than silent: log it so a real collision
  // gets fixed, instead of one candidate just vanishing (see
  // participle-data-fixes-spec.md item 1).
  function warnOnIdCollision(
    word: SpanishWord,
    field: "finiteVerbId" | "dependentIntroducerId" | "participleId" | "infinitiveId",
    nextId: string
  ): void {
    const currentId = word[field];
    if (currentId && currentId !== nextId) {
      console.warn(`[clause-data] ${field} collision on word ${word.id}: had "${currentId}", now overwritten by "${nextId}"`);
    }
  }

  for (const alignment of parseFiniteAlignments(bookId)) {
    if (!markedFiniteAlignmentIds.has(alignment.id)) continue;

    const key = `${alignment.chapter}:${alignment.verse}`;
    const verse = verseByKey.get(key);
    if (!verse) continue;
    const wordIndex = getTokenWordMap(alignment.chapter, alignment.verse, verse.words).get(alignment.token);
    if (wordIndex === undefined) continue;
    const anchor = verse.words[wordIndex];
    warnOnIdCollision(anchor, "finiteVerbId", alignment.id);
    anchor.finiteVerbId = alignment.id;
    anchor.greekSurface = alignment.greekSurface;
    anchor.greekMorph = alignment.greekMorph;
    anchor.greekLemma = alignment.greekLemma;
  }

  for (const alignment of parseTokenAlignments(bookId)) {
    if (!markedDependentIntroducerAlignmentIds.has(alignment.id)) continue;
    if (!DEPENDENT_INTRODUCER_SURFACES.has(stripGreekPunctuation(alignment.greekSurface))) continue;

    const key = `${alignment.chapter}:${alignment.verse}`;
    const verse = verseByKey.get(key);
    if (!verse) continue;

    const wordIndex = getTokenWordMap(alignment.chapter, alignment.verse, verse.words).get(alignment.token);
    if (wordIndex === undefined) continue;
    const word = verse.words[wordIndex];
    if (!word) continue;
    warnOnIdCollision(word, "dependentIntroducerId", alignment.id);
    word.dependentIntroducerId = alignment.id;
    word.dependentGreekSurface = alignment.greekSurface;
  }

  // Participles: mechanical lookup, always on — no Brick-style marking step.
  // Morphology already gives certainty about which tokens are participles;
  // the observation exercise is sorting them (attributive/substantival/
  // circumstantial), not finding them.
  const allTokenAlignments = parseTokenAlignments(bookId);
  for (const alignment of allTokenAlignments) {
    if (!isParticipleMorph(alignment.greekMorph)) continue;

    const key = `${alignment.chapter}:${alignment.verse}`;
    const verse = verseByKey.get(key);
    if (!verse) continue;

    const wordIndex = getTokenWordMap(alignment.chapter, alignment.verse, verse.words).get(alignment.token);
    if (wordIndex === undefined) continue;
    const word = verse.words[wordIndex];
    if (!word) continue;

    warnOnIdCollision(word, "participleId", alignment.id);
    word.participleId = alignment.id;
    word.participleSurface = stripGreekPunctuation(alignment.greekSurface);
    word.participleLemma = alignment.greekLemma;
    word.participleTense = alignment.greekMorph[3];
    word.participleVoice = alignment.greekMorph[4];
    word.participleCase = alignment.greekMorph[6];
    word.participleNumber = alignment.greekMorph[7];
    word.participleGender = alignment.greekMorph[8];

    // Genitive-absolute check needs Greek word order (Spanish word order
    // doesn't preserve it) — look at the immediately preceding Greek token
    // in the same verse for a governing preposition (MorphGNT part-of-speech
    // "P").
    if (word.participleCase === "G") {
      const precedingToken = allTokenAlignments.find(
        candidate =>
          candidate.chapter === alignment.chapter &&
          candidate.verse === alignment.verse &&
          candidate.token === alignment.token - 1
      );
      word.participlePrecededByPreposition = precedingToken?.greekMorph.startsWith("P") ?? false;
    }
  }

  // Infinitives: same mechanical morph certainty as participles. Compiler lists
  // them under the host finite clause for now; a future O observation layer can
  // ask students to find them before they appear in the manual.
  for (const alignment of allTokenAlignments) {
    if (!isInfinitiveMorph(alignment.greekMorph)) continue;

    const key = `${alignment.chapter}:${alignment.verse}`;
    const verse = verseByKey.get(key);
    if (!verse) continue;

    const wordIndex = getTokenWordMap(alignment.chapter, alignment.verse, verse.words).get(alignment.token);
    if (wordIndex === undefined) continue;
    const word = verse.words[wordIndex];
    if (!word) continue;

    warnOnIdCollision(word, "infinitiveId", alignment.id);
    word.infinitiveId = alignment.id;
    word.infinitiveSurface = stripGreekPunctuation(alignment.greekSurface);
    word.infinitiveLemma = alignment.greekLemma;
  }

  return verses;
}

/** @deprecated Prefer loadClauseVerses(bookId). */
export function loadTitusClauseVerses(): SpanishClauseVerse[] {
  return loadClauseVerses("tito");
}

export function wordInSpan(word: SpanishWord, selectedSpan: string[] | null): boolean {
  return Boolean(selectedSpan?.includes(word.id));
}

export function spanFromRange(start: SpanishWord, end: SpanishWord): string[] | null {
  if (start.chapter !== end.chapter || start.verse !== end.verse) return null;
  const low = Math.min(start.index, end.index);
  const high = Math.max(start.index, end.index);
  const ids: string[] = [];
  for (let index = low; index <= high; index += 1) {
    ids.push(wordId(start.chapter, start.verse, index));
  }
  return ids;
}

export function formatClauseSpan(
  selectedSpan: string[],
  verseWords: SpanishWord[],
  verseText?: string
): string {
  const selected = selectedSpan
    .map(id => verseWords.find(word => word.id === id))
    .filter((word): word is SpanishWord => Boolean(word))
    .sort((a, b) => a.index - b.index);
  if (!selected.length) return "";

  if (verseText) {
    return verseText.slice(selected[0].startChar, selected[selected.length - 1].endChar);
  }

  return selected.map(word => word.text).join(" ");
}

export function getClauseBeginningTokens(
  range: GreekClauseRange | null
): ClauseBeginningToken[] {
  if (!range) return [];
  const start = parseAlignmentId(range.greekStartTokenId);
  const end = parseAlignmentId(range.greekEndTokenId);
  if (!start || !end || start.chapter !== end.chapter || start.verse !== end.verse) return [];

  const low = Math.min(start.token, end.token);
  const high = Math.max(start.token, end.token);

  return parseTokenAlignments()
    .filter(alignment => alignment.chapter === start.chapter && alignment.verse === start.verse)
    .filter(alignment => alignment.token >= low && alignment.token <= high)
    .map(alignment => ({
      id: alignment.id,
      greek: stripGreekPunctuation(alignment.greekSurface),
      lemma: alignment.greekLemma,
      morph: alignment.greekMorph,
      ble: alignment.spanishHint.replace(/·/g, " ")
    }))
    .slice(0, 12);
}

export function deriveGreekClauseRange(
  selectedSpan: string[],
  verseWords: SpanishWord[],
  finiteVerbId: string
): GreekClauseRange | null {
  const selectedIds = new Set(selectedSpan);
  const finiteVerbPosition = parseAlignmentId(finiteVerbId);
  const firstWord = verseWords.find(word => selectedIds.has(word.id));
  if (!firstWord || !finiteVerbPosition) return null;

  const verseTokens = parseTokenAlignments()
    .filter(alignment => alignment.chapter === firstWord.chapter && alignment.verse === firstWord.verse)
    .sort((a, b) => a.token - b.token);
  const finiteToken = verseTokens.find(alignment => alignment.id === finiteVerbId);
  if (!finiteToken) return null;

  const tokenWordMap = buildVerseTokenWordMap(firstWord.chapter, firstWord.verse, verseWords);
  const selectedTokenIds = verseTokens
    .filter(alignment => {
      if (alignment.id === finiteVerbId) return true;
      const wordIndex = tokenWordMap.get(alignment.token);
      if (wordIndex === undefined) return false;
      return selectedIds.has(wordId(alignment.chapter, alignment.verse, wordIndex));
    })
    .map(alignment => alignment.token);

  const previousBoundaryTokens = verseTokens
    .filter(alignment => alignment.token < finiteToken.token)
    .filter(alignment => /[,.;·]/.test(alignment.greekSurface) || /^V-[123]/.test(alignment.greekMorph));
  const previousBoundaryToken = previousBoundaryTokens[previousBoundaryTokens.length - 1];
  const startToken = Math.max((previousBoundaryToken?.token ?? 0) + 1, 1);
  const endToken = Math.max(...selectedTokenIds, finiteVerbPosition.token);

  return {
    greekStartTokenId: finiteAlignmentId(firstWord.chapter, firstWord.verse, startToken),
    greekEndTokenId: finiteAlignmentId(firstWord.chapter, firstWord.verse, endToken)
  };
}

/**
 * The reverse of deriveGreekClauseRange, and now the primary direction per
 * clause-selection-greek-spec.md: a student selects directly on Greek
 * tokens, and the Spanish span is derived from that selection for display
 * and for every downstream consumer (clause-tree.ts's noun-span containment,
 * Emphasis, Sequence, etc.) that already expects Spanish word ids — none of
 * that had to change shape, only which side is authoritative did. Fills the
 * gap between the lowest and highest mapped Spanish word index, same
 * contiguous-range behavior spanFromRange already uses for a Spanish
 * selection, so a Greek range that crosses a word with no direct Spanish
 * counterpart (a function word folded into an adjacent translation) still
 * produces one clean span rather than a hole in the middle.
 */
const RELATIVE_HEAD = new Set(["cual", "cuales", "quien", "quienes", "quién", "quiénes", "que"]);
const BEFORE_RELATIVE = new Set(["la", "el", "los", "las", "a", "lo"]);

function normalizeSpanishWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Greek relatives / idioms often map to multi-word LBF surfaces ("la cual",
 * "a quienes", "tapar la boca"). Alignment anchors one index; expand the
 * Spanish span to cover the whole phrase when the surface matches the verse.
 */
function expandAlignedPhrases(
  low: number,
  high: number,
  verseWords: SpanishWord[],
  chapter: number,
  verse: number,
  startToken: number,
  endToken: number,
  bookId: ReaderBookId
): { low: number; high: number } {
  const surfaces = loadLbfTokenSurfaces(chapter, verse, bookId);
  const tokenToWord = loadLbfTokenWordMap(chapter, verse, bookId);
  let nextLow = low;
  let nextHigh = high;

  for (let token = startToken; token <= endToken; token += 1) {
    const surface = surfaces.get(token);
    const anchor = tokenToWord.get(token);
    if (!surface || anchor === undefined) continue;
    const parts = surface
      .split(/\s+/)
      .map(normalizeSpanishWord)
      .filter(Boolean);
    if (parts.length < 2) continue;

    const anchorNorm = normalizeSpanishWord(verseWords[anchor]?.text ?? "");
    const partAt = parts.indexOf(anchorNorm);
    if (partAt < 0) continue;

    const phraseStart = anchor - partAt;
    const phraseEnd = phraseStart + parts.length - 1;
    if (phraseStart < 0 || phraseEnd >= verseWords.length) continue;

    let matches = true;
    for (let i = 0; i < parts.length; i += 1) {
      if (normalizeSpanishWord(verseWords[phraseStart + i]?.text ?? "") !== parts[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    nextLow = Math.min(nextLow, phraseStart);
    nextHigh = Math.max(nextHigh, phraseEnd);
  }

  // Fallback when surface is still a bare relative head ("cual") with article before it.
  const head = verseWords[nextLow];
  const previous = nextLow > 0 ? verseWords[nextLow - 1] : null;
  if (
    head &&
    previous &&
    RELATIVE_HEAD.has(normalizeSpanishWord(head.text)) &&
    BEFORE_RELATIVE.has(normalizeSpanishWord(previous.text))
  ) {
    nextLow -= 1;
  }

  return { low: nextLow, high: nextHigh };
}

export function deriveSpanishSpanFromGreekRange(
  chapter: number,
  verse: number,
  startToken: number,
  endToken: number,
  verseWords: SpanishWord[],
  bookId: ReaderBookId = getWorkshopBookId()
): string[] {
  const tokenToWord = buildVerseTokenWordMap(chapter, verse, verseWords, bookId);
  const wordIndexes = new Set<number>();
  for (let token = startToken; token <= endToken; token += 1) {
    const wordIndex = tokenToWord.get(token);
    if (wordIndex !== undefined) wordIndexes.add(wordIndex);
  }
  if (!wordIndexes.size) return [];

  let low = Math.min(...wordIndexes);
  let high = Math.max(...wordIndexes);
  ({ low, high } = expandAlignedPhrases(low, high, verseWords, chapter, verse, startToken, endToken, bookId));

  const ids: string[] = [];
  for (let index = low; index <= high; index += 1) {
    ids.push(wordId(chapter, verse, index));
  }
  return ids;
}

export interface GreekSpanAuditEntry {
  finiteVerbId: string;
  chapter: number;
  verse: number;
  /** Authoritative Greek boundary, if present. */
  storedRange: GreekClauseRange | null;
  /**
   * Spanish word ids implied by the stored Greek range (Greek → Spanish).
   * Compared to assignment.selectedSpan — not the old Spanish → Greek
   * re-derivation, which is lossy under LBF and made Save look like a no-op.
   */
  expectedSpanishSpan: string[];
  actualSpanishSpan: string[];
  mismatch: boolean;
}

function sameWordIdSpan(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

/**
 * Greek is authoritative (clause-selection-greek-spec.md). Flag a clause when
 * its stored Spanish selectedSpan no longer matches what the stored Greek
 * range maps to via LBF — e.g. after an alignment fix, or a pre-migration
 * Spanish span that never agreed with the Greek boundary. Read-only.
 *
 * Does **not** re-derive Greek from Spanish: that path uses punctuation /
 * finite-verb heuristics and cannot round-trip a student-chosen Greek range,
 * so Save would never clear the audit.
 */
export function auditGreekSpanConsistency(
  verses: SpanishClauseVerse[],
  assignments: ClauseAssignments,
  bookId: ReaderBookId = getWorkshopBookId()
): GreekSpanAuditEntry[] {
  const wordsByVerse = new Map<string, SpanishWord[]>();
  for (const verse of verses) wordsByVerse.set(`${verse.chapter}:${verse.verse}`, verse.words);

  const entries: GreekSpanAuditEntry[] = [];
  for (const [finiteVerbId, assignment] of Object.entries(assignments)) {
    if (!assignment.selectedSpan.length) continue;
    const parsed = parseAlignmentId(finiteVerbId);
    if (!parsed) continue;

    const verseWords = wordsByVerse.get(`${parsed.chapter}:${parsed.verse}`) ?? [];
    const storedRange =
      assignment.greekStartTokenId && assignment.greekEndTokenId
        ? { greekStartTokenId: assignment.greekStartTokenId, greekEndTokenId: assignment.greekEndTokenId }
        : null;

    let expectedSpanishSpan: string[] = [];
    if (storedRange) {
      const start = parseAlignmentId(storedRange.greekStartTokenId);
      const end = parseAlignmentId(storedRange.greekEndTokenId);
      if (start && end && start.chapter === end.chapter && start.verse === end.verse) {
        expectedSpanishSpan = deriveSpanishSpanFromGreekRange(
          start.chapter,
          start.verse,
          Math.min(start.token, end.token),
          Math.max(start.token, end.token),
          verseWords,
          bookId
        );
      }
    }

    const actualSpanishSpan = assignment.selectedSpan.slice();
    const mismatch =
      !storedRange ||
      !expectedSpanishSpan.length ||
      !sameWordIdSpan(actualSpanishSpan, expectedSpanishSpan);

    entries.push({
      finiteVerbId,
      chapter: parsed.chapter,
      verse: parsed.verse,
      storedRange,
      expectedSpanishSpan,
      actualSpanishSpan,
      mismatch
    });
  }

  return entries.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
}

function legacySpanToIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const span = value as { chapter?: unknown; verse?: unknown; startIndex?: unknown; endIndex?: unknown };
  if (
    typeof span.chapter !== "number" ||
    typeof span.verse !== "number" ||
    typeof span.startIndex !== "number" ||
    typeof span.endIndex !== "number"
  ) {
    return [];
  }
  const low = Math.min(span.startIndex, span.endIndex);
  const high = Math.max(span.startIndex, span.endIndex);
  const ids: string[] = [];
  for (let index = low; index <= high; index += 1) {
    ids.push(wordId(span.chapter, span.verse, index));
  }
  return ids;
}

function parseStoredClauseAssignments(stored: string | null): ClauseAssignments {
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ClauseAssignments = {};

    for (const [finiteVerbId, value] of Object.entries(parsed)) {
      if (typeof finiteVerbId !== "string") continue;
      if (Array.isArray(value)) {
        const selectedSpan = value.filter((id): id is string => typeof id === "string");
        if (selectedSpan.length) out[finiteVerbId] = { finiteVerbId, selectedSpan };
        continue;
      }
      if (!value || typeof value !== "object") continue;
      const record = value as {
        finiteVerbId?: unknown;
        selectedSpan?: unknown;
        greekStartTokenId?: unknown;
        greekEndTokenId?: unknown;
        greekConfirmedAt?: unknown;
      };
      if (Array.isArray(record.selectedSpan)) {
        const selectedSpan = record.selectedSpan.filter((id): id is string => typeof id === "string");
        if (selectedSpan.length) {
          out[finiteVerbId] = {
            finiteVerbId: typeof record.finiteVerbId === "string" ? record.finiteVerbId : finiteVerbId,
            selectedSpan,
            ...(typeof record.greekStartTokenId === "string" ? { greekStartTokenId: record.greekStartTokenId } : {}),
            ...(typeof record.greekEndTokenId === "string" ? { greekEndTokenId: record.greekEndTokenId } : {}),
            // Must round-trip: dropping this on read made every refresh look like
            // "0 of N confirmed" even after a full Greek re-save pass.
            ...(typeof record.greekConfirmedAt === "string" ? { greekConfirmedAt: record.greekConfirmedAt } : {})
          };
        }
        continue;
      }
      const selectedSpan = legacySpanToIds(value);
      if (selectedSpan.length) out[finiteVerbId] = { finiteVerbId, selectedSpan };
    }

    return out;
  } catch {
    return {};
  }
}

export function readClauseAssignments(bookId: ReaderBookId = getWorkshopBookId()): ClauseAssignments {
  const keys = progressKeys(bookId);
  const current = parseStoredClauseAssignments(window.localStorage.getItem(keys.clauseAssignments));
  if (Object.keys(current).length) return current;

  if (keys.clauseAssignmentsLegacy) {
    const legacy = parseStoredClauseAssignments(window.localStorage.getItem(keys.clauseAssignmentsLegacy));
    if (Object.keys(legacy).length) {
      writeClauseAssignments(legacy, bookId);
      return legacy;
    }
  }
  return {};
}

export function writeClauseAssignments(
  assignments: ClauseAssignments,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(progressKeys(bookId).clauseAssignments, JSON.stringify(assignments));
}

// --- Q1/Q2/Q3 observations and participle sort — moved here (from
// SpanishClauseBuilder.tsx, where these originated) so Compiler can read the
// exact same live data O writes, rather than a duplicated copy — per
// cgv-product-suite-spec.md: "C must read O's current state live — shared
// local data, not a one-time export/import file passed between two separate
// programs."

export type ObservationAnswer = "yes" | "no" | "unsure";

export interface ClauseObservation {
  describesNoun?: ObservationAnswer;
  describedNounSpan?: string[];
  isWhatWasExpressed?: ObservationAnswer;
  expressedParentClauseId?: string;
  tellsWhenOrIf?: ObservationAnswer;
  whenIfParentClauseId?: string;
  frameType?: FrameType;
}

export type ClauseObservations = Record<string, ClauseObservation>;

/** @deprecated Prefer workshopProgressKeys(bookId).clauseObservations */
export const CLAUSE_OBSERVATIONS_KEY = "the-reader:spanish-clause-builder:titus:statement-command-review:v1";

export function readClauseObservations(bookId: ReaderBookId = getWorkshopBookId()): ClauseObservations {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).clauseObservations);
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const observations: ClauseObservations = {};
    for (const [finiteVerbId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as {
        describesNoun?: unknown;
        describedNounSpan?: unknown;
        isWhatWasExpressed?: unknown;
        expressedParentClauseId?: unknown;
        tellsWhenOrIf?: unknown;
        whenIfParentClauseId?: unknown;
        frameType?: unknown;
      };
      const validFrameTypes = new Set(["time", "reason", "condition", "purpose"]);
      observations[finiteVerbId] = {
        ...(record.describesNoun === "yes" || record.describesNoun === "no" || record.describesNoun === "unsure"
          ? { describesNoun: record.describesNoun }
          : {}),
        ...(Array.isArray(record.describedNounSpan)
          ? { describedNounSpan: record.describedNounSpan.filter((id): id is string => typeof id === "string") }
          : {}),
        ...(record.isWhatWasExpressed === "yes" || record.isWhatWasExpressed === "no" || record.isWhatWasExpressed === "unsure"
          ? { isWhatWasExpressed: record.isWhatWasExpressed }
          : {}),
        ...(typeof record.expressedParentClauseId === "string"
          ? { expressedParentClauseId: record.expressedParentClauseId }
          : {}),
        ...(record.tellsWhenOrIf === "yes" || record.tellsWhenOrIf === "no" || record.tellsWhenOrIf === "unsure"
          ? { tellsWhenOrIf: record.tellsWhenOrIf }
          : {}),
        ...(typeof record.whenIfParentClauseId === "string"
          ? { whenIfParentClauseId: record.whenIfParentClauseId }
          : {}),
        ...(typeof record.frameType === "string" && validFrameTypes.has(record.frameType)
          ? { frameType: record.frameType as FrameType }
          : {})
      };
    }
    return observations;
  } catch {
    return {};
  }
}

export function writeClauseObservations(
  observations: ClauseObservations,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(progressKeys(bookId).clauseObservations, JSON.stringify(observations));
}

// A separate observation layer on top of the skeleton — participles never
// become skeleton rows or add indent depth. Same "first yes wins" pattern as
// ClauseObservation's three questions, sorting each participle into exactly
// one of three shapes rather than naming what kind of circumstance it adds
// (Greek doesn't mark that morphologically, so naming it would be a guess).
export interface ParticipleObservation {
  agreesWithNoun?: ObservationAnswer;
  describedNounSpan?: string[];
  standsAlone?: ObservationAnswer;
  ridesFiniteVerb?: ObservationAnswer;
  ridingClauseId?: string;
}

export type ParticipleObservations = Record<string, ParticipleObservation>;
export type ParticipleClassification = "attributive" | "substantival" | "circumstantial" | null;

/** @deprecated Prefer workshopProgressKeys(bookId).participleObservations */
export const PARTICIPLE_OBSERVATIONS_KEY = "the-reader:spanish-clause-builder:titus:participles:v1";

export function resolveParticipleClassification(observation: ParticipleObservation | undefined): ParticipleClassification {
  if (!observation) return null;
  if (observation.agreesWithNoun === "yes") return "attributive";
  if (observation.standsAlone === "yes") return "substantival";
  if (observation.ridesFiniteVerb === "yes") return "circumstantial";
  return null;
}

export function readParticipleObservations(
  bookId: ReaderBookId = getWorkshopBookId()
): ParticipleObservations {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).participleObservations);
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const observations: ParticipleObservations = {};
    for (const [participleId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as {
        agreesWithNoun?: unknown;
        describedNounSpan?: unknown;
        standsAlone?: unknown;
        ridesFiniteVerb?: unknown;
        ridingClauseId?: unknown;
      };
      const isAnswer = (v: unknown): v is ObservationAnswer => v === "yes" || v === "no" || v === "unsure";
      observations[participleId] = {
        ...(isAnswer(record.agreesWithNoun) ? { agreesWithNoun: record.agreesWithNoun } : {}),
        ...(Array.isArray(record.describedNounSpan)
          ? { describedNounSpan: record.describedNounSpan.filter((id): id is string => typeof id === "string") }
          : {}),
        ...(isAnswer(record.standsAlone) ? { standsAlone: record.standsAlone } : {}),
        ...(isAnswer(record.ridesFiniteVerb) ? { ridesFiniteVerb: record.ridesFiniteVerb } : {}),
        ...(typeof record.ridingClauseId === "string" ? { ridingClauseId: record.ridingClauseId } : {})
      };
    }
    return observations;
  } catch {
    return {};
  }
}

export function writeParticipleObservations(
  observations: ParticipleObservations,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(progressKeys(bookId).participleObservations, JSON.stringify(observations));
}
