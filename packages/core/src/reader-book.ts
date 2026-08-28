// Reader book selection. Observer Structure stays NT MorphGNT until OT spine exists.

import type { BibleVersionId } from "./bible-version";
import { GENERATED_READER_BOOKS } from "./reader-books.generated";

export const READER_BOOK_KEY = "the-reader:selected-book";

/** File / token slug used across the selected cgv-data dataset. */
export type ReaderBookId = (typeof GENERATED_READER_BOOKS)[number]["id"];

export interface ReaderBookInfo {
  id: ReaderBookId;
  /** Stable note / verse key book name (`Tito.1.1`). */
  displayName: string;
  /** RV1909 Aquifer book number (01–66 Protestant canon). */
  rv1909: string;
  /** Testament for LBF path / morph spine selection. */
  testament: "ot" | "nt";
  /** Bible texts actually present in the selected cgv-data dataset. */
  versions: readonly BibleVersionId[];
  /** MorphGNT filename stem for NT books; empty for OT books. */
  morphGntStem: string;
  /** Whether the selected dataset publishes an OSHB token spine. */
  hasOshb: boolean;
}

/** Whole NT plus OT books with published LBF text, generated in canonical order. */
export const READER_BOOKS: readonly ReaderBookInfo[] = GENERATED_READER_BOOKS;

export const DEFAULT_READER_BOOK: ReaderBookId = "tito";

const BY_ID = new Map(READER_BOOKS.map(book => [book.id, book]));
const VALID = new Set<string>(READER_BOOKS.map(book => book.id));

const LISTENERS = new Set<(bookId: ReaderBookId) => void>();

export function isReaderBookId(value: string): value is ReaderBookId {
  return VALID.has(value);
}

export function getReaderBookInfo(bookId: ReaderBookId): ReaderBookInfo {
  const info = BY_ID.get(bookId);
  if (!info) throw new Error(`Unknown reader book: ${bookId}`);
  return info;
}

export function readReaderBook(): ReaderBookId {
  try {
    const stored = window.localStorage.getItem(READER_BOOK_KEY);
    if (stored && isReaderBookId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_READER_BOOK;
}

export function writeReaderBook(bookId: ReaderBookId): void {
  window.localStorage.setItem(READER_BOOK_KEY, bookId);
  for (const listener of LISTENERS) listener(bookId);
}

export function subscribeReaderBook(listener: (bookId: ReaderBookId) => void): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}

type BookPresence = (bookId: ReaderBookId) => boolean;

let publishedLbfText: BookPresence | null = null;
let publishedLbfStructure: BookPresence | null = null;

/**
 * The Reader registers these from the cgv-data globs (`.lbf.md` / alignment JSON).
 * Until then both predicates are false — no handwritten book lists.
 */
export function registerPublishedLbfAssets(text: BookPresence, structure: BookPresence): void {
  publishedLbfText = text;
  publishedLbfStructure = structure;
}

/** LBF available as a Reader bible version — true when `{id}.lbf.md` is published. */
export function readerBookHasLbf(bookId: ReaderBookId): boolean {
  return publishedLbfText ? publishedLbfText(bookId) : false;
}

/**
 * Observer Structure / Compiler — true when reverse-interlinear alignment is
 * present in cgv-data (`bibles/LBF/alignments/{id}.alignment.json`) or the
 * local Reader fallback (`data/lbf/{nt|ot}/*.alignment.json`).
 */
export function readerBookHasLbfStructure(bookId: ReaderBookId): boolean {
  return publishedLbfStructure ? publishedLbfStructure(bookId) : false;
}

/** MorphGNT Mark layer (NT). */
export function readerBookHasMorphGnt(bookId: ReaderBookId): boolean {
  return Boolean(MORPHGNT_STEM_BY_BOOK[bookId]);
}

/** OSHB/WLC Mark spine (OT). */
export function readerBookHasOshb(bookId: ReaderBookId): boolean {
  return getReaderBookInfo(bookId).hasOshb;
}

/** Observer Mark can load a source-language spine for this book. */
export function readerBookHasObserverMark(bookId: ReaderBookId): boolean {
  return readerBookHasMorphGnt(bookId) || readerBookHasOshb(bookId);
}

/** Bible versions present in cgv-data for this book (Reader prefs). */
export function readerBookHasBibleVersion(bookId: ReaderBookId, version: BibleVersionId): boolean {
  if (version === "LBF") return readerBookHasLbf(bookId);
  return getReaderBookInfo(bookId).versions.includes(version);
}

/**
 * localStorage slug for workshop progress.
 * Tito keeps the legacy lab slug `titus` so existing progress migrates.
 */
export function workshopStorageSlug(bookId: ReaderBookId): string {
  return bookId === "tito" ? "titus" : bookId;
}

/** Inverse of workshopStorageSlug — for progress import (`book` field). */
export function readerBookIdFromWorkshopSlug(slug: string): ReaderBookId | null {
  if (slug === "titus") return "tito";
  if (isReaderBookId(slug)) return slug;
  return null;
}

/** MorphGNT filename stem under morphology/MorphGNT/ (e.g. `77-Tit`). */
export const MORPHGNT_STEM_BY_BOOK = Object.fromEntries(
  READER_BOOKS.map(book => [book.id, book.morphGntStem])
) as Record<ReaderBookId, string>;

export interface WorkshopProgressKeys {
  finiteMarks: string;
  /**
   * Greek tokens marked as the predicate head of a verbless (nominal) clause —
   * 1 Peter 3:8's Τὸ δὲ τέλος πάντες ὁμόφρονες… carries an imperatival force with
   * no finite verb anywhere in it. Kept apart from finiteMarks so Brick 1 still
   * checks against MorphGNT's finite tags, but treated as a clause anchor
   * everywhere downstream: without one, any ὅτι/ἵνα explaining such a clause has
   * nothing to attach to.
   */
  nominalHeads: string;
  commandMarks: string;
  statementMarks: string;
  subjunctiveMarks: string;
  optativeMarks: string;
  participleMarks: string;
  commandRecipients: string;
  dependentIntroducers: string;
  /** Reader margin notes — scoped per workshop book (`the-reader:{slug}:notes`). */
  readerNotes: string;
  clauseAssignments: string;
  clauseAssignmentsLegacy: string | null;
  clauseObservations: string;
  participleObservations: string;
  /** Manual subject-host word spans for nominative participles (clauseId or verseKey → word ids). */
  participleSubjectHosts: string;
  /** Per finite clause: subject / verb / object spans (SVO actor observations). */
  clauseActors: string;
  /** H3 flow: accepted development breaks + ignored suggestions. */
  h3Flow: string;
  /** Student-marked contrast pairs (poleA / poleB on a verse). */
  contrasts: string;
  /** Book definitions dossiers (authorial use — propose/confirm). */
  bookDefinitions: string;
  /** Student-named book movement thread (waypoints + labels). */
  bookThread: string;
}

export function workshopProgressKeys(bookId: ReaderBookId): WorkshopProgressKeys {
  const s = workshopStorageSlug(bookId);
  return {
    finiteMarks: `o-prototype:${s}:finite-verb-marks`,
    nominalHeads: `roots:${s}:brick1b:nominalClauseHeads`,
    commandMarks: `roots:${s}:brick2:mood:imperativeCandidates`,
    statementMarks: `roots:${s}:brick2c:mood:statementCandidates`,
    subjunctiveMarks: `roots:${s}:brick3:mood:subjunctiveCandidates`,
    optativeMarks: `roots:${s}:brick3c:mood:optativeCandidates`,
    participleMarks: `roots:${s}:brick4:participleCandidates`,
    commandRecipients: `roots:${s}:brick2b:commandRecipients`,
    dependentIntroducers: `roots:${s}:brick3:dependentThoughtIntroducers`,
    readerNotes: `the-reader:${s}:notes`,
    clauseAssignments: `the-reader:spanish-clause-builder:${s}:v3`,
    clauseAssignmentsLegacy: s === "titus" ? "the-reader:clause-builder:titus:1:1-4:v2" : null,
    clauseObservations: `the-reader:spanish-clause-builder:${s}:statement-command-review:v1`,
    participleObservations: `the-reader:spanish-clause-builder:${s}:participles:v1`,
    participleSubjectHosts: `the-reader:spanish-clause-builder:${s}:participle-subjects:v1`,
    clauseActors: `the-reader:spanish-clause-builder:${s}:clause-actors:v1`,
    h3Flow: `the-reader:spanish-clause-builder:${s}:h3-flow:v1`,
    contrasts: `the-reader:spanish-clause-builder:${s}:contrasts:v1`,
    bookDefinitions: `the-reader:spanish-clause-builder:${s}:book-definitions:v1`,
    bookThread: `the-reader:spanish-clause-builder:${s}:book-thread:v1`
  };
}
