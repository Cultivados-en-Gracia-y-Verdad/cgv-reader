// Reader book selection. Observer Structure stays NT MorphGNT until OT spine exists.

import type { BibleVersionId } from "./bible-version";

export const READER_BOOK_KEY = "the-reader:selected-book";

/** File / token slug used across cgv-data (lowercase, no spaces). */
export type ReaderBookId =
  | "mateo"
  | "marcos"
  | "lucas"
  | "juan"
  | "hechos"
  | "romanos"
  | "1corintios"
  | "2corintios"
  | "galatas"
  | "efesios"
  | "filipenses"
  | "colosenses"
  | "1tesalonicenses"
  | "2tesalonicenses"
  | "1timoteo"
  | "2timoteo"
  | "tito"
  | "filemon"
  | "hebreos"
  | "santiago"
  | "1pedro"
  | "2pedro"
  | "1juan"
  | "2juan"
  | "3juan"
  | "judas"
  | "apocalipsis"
  | "daniel"
  | "zacarias";

export interface ReaderBookInfo {
  id: ReaderBookId;
  /** Stable note / verse key book name (`Tito.1.1`). */
  displayName: string;
  /** RV1909 Aquifer book number (01–66 Protestant canon). */
  rv1909: string;
  /** Testament for LBF path / morph spine selection. */
  testament: "ot" | "nt";
}

/** Reader books (NT + OT drafts as they gain LBF / bible text). */
export const READER_BOOKS: ReaderBookInfo[] = [
  { id: "mateo", displayName: "Mateo", rv1909: "40", testament: "nt" },
  { id: "marcos", displayName: "Marcos", rv1909: "41", testament: "nt" },
  { id: "lucas", displayName: "Lucas", rv1909: "42", testament: "nt" },
  { id: "juan", displayName: "Juan", rv1909: "43", testament: "nt" },
  { id: "hechos", displayName: "Hechos", rv1909: "44", testament: "nt" },
  { id: "romanos", displayName: "Romanos", rv1909: "45", testament: "nt" },
  { id: "1corintios", displayName: "1 Corintios", rv1909: "46", testament: "nt" },
  { id: "2corintios", displayName: "2 Corintios", rv1909: "47", testament: "nt" },
  { id: "galatas", displayName: "Gálatas", rv1909: "48", testament: "nt" },
  { id: "efesios", displayName: "Efesios", rv1909: "49", testament: "nt" },
  { id: "filipenses", displayName: "Filipenses", rv1909: "50", testament: "nt" },
  { id: "colosenses", displayName: "Colosenses", rv1909: "51", testament: "nt" },
  { id: "1tesalonicenses", displayName: "1 Tesalonicenses", rv1909: "52", testament: "nt" },
  { id: "2tesalonicenses", displayName: "2 Tesalonicenses", rv1909: "53", testament: "nt" },
  { id: "1timoteo", displayName: "1 Timoteo", rv1909: "54", testament: "nt" },
  { id: "2timoteo", displayName: "2 Timoteo", rv1909: "55", testament: "nt" },
  { id: "tito", displayName: "Tito", rv1909: "56", testament: "nt" },
  { id: "filemon", displayName: "Filemón", rv1909: "57", testament: "nt" },
  { id: "hebreos", displayName: "Hebreos", rv1909: "58", testament: "nt" },
  { id: "santiago", displayName: "Santiago", rv1909: "59", testament: "nt" },
  { id: "1pedro", displayName: "1 Pedro", rv1909: "60", testament: "nt" },
  { id: "2pedro", displayName: "2 Pedro", rv1909: "61", testament: "nt" },
  { id: "1juan", displayName: "1 Juan", rv1909: "62", testament: "nt" },
  { id: "2juan", displayName: "2 Juan", rv1909: "63", testament: "nt" },
  { id: "3juan", displayName: "3 Juan", rv1909: "64", testament: "nt" },
  { id: "judas", displayName: "Judas", rv1909: "65", testament: "nt" },
  { id: "apocalipsis", displayName: "Apocalipsis", rv1909: "66", testament: "nt" },
  { id: "daniel", displayName: "Daniel", rv1909: "27", testament: "ot" },
  { id: "zacarias", displayName: "Zacarías", rv1909: "38", testament: "ot" }
];

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

/** Books with published LBF reading text in cgv-data (`bibles/LBF/{id}.lbf.md`). */
const LBF_TEXT_BOOKS = new Set<ReaderBookId>([
  "tito",
  "1pedro",
  "judas",
  "1juan",
  "filipenses",
  "daniel",
  "zacarias"
]);

/** LBF available as a Reader bible version. */
export function readerBookHasLbf(bookId: ReaderBookId): boolean {
  return LBF_TEXT_BOOKS.has(bookId);
}

/**
 * Observer Structure / Compiler need published reverse-interlinear alignment.
 * Consume cgv-data first (`bibles/LBF/alignments/{id}.alignment.json`), then
 * the local Reader fallback (`data/lbf/{nt|ot}/*.alignment.json`).
 *
 * Zacarías: signed LBF + hand alignment are published in cgv-data.
 * Daniel still uses the local OT fallback until its alignment is published
 * under `bibles/LBF/alignments/`.
 */
export function readerBookHasLbfStructure(bookId: ReaderBookId): boolean {
  return (
    bookId === "tito" ||
    bookId === "1pedro" ||
    bookId === "judas" ||
    bookId === "1juan" ||
    bookId === "filipenses" ||
    bookId === "daniel" ||
    bookId === "zacarias"
  );
}

/** MorphGNT Mark layer (NT). */
export function readerBookHasMorphGnt(bookId: ReaderBookId): boolean {
  return Boolean(MORPHGNT_STEM_BY_BOOK[bookId]);
}

/** OSHB/WLC Mark spine (OT). */
export function readerBookHasOshb(bookId: ReaderBookId): boolean {
  return bookId === "daniel" || bookId === "zacarias";
}

/** Observer Mark can load a source-language spine for this book. */
export function readerBookHasObserverMark(bookId: ReaderBookId): boolean {
  return readerBookHasMorphGnt(bookId) || readerBookHasOshb(bookId);
}

/** Bible versions present in cgv-data for this book (Reader prefs). */
export function readerBookHasBibleVersion(bookId: ReaderBookId, version: BibleVersionId): boolean {
  if (version === "LBF") return readerBookHasLbf(bookId);
  if (bookId === "daniel") {
    // No NBLA pack for Daniel; BLE / SPNBES / RV1909 are available (LBF via readerBookHasLbf).
    return version === "BLE" || version === "SPNBES" || version === "RV1909";
  }
  if (bookId === "zacarias") {
    // Zacarías has all four: NBLA / BLE / SPNBES / RV1909 (LBF via readerBookHasLbf).
    return true;
  }
  return true;
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
export const MORPHGNT_STEM_BY_BOOK: Record<ReaderBookId, string> = {
  mateo: "61-Mt",
  marcos: "62-Mk",
  lucas: "63-Lk",
  juan: "64-Jn",
  hechos: "65-Ac",
  romanos: "66-Ro",
  "1corintios": "67-1Co",
  "2corintios": "68-2Co",
  galatas: "69-Ga",
  efesios: "70-Eph",
  filipenses: "71-Php",
  colosenses: "72-Col",
  "1tesalonicenses": "73-1Th",
  "2tesalonicenses": "74-2Th",
  "1timoteo": "75-1Ti",
  "2timoteo": "76-2Ti",
  tito: "77-Tit",
  filemon: "78-Phm",
  hebreos: "79-Heb",
  santiago: "80-Jas",
  "1pedro": "81-1Pe",
  "2pedro": "82-2Pe",
  "1juan": "83-1Jn",
  "2juan": "84-2Jn",
  "3juan": "85-3Jn",
  judas: "86-Jud",
  apocalipsis: "87-Re",
  /** OT — no MorphGNT; the Mark spine is OSHB. */
  daniel: "",
  zacarias: ""
};

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
