import type { BibleVerse } from "cgv-bible";
import {
  getReaderBookInfo,
  readerBookHasOshb,
  workshopProgressKeys,
  type ReaderBookId
} from "@cgv/core";
import type { FrameType } from "./clause-signals";
import { loadLbfRaw, loadMorphRawSync, loadTokensRawSync } from "./book-assets";
import {
  loadLbfTokenSurfaces,
  loadLbfTokenWordIndexes,
  loadLbfTokenWordMap,
  resolveLbfPhraseWordIndex
} from "./lbf-alignment";
import { EMPTY_H3_FLOW_STATE, sanitizeH3FlowState, type H3FlowState } from "./h3-flow";
import {
  isAlignmentStyleId,
  isOshbFiniteVerb,
  isOshbInfinitive,
  isOshbParticiple,
  mtToProtestant,
  oshbParticipleFeatures,
  otTokenId
} from "./oshb";
import { getWorkshopBookId } from "./workshop-book";

export type { H3FlowState };

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
    const lineVerse = line.match(/^\s*.+?\s+(\d+):(\d+)\s+(.+?)\s*$/);
    if (lineVerse) {
      flush();
      verses.push({
        book: displayName,
        chapter: Number(lineVerse[1]),
        verse: Number(lineVerse[2]),
        text: lineVerse[3].trim()
      });
      chapter = null;
      verse = null;
      continue;
    }

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
  /** OSHB / Hebrew participle — no Greek case; student picks the host. */
  oshbParticiple?: boolean;
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

/** Keep hyphenated names (Abed-nego) as one word — matches LBF hand-align TOKEN_RE. */
const WORD_PATTERN = /[A-Za-záéíóúüñÁÉÍÓÚÜÑ][\wáéíóúüñÁÉÍÓÚÜÑ'’\-]*|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+/gu;
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

  if (readerBookHasOshb(bookId)) {
    for (const row of parseTokenRows(bookId)) {
      const { chapter, verse } = mtToProtestant(row.ch, row.vs);
      const id = otTokenId(chapter, verse, row.tok);
      map.set(id, id);
    }
    return map;
  }

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
    if (isAlignmentStyleId(greekId)) {
      alignmentIds.add(greekId);
      continue;
    }
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
        if (isAlignmentStyleId(tokenId)) {
          assignments.set(tokenId, record.recipient);
          continue;
        }
        const alignmentId = greekIdToAlignmentId.get(tokenId);
        if (alignmentId) assignments.set(alignmentId, record.recipient);
      }
    }
  } catch {
    return assignments;
  }

  return assignments;
}

/**
 * Tokens marked as the predicate head of a verbless (nominal) clause. Greek
 * writes whole clauses with no verb in them — 1 Peter 3:8's Τὸ δὲ τέλος πάντες
 * ὁμόφρονες, συμπαθεῖς… is an imperatival nominal clause, and the participles of
 * 3:9 plus the ὅτι clause explaining them all hang on it. With no anchor there,
 * those dependents have no possible parent, so O ends up recording a false one.
 */
export function readNominalClauseHeadIds(bookId: ReaderBookId = getWorkshopBookId()): Set<string> {
  return readMarkedAlignmentIds(progressKeys(bookId).nominalHeads, bookId);
}

// A nominal head is a clause anchor exactly like a marked finite verb, so every
// consumer of the finite marks sees the union. Brick 1's own confirmation still
// reads finiteMarks alone, so marking one never looks like a finite-verb error.
function readFiniteMarkedAlignmentIds(bookId: ReaderBookId): Set<string> {
  const ids = readMarkedAlignmentIds(progressKeys(bookId).finiteMarks, bookId);
  for (const id of readNominalClauseHeadIds(bookId)) ids.add(id);
  return ids;
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

function parseTokenRows(bookId: ReaderBookId): Array<{
  ch: number;
  vs: number;
  tok: number;
  surface: string;
  morph: string;
  lemma: string;
  es: string;
}> {
  const tokensRaw = loadTokensRawSync(bookId);
  const rows: Array<{
    ch: number;
    vs: number;
    tok: number;
    surface: string;
    morph: string;
    lemma: string;
    es: string;
  }> = [];
  for (const line of tokensRaw.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (row.book !== bookId) continue;
    const tok = typeof row.tok === "number" ? row.tok : typeof row.w === "number" ? row.w : null;
    if (
      typeof row.ch !== "number" ||
      typeof row.vs !== "number" ||
      tok === null ||
      typeof row.surface !== "string" ||
      typeof row.morph !== "string" ||
      typeof row.es !== "string"
    ) {
      continue;
    }
    rows.push({
      ch: row.ch,
      vs: row.vs,
      tok,
      surface: row.surface,
      morph: row.morph,
      lemma: typeof row.lemma === "string" ? row.lemma : "",
      es: row.es
    });
  }
  return rows;
}

function isFiniteMorphTag(morph: string): boolean {
  return /^V-[123]/.test(morph) || isOshbFiniteVerb(morph);
}

function parseFiniteAlignments(bookId: ReaderBookId = getWorkshopBookId()): FiniteAlignment[] {
  const nominalHeadIds = readNominalClauseHeadIds(bookId);
  const oshb = readerBookHasOshb(bookId);
  return parseTokenRows(bookId)
    .map(row => {
      const { chapter, verse } = oshb ? mtToProtestant(row.ch, row.vs) : { chapter: row.ch, verse: row.vs };
      return { ...row, ch: chapter, vs: verse };
    })
    .filter(row => {
      return (
        isFiniteMorphTag(row.morph) ||
        nominalHeadIds.has(finiteAlignmentId(row.ch, row.vs, row.tok))
      );
    })
    .map(row => ({
      id: finiteAlignmentId(row.ch, row.vs, row.tok),
      chapter: row.ch,
      verse: row.vs,
      token: row.tok,
      greekSurface: row.surface,
      greekMorph: row.morph,
      greekLemma: row.lemma,
      spanishHint: row.es
    }));
}

function parseTokenAlignments(bookId: ReaderBookId = getWorkshopBookId()): FiniteAlignment[] {
  const oshb = readerBookHasOshb(bookId);
  return parseTokenRows(bookId).map(row => {
    const { chapter, verse } = oshb ? mtToProtestant(row.ch, row.vs) : { chapter: row.ch, verse: row.vs };
    return {
      id: finiteAlignmentId(chapter, verse, row.tok),
      chapter,
      verse,
      token: row.tok,
      greekSurface: row.surface,
      greekMorph: row.morph,
      greekLemma: row.lemma,
      spanishHint: row.es
    };
  });
}

// MorphGNT's verb tag is "V-" + 8 chars: person, tense, voice, mood, case,
// number, gender, degree. Finite verbs carry a person digit in slot 0 and no
// case/number/gender; participles carry "-" for person and mood "P", with
// case/number/gender filled in since they decline like adjectives. Pure
// morphology lookup — same mechanical certainty as Brick 1's finite-verb
// detection, no judgment involved in deciding whether a token is one.
function isParticipleMorph(morph: string): boolean {
  return (morph.startsWith("V-") && morph[5] === "P") || isOshbParticiple(morph);
}

/** MorphGNT mood slot N — infinitive (e.g. V--PAN---- εἶναι). Also OSHB inf. */
export function isInfinitiveMorph(morph: string): boolean {
  return (morph.startsWith("V-") && morph[5] === "N") || isOshbInfinitive(morph);
}

/** Case letter of a noun or adjective, across both tag styles in the token files. */
function substantiveCaseLetter(morph: string): string | null {
  if (!/^[NA]/.test(morph)) return null;
  if (/^[NA]-[A-Z]/.test(morph)) return morph.charAt(2); // Robinson: N-NSM / A-NPM
  return morph.length > 6 ? morph.charAt(6) : null; // MorphGNT: N-----NSM-
}

export interface NominalClauseCandidate {
  chapter: number;
  verse: number;
  startToken: number;
  endToken: number;
  /** Greek surface of the whole run, for the flag text. */
  greek: string;
  tokenCount: number;
  /**
   * A participle in the subject case sits in the run — the shape an imperatival
   * participle takes (2:18 ὑποτασσόμενοι). Only nominatives count: an accusative or
   * genitive participle modifies something inside the run and says nothing about
   * whether the run predicates. Even a nominative may only be attributive (1:3
   * ὁ … ἀναγεννήσας), so this describes the form and claims nothing more.
   */
  hasNominativeParticiple: boolean;
  /** Runs into a clause span with no sentence break between — a span may be the real issue. */
  touchesClauseSpan: boolean;
}

/** ὡς-comparatives modify the clause they sit in; they never predicate on their own. */
const COMPARATIVE_LEMMAS = new Set(["ὡς", "καθώς", "ὥσπερ", "καθάπερ", "ὡσεί"]);

/** Greek full stop and question mark close a sentence; the raised dot is a colon. */
function closesSentence(surface: string): boolean {
  return /[.;]$/.test(surface.replace(/[⸀⸁⸂⸃”’")\]]+$/g, "").trim());
}

/**
 * Stretches of Greek that no clause span covers, contain no finite verb, and still
 * carry a nominative or vocative substantive.
 *
 * That is the shape of a clause whose predicate is nominal rather than verbal —
 * «Εὐλογητὸς ὁ θεός», «τοῦτο χάρις», «εἰρήνη ὑμῖν πᾶσιν», «φιλόξενοι εἰς ἀλλήλους».
 * Observer can only build such a clause once a student marks its head, and no other
 * check can miss it on the student's behalf: every one of them reasons from a verb,
 * and here there is none. Left unmarked, the assertion never enters the trunk — in
 * 1 Pedro that silently costs the commands to wives, husbands, servants and elders.
 *
 * Only a nominal that predicates counts. A nominal sitting *inside* an independent
 * clause — a subject a narrow span left outside (5:10 «ὁ δὲ θεὸς πάσης χάριτος»
 * before καταρτίσει), an apposition (5:1), a second predicate under one copula
 * (4:11) — is part of that clause, not a clause of its own, and is worth no note as
 * a nominal clause. That call is editorial, so the only class dropped here is the
 * one that is mechanical: a ὡς-comparative can only modify its host. The rest are
 * reported with `touchesClauseSpan` so the reader knows a span may be the real
 * question — filtering them out would bury the genuine ones that simply happen to
 * govern a subordinate clause in the same sentence («τοῦτο γὰρ χάρις, εἰ …»).
 */
export function findNominalClauseCandidates(
  claimedGreekTokenIds: Set<string>,
  bookId: ReaderBookId = getWorkshopBookId()
): NominalClauseCandidate[] {
  // Brick 1B is MorphGNT case (N/V). OSHB has no Greek case — do not flag Hebrew/Aramaic runs.
  if (readerBookHasOshb(bookId)) return [];

  const nominalHeadIds = readNominalClauseHeadIds(bookId);
  const tokens = parseTokenAlignments(bookId).sort(
    (a, b) => a.chapter - b.chapter || a.verse - b.verse || a.token - b.token
  );

  const runs: FiniteAlignment[][] = [];
  let current: FiniteAlignment[] | null = null;
  for (const token of tokens) {
    if (claimedGreekTokenIds.has(token.id)) {
      current = null;
      continue;
    }
    const previous = current?.[current.length - 1];
    if (previous && previous.chapter === token.chapter && previous.verse === token.verse && previous.token === token.token - 1) {
      current?.push(token);
    } else {
      current = [token];
      runs.push(current);
    }
  }

  const tokenById = new Map(tokens.map(token => [token.id, token]));
  const candidates: NominalClauseCandidate[] = [];
  for (const run of runs) {
    if (run.length < 3) continue;
    if (run.some(token => isFiniteMorphTag(token.greekMorph))) continue;
    // Already marked: the student has seen this one, so it is not a miss.
    if (run.some(token => nominalHeadIds.has(token.id))) continue;
    if (COMPARATIVE_LEMMAS.has(run[0].greekLemma.trim())) continue;
    const hasPredicate = run.some(token => {
      const letter = substantiveCaseLetter(token.greekMorph);
      return letter === "N" || letter === "V";
    });
    if (!hasPredicate) continue;

    const first = run[0];
    const last = run[run.length - 1];
    const before = tokenById.get(`${first.chapter}:${first.verse}:${first.token - 1}`);
    const after = tokenById.get(`${last.chapter}:${last.verse}:${last.token + 1}`);
    const touchesClauseSpan = Boolean(
      (before && claimedGreekTokenIds.has(before.id) && !closesSentence(before.greekSurface)) ||
        (after && claimedGreekTokenIds.has(after.id) && !closesSentence(last.greekSurface))
    );

    candidates.push({
      chapter: first.chapter,
      verse: first.verse,
      startToken: first.token,
      endToken: last.token,
      greek: run.map(token => stripGreekPunctuation(token.greekSurface)).join(" "),
      tokenCount: run.length,
      hasNominativeParticiple: run.some(
        token => isParticipleMorph(token.greekMorph) && token.greekMorph[6] === "N"
      ),
      touchesClauseSpan
    });
  }
  return candidates;
}

const PARTICIPLE_ASPECT: Record<string, string> = {
  P: "ongoing",
  I: "ongoing (past)",
  F: "future",
  A: "simple",
  R: "completed / state",
  L: "completed / state",
  X: "completed / state"
};

const PARTICIPLE_VOICE: Record<string, string> = {
  A: "active",
  M: "middle",
  P: "passive",
  E: "middle/passive",
  D: "middle",
  O: "passive"
};

const PARTICIPLE_CASE: Record<string, string> = {
  N: "nominative",
  G: "genitive",
  D: "dative",
  A: "accusative",
  V: "vocative"
};

const PARTICIPLE_NUMBER: Record<string, string> = {
  S: "singular",
  P: "plural"
};

const PARTICIPLE_GENDER: Record<string, string> = {
  M: "masculine",
  F: "feminine",
  N: "neuter"
};

export interface ParticipleReading {
  /** Spanish surface first — what you already see in the clause line. */
  spanish: string;
  greek: string | null;
  /** Aspect · voice · case number gender — the form's own meaning. */
  formLine: string;
  /** How the form hangs on the clause, from case / agreement only. */
  hangLine: string;
  /** Noun/pronoun this participle agrees with, when morphology finds one. */
  hangNoun: SpanishWord | null;
}

export interface ParticipleNounGroup {
  noun: SpanishWord | null;
  /** Noun text, or a case-role / pick prompt when there is no agreeing noun. */
  hostLabel: string;
  /** True when nominative participles still need a manual subject host. */
  needsHostPick?: boolean;
  /** True when hostLabel came from a saved manual subject pick. */
  isManualHost?: boolean;
  items: { word: SpanishWord; reading: ParticipleReading }[];
}

function participleCngKey(word: SpanishWord): string | null {
  const { participleCase, participleNumber, participleGender } = word;
  if (!participleCase || participleCase === "-" || !participleNumber || participleNumber === "-") return null;
  if (!participleGender || participleGender === "-") return `${participleCase}${participleNumber}`;
  return `${participleCase}${participleNumber}${participleGender}`;
}

/** Nouns and pronouns that can host a participle by CNG agreement. */
function hostCngKey(morph: string): string | null {
  const pos = morph[0];
  if (pos !== "N" && pos !== "P" && pos !== "R" && pos !== "D" && pos !== "A") return null;
  const grammaticalCase = morph[6];
  const number = morph[7];
  const gender = morph[8];
  if (!grammaticalCase || grammaticalCase === "-" || !number || number === "-") return null;
  if (!gender || gender === "-") return `${grammaticalCase}${number}`;
  return `${grammaticalCase}${number}${gender}`;
}

/**
 * Mechanical reading for a Brick-4 participle: what the form means, and what
 * it hangs on in nearby words — no student sort, no semantic-relation guess.
 */
export function describeParticipleReading(
  word: SpanishWord,
  nearbyWords: SpanishWord[] = []
): ParticipleReading {
  const aspect = (word.participleTense && PARTICIPLE_ASPECT[word.participleTense]) || null;
  const voice = (word.participleVoice && PARTICIPLE_VOICE[word.participleVoice]) || null;
  const grammaticalCase =
    (word.participleCase && PARTICIPLE_CASE[word.participleCase]) || null;
  const number = (word.participleNumber && PARTICIPLE_NUMBER[word.participleNumber]) || null;
  const gender = (word.participleGender && PARTICIPLE_GENDER[word.participleGender]) || null;

  const formParts = word.oshbParticiple
    ? ["Hebrew participle", [number, gender].filter(Boolean).join(" ")].filter(Boolean)
    : [aspect, voice, [grammaticalCase, number, gender].filter(Boolean).join(" ")].filter(Boolean);
  const formLine = formParts.length ? formParts.join(" · ") : "participle form";

  const key = participleCngKey(word);
  let hangNoun: SpanishWord | null = null;
  if (key) {
    hangNoun =
      nearbyWords.find(candidate => {
        if (candidate.id === word.id) return false;
        if (candidate.participleId) return false;
        if (!candidate.greekMorph) return false;
        return hostCngKey(candidate.greekMorph) === key;
      }) ?? null;
  }

  let hangLine: string;
  if (hangNoun) {
    hangLine = hangNoun.text;
  } else if (word.oshbParticiple) {
    hangLine = "Hebrew participle — pick who they ride with";
  } else if (word.participleCase === "N") {
    hangLine = "subject case — pick who they ride with";
  } else if (word.participleCase === "A") {
    hangLine = "object case";
  } else if (word.participleCase === "G" && word.participlePrecededByPreposition) {
    hangLine = "genitive after a preposition";
  } else if (word.participleCase === "G") {
    hangLine = "genitive — of-phrase or absolute";
  } else if (word.participleCase === "D") {
    hangLine = "dative case";
  } else if (grammaticalCase) {
    hangLine = `${grammaticalCase} case`;
  } else {
    hangLine = "case unclear from morphology";
  }

  return {
    spanish: word.text,
    greek: word.participleSurface ?? word.greekSurface ?? null,
    formLine,
    hangLine,
    hangNoun
  };
}

/**
 * Host first, participles under it (oro → perece, probado).
 *
 * Nominative subject hosts are **never** auto-filled from CNG agreement —
 * that falsely locks onto distant chapter nouns (e.g. 1:8 visto → 1:10
 * «profetas»). Nominatives use the manual pick / "Who do they ride with?" path.
 */
export function groupParticiplesByNounHost(
  participles: SpanishWord[],
  nearbyWords: SpanishWord[],
  manualSubjectHost: SpanishWord[] = []
): ParticipleNounGroup[] {
  const byNounId = new Map<string, ParticipleNounGroup>();
  const byRoleLabel = new Map<string, ParticipleNounGroup>();
  const manualNominatives: { word: SpanishWord; reading: ParticipleReading }[] = [];
  const needsPickNominatives: { word: SpanishWord; reading: ParticipleReading }[] = [];
  const manualLabel = manualSubjectHost.map(w => w.text).join(" ").trim();

  for (const word of participles) {
    const reading = describeParticipleReading(word, nearbyWords);

    // Nominative / OSHB: subject host is a judgment call, not morphology.
    if (word.oshbParticiple || word.participleCase === "N") {
      if (manualSubjectHost.length) manualNominatives.push({ word, reading });
      else needsPickNominatives.push({ word, reading });
      continue;
    }

    if (reading.hangNoun) {
      const id = reading.hangNoun.id;
      let group = byNounId.get(id);
      if (!group) {
        group = {
          noun: reading.hangNoun,
          hostLabel: reading.hangNoun.text,
          items: []
        };
        byNounId.set(id, group);
      }
      group.items.push({ word, reading });
      continue;
    }

    let group = byRoleLabel.get(reading.hangLine);
    if (!group) {
      group = { noun: null, hostLabel: reading.hangLine, items: [] };
      byRoleLabel.set(reading.hangLine, group);
    }
    group.items.push({ word, reading });
  }

  const nounGroups = Array.from(byNounId.values()).sort(
    (a, b) => (a.noun?.index ?? 0) - (b.noun?.index ?? 0)
  );
  for (const group of nounGroups) {
    group.items.sort((a, b) => a.word.index - b.word.index);
  }

  const extras: ParticipleNounGroup[] = [];
  if (manualNominatives.length) {
    extras.push({
      noun: manualSubjectHost[0] ?? null,
      hostLabel: manualLabel || "subject",
      isManualHost: true,
      items: manualNominatives.sort((a, b) => a.word.index - b.word.index)
    });
  }
  if (needsPickNominatives.length) {
    extras.push({
      noun: null,
      hostLabel: "Who do they ride with?",
      needsHostPick: true,
      items: needsPickNominatives.sort((a, b) => a.word.index - b.word.index)
    });
  }

  const roleGroups = Array.from(byRoleLabel.values());
  for (const group of roleGroups) {
    group.items.sort((a, b) => a.word.index - b.word.index);
  }
  return [...nounGroups, ...extras, ...roleGroups];
}

export type ParticipleSubjectHosts = Record<string, string[]>;

export function readParticipleSubjectHosts(
  bookId: ReaderBookId = getWorkshopBookId()
): ParticipleSubjectHosts {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).participleSubjectHosts);
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const hosts: ParticipleSubjectHosts = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const ids = value.filter((id): id is string => typeof id === "string");
      if (ids.length) hosts[key] = ids;
    }
    return hosts;
  } catch {
    return {};
  }
}

export function writeParticipleSubjectHosts(
  hosts: ParticipleSubjectHosts,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(progressKeys(bookId).participleSubjectHosts, JSON.stringify(hosts));
}

/** Student-observed SUJETO → VERBO → OBJETO/RECEPTOR for one finite clause. */
export type ClauseActorObservation = {
  /** Quién actúa — Spanish word ids. */
  subjectSpan: string[];
  /** Qué hace — defaults to the finite verb’s Spanish word. */
  verbSpan: string[];
  /** Sobre quién/qué recae — optional. */
  objectSpan: string[];
};

export type ClauseActors = Record<string, ClauseActorObservation>;

function sanitizeIdSpan(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

export function readClauseActors(bookId: ReaderBookId = getWorkshopBookId()): ClauseActors {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).clauseActors);
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const actors: ClauseActors = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      const subjectSpan = sanitizeIdSpan(row.subjectSpan);
      const verbSpan = sanitizeIdSpan(row.verbSpan);
      const objectSpan = sanitizeIdSpan(row.objectSpan);
      if (!subjectSpan.length && !verbSpan.length && !objectSpan.length) continue;
      actors[key] = { subjectSpan, verbSpan, objectSpan };
    }
    return actors;
  } catch {
    return {};
  }
}

export function writeClauseActors(
  actors: ClauseActors,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(progressKeys(bookId).clauseActors, JSON.stringify(actors));
}

export function readH3FlowState(bookId: ReaderBookId = getWorkshopBookId()): H3FlowState {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).h3Flow);
    if (!stored) return { ...EMPTY_H3_FLOW_STATE };
    return sanitizeH3FlowState(JSON.parse(stored));
  } catch {
    return { ...EMPTY_H3_FLOW_STATE };
  }
}

export function writeH3FlowState(
  state: H3FlowState,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(progressKeys(bookId).h3Flow, JSON.stringify(state));
}

/** Student-marked contrast observation (never an app-supplied theme). */
export type ContrastObservation = {
  id: string;
  verseKey: string;
  poleA: string;
  poleB: string;
  note?: string;
};

export type ContrastObservationsState = {
  items: ContrastObservation[];
};

const EMPTY_CONTRASTS: ContrastObservationsState = { items: [] };

function sanitizeContrasts(raw: unknown): ContrastObservationsState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_CONTRASTS, items: [] };
  const itemsRaw = (raw as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) return { ...EMPTY_CONTRASTS, items: [] };
  const items: ContrastObservation[] = [];
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const verseKey = typeof r.verseKey === "string" ? r.verseKey : "";
    const poleA = typeof r.poleA === "string" ? r.poleA.trim() : "";
    const poleB = typeof r.poleB === "string" ? r.poleB.trim() : "";
    if (!id || !verseKey || !poleA || !poleB) continue;
    const note = typeof r.note === "string" && r.note.trim() ? r.note.trim() : undefined;
    items.push({ id, verseKey, poleA, poleB, note });
  }
  return { items };
}

export function readContrastObservations(
  bookId: ReaderBookId = getWorkshopBookId()
): ContrastObservationsState {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).contrasts);
    if (!stored) return { ...EMPTY_CONTRASTS, items: [] };
    return sanitizeContrasts(JSON.parse(stored));
  } catch {
    return { ...EMPTY_CONTRASTS, items: [] };
  }
}

export function writeContrastObservations(
  state: ContrastObservationsState,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(
    progressKeys(bookId).contrasts,
    JSON.stringify(sanitizeContrasts(state))
  );
}

/** Confirmed book-definition dossier (authorial use — see book-definitions-spec.md). */
export type BookDefinitionHitKind = "equative" | "contrast" | "use" | "other";

export type BookDefinitionHit = {
  id: string;
  verseKey: string;
  kind: BookDefinitionHitKind;
  snippet: string;
  note?: string;
  /** true = in dossier; false = dismissed proposal. */
  confirmed: boolean;
};

export type BookDefinitionTerm = {
  id: string;
  seed: string;
  relatedConfirmed: string[];
  hits: BookDefinitionHit[];
  workingDefinition: string;
};

export type BookDefinitionsState = {
  terms: BookDefinitionTerm[];
};

const EMPTY_BOOK_DEFINITIONS: BookDefinitionsState = { terms: [] };

const HIT_KINDS = new Set<BookDefinitionHitKind>(["equative", "contrast", "use", "other"]);

function sanitizeBookDefinitions(raw: unknown): BookDefinitionsState {
  if (!raw || typeof raw !== "object") return { terms: [] };
  const termsRaw = (raw as { terms?: unknown }).terms;
  if (!Array.isArray(termsRaw)) return { terms: [] };
  const terms: BookDefinitionTerm[] = [];
  for (const row of termsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const seed = typeof r.seed === "string" ? r.seed.trim() : "";
    if (!id || !seed) continue;
    const relatedConfirmed = Array.isArray(r.relatedConfirmed)
      ? r.relatedConfirmed.filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
      : [];
    const workingDefinition = typeof r.workingDefinition === "string" ? r.workingDefinition : "";
    const hitsRaw = Array.isArray(r.hits) ? r.hits : [];
    const hits: BookDefinitionHit[] = [];
    for (const h of hitsRaw) {
      if (!h || typeof h !== "object") continue;
      const hr = h as Record<string, unknown>;
      const hid = typeof hr.id === "string" ? hr.id : "";
      const verseKey = typeof hr.verseKey === "string" ? hr.verseKey : "";
      const kind = typeof hr.kind === "string" && HIT_KINDS.has(hr.kind as BookDefinitionHitKind)
        ? (hr.kind as BookDefinitionHitKind)
        : "use";
      const snippet = typeof hr.snippet === "string" ? hr.snippet : "";
      if (!hid || !verseKey) continue;
      const note = typeof hr.note === "string" && hr.note.trim() ? hr.note.trim() : undefined;
      hits.push({
        id: hid,
        verseKey,
        kind,
        snippet,
        note,
        confirmed: hr.confirmed === true
      });
    }
    terms.push({ id, seed, relatedConfirmed, hits, workingDefinition });
  }
  return { terms };
}

export function readBookDefinitions(
  bookId: ReaderBookId = getWorkshopBookId()
): BookDefinitionsState {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).bookDefinitions);
    if (!stored) return { ...EMPTY_BOOK_DEFINITIONS, terms: [] };
    return sanitizeBookDefinitions(JSON.parse(stored));
  } catch {
    return { ...EMPTY_BOOK_DEFINITIONS, terms: [] };
  }
}

export function writeBookDefinitions(
  state: BookDefinitionsState,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(
    progressKeys(bookId).bookDefinitions,
    JSON.stringify(sanitizeBookDefinitions(state))
  );
}

/** Student-named book movement thread (see book-threads-spec.md). */
export type BookThreadStepSource =
  | "writing-purpose"
  | "opens"
  | "definition"
  | "manual";

export type BookThreadStep = {
  id: string;
  label: string;
  verseKey: string;
  source: BookThreadStepSource;
  evidence?: string;
  seed?: string;
};

export type BookThreadState = {
  steps: BookThreadStep[];
};

const EMPTY_BOOK_THREAD: BookThreadState = { steps: [] };

const THREAD_SOURCES = new Set<BookThreadStepSource>([
  "writing-purpose",
  "opens",
  "definition",
  "manual"
]);

function sanitizeBookThread(raw: unknown): BookThreadState {
  if (!raw || typeof raw !== "object") return { steps: [] };
  const stepsRaw = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(stepsRaw)) return { steps: [] };
  const steps: BookThreadStep[] = [];
  for (const row of stepsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const verseKey = typeof r.verseKey === "string" ? r.verseKey.trim() : "";
    const source =
      typeof r.source === "string" && THREAD_SOURCES.has(r.source as BookThreadStepSource)
        ? (r.source as BookThreadStepSource)
        : null;
    if (!id || !verseKey || !source) continue;
    const label = typeof r.label === "string" ? r.label : "";
    const evidence =
      typeof r.evidence === "string" && r.evidence.trim() ? r.evidence.trim() : undefined;
    const seed = typeof r.seed === "string" && r.seed.trim() ? r.seed.trim() : undefined;
    steps.push({ id, label, verseKey, source, evidence, seed });
  }
  return { steps };
}

export function readBookThread(bookId: ReaderBookId = getWorkshopBookId()): BookThreadState {
  try {
    const stored = window.localStorage.getItem(progressKeys(bookId).bookThread);
    if (!stored) return { ...EMPTY_BOOK_THREAD, steps: [] };
    return sanitizeBookThread(JSON.parse(stored));
  } catch {
    return { ...EMPTY_BOOK_THREAD, steps: [] };
  }
}

export function writeBookThread(
  state: BookThreadState,
  bookId: ReaderBookId = getWorkshopBookId()
): void {
  window.localStorage.setItem(
    progressKeys(bookId).bookThread,
    JSON.stringify(sanitizeBookThread(state))
  );
}

/**
 * Teaching form for an observed actor line.
 * Requires subject + verb; omits the object slot when empty.
 * `Cristo → llevó → nuestros pecados` / `paciencia → esperaba`
 */
export function formatActorTriple(subject: string, verb: string, object = ""): string {
  const s = subject.trim();
  const v = verb.trim();
  const o = object.trim();
  if (!s || !v) return "";
  return o ? `${s} → ${v} → ${o}` : `${s} → ${v}`;
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
    if (isFiniteMorphTag(alignment.greekMorph)) hasFiniteVerb.add(key);
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

  // Stamp Greek morph onto every Spanish word that LBF maps a token onto.
  // Without this, agreement checks (attributive participle ↔ noun) have no
  // morph on ordinary nouns like θεός/Dios — only finite-verb anchors used
  // to carry greekMorph.
  const allTokenAlignments = parseTokenAlignments(bookId);
  for (const alignment of allTokenAlignments) {
    const key = `${alignment.chapter}:${alignment.verse}`;
    const verse = verseByKey.get(key);
    if (!verse) continue;
    const wordIndex = getTokenWordMap(alignment.chapter, alignment.verse, verse.words).get(alignment.token);
    if (wordIndex === undefined) continue;
    const word = verse.words[wordIndex];
    if (!word) continue;
    const next = alignment.greekMorph;
    const current = word.greekMorph;
    // When several Greek tokens collapse onto one Spanish word, keep a noun
    // tag if one is available — that's what case/number/gender agreement needs.
    if (!current || (next.startsWith("N") && !current.startsWith("N"))) {
      word.greekMorph = next;
    }
  }

  const finiteSurfacesByVerse = new Map<string, Map<number, string>>();
  for (const alignment of parseFiniteAlignments(bookId)) {
    if (!markedFiniteAlignmentIds.has(alignment.id)) continue;

    const key = `${alignment.chapter}:${alignment.verse}`;
    const verse = verseByKey.get(key);
    if (!verse) continue;
    const recordedIndex = getTokenWordMap(alignment.chapter, alignment.verse, verse.words).get(
      alignment.token
    );
    if (!finiteSurfacesByVerse.has(key)) {
      finiteSurfacesByVerse.set(key, loadLbfTokenSurfaces(alignment.chapter, alignment.verse, bookId));
    }
    const wordIndex = resolveLbfPhraseWordIndex(
      verse.words,
      recordedIndex,
      finiteSurfacesByVerse.get(key)?.get(alignment.token),
      "finite"
    );
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
  const participleSurfacesByVerse = new Map<string, Map<number, string>>();
  for (const alignment of allTokenAlignments) {
    if (!isParticipleMorph(alignment.greekMorph)) continue;

    const key = `${alignment.chapter}:${alignment.verse}`;
    const verse = verseByKey.get(key);
    if (!verse) continue;

    const recordedIndex = getTokenWordMap(alignment.chapter, alignment.verse, verse.words).get(alignment.token);
    if (!participleSurfacesByVerse.has(key)) {
      participleSurfacesByVerse.set(key, loadLbfTokenSurfaces(alignment.chapter, alignment.verse, bookId));
    }
    const wordIndex = resolveLbfPhraseWordIndex(
      verse.words,
      recordedIndex,
      participleSurfacesByVerse.get(key)?.get(alignment.token),
      "participle"
    );
    if (wordIndex === undefined) continue;
    const word = verse.words[wordIndex];
    if (!word) continue;

    warnOnIdCollision(word, "participleId", alignment.id);
    word.participleId = alignment.id;
    word.participleSurface = stripGreekPunctuation(alignment.greekSurface);
    word.participleLemma = alignment.greekLemma;

    if (isOshbParticiple(alignment.greekMorph)) {
      // Hebrew has no Greek case; force the manual-host path (same as nominative).
      const feat = oshbParticipleFeatures(alignment.greekMorph);
      word.oshbParticiple = true;
      word.participleTense = undefined;
      word.participleVoice = undefined;
      word.participleCase = "N";
      word.participleNumber = feat?.number ?? undefined;
      word.participleGender = feat?.gender ?? undefined;
      word.greekMorph = alignment.greekMorph;
    } else {
      word.participleTense = alignment.greekMorph[3];
      word.participleVoice = alignment.greekMorph[4];
      word.participleCase = alignment.greekMorph[6];
      word.participleNumber = alignment.greekMorph[7];
      word.participleGender = alignment.greekMorph[8];
      // Keep the participle morph on the Spanish word so agreementKey can also
      // fall back to greekMorph when case slots are missing.
      word.greekMorph = alignment.greekMorph;

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

  // Contiguous char-slice only when every index between first and last is
  // selected. After span-clip, gaps are common — slicing would re-include the
  // dropped words (e.g. apodosis crumbs inside a condition line).
  const contiguous = selected.every(
    (word, i) => i === 0 || word.index === selected[i - 1].index + 1
  );
  if (verseText && contiguous) {
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
    .filter(alignment => /[,.;·]/.test(alignment.greekSurface) || isFiniteMorphTag(alignment.greekMorph));
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
  const multi = loadLbfTokenWordIndexes(chapter, verse, bookId);
  const wordIndexes = new Set<number>();
  for (let token = startToken; token <= endToken; token += 1) {
    const many = multi.get(token);
    if (many?.length) {
      for (const index of many) wordIndexes.add(index);
      continue;
    }
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

// Legacy participle-sort records may still sit in localStorage under
// workshopProgressKeys(...).participleObservations. The Structure UI no longer
// reads or writes them — participles are mechanical clause satellites only.
export type ParticipleSemanticRelation =
  | "time"
  | "reason"
  | "means"
  | "condition"
  | "concession"
  | "purpose-result"
  | "accompanying"
  | "unsure";

export interface ParticipleObservation {
  agreesWithNoun?: ObservationAnswer;
  describedNounSpan?: string[];
  standsAlone?: ObservationAnswer;
  ridesFiniteVerb?: ObservationAnswer;
  ridingClauseId?: string;
  semanticRelation?: ParticipleSemanticRelation;
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
        semanticRelation?: unknown;
      };
      const isAnswer = (v: unknown): v is ObservationAnswer => v === "yes" || v === "no" || v === "unsure";
      const isSemanticRelation = (v: unknown): v is ParticipleSemanticRelation =>
        v === "time" ||
        v === "reason" ||
        v === "means" ||
        v === "condition" ||
        v === "concession" ||
        v === "purpose-result" ||
        v === "accompanying" ||
        v === "unsure";
      observations[participleId] = {
        ...(isAnswer(record.agreesWithNoun) ? { agreesWithNoun: record.agreesWithNoun } : {}),
        ...(Array.isArray(record.describedNounSpan)
          ? { describedNounSpan: record.describedNounSpan.filter((id): id is string => typeof id === "string") }
          : {}),
        ...(isAnswer(record.standsAlone) ? { standsAlone: record.standsAlone } : {}),
        ...(isAnswer(record.ridesFiniteVerb) ? { ridesFiniteVerb: record.ridesFiniteVerb } : {}),
        ...(typeof record.ridingClauseId === "string" ? { ridingClauseId: record.ridingClauseId } : {}),
        ...(isSemanticRelation(record.semanticRelation) ? { semanticRelation: record.semanticRelation } : {})
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
