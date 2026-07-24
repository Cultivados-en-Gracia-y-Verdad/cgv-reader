// Reader book selection (NT). Observer / Compiler stay Titus until more LBF exists.

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
  | "apocalipsis";

export interface ReaderBookInfo {
  id: ReaderBookId;
  /** Stable note / verse key book name (`Tito.1.1`). */
  displayName: string;
  /** RV1909 Aquifer book number (40–66 for NT). */
  rv1909: string;
}

/** New Testament in canonical order. */
export const READER_BOOKS: ReaderBookInfo[] = [
  { id: "mateo", displayName: "Mateo", rv1909: "40" },
  { id: "marcos", displayName: "Marcos", rv1909: "41" },
  { id: "lucas", displayName: "Lucas", rv1909: "42" },
  { id: "juan", displayName: "Juan", rv1909: "43" },
  { id: "hechos", displayName: "Hechos", rv1909: "44" },
  { id: "romanos", displayName: "Romanos", rv1909: "45" },
  { id: "1corintios", displayName: "1 Corintios", rv1909: "46" },
  { id: "2corintios", displayName: "2 Corintios", rv1909: "47" },
  { id: "galatas", displayName: "Gálatas", rv1909: "48" },
  { id: "efesios", displayName: "Efesios", rv1909: "49" },
  { id: "filipenses", displayName: "Filipenses", rv1909: "50" },
  { id: "colosenses", displayName: "Colosenses", rv1909: "51" },
  { id: "1tesalonicenses", displayName: "1 Tesalonicenses", rv1909: "52" },
  { id: "2tesalonicenses", displayName: "2 Tesalonicenses", rv1909: "53" },
  { id: "1timoteo", displayName: "1 Timoteo", rv1909: "54" },
  { id: "2timoteo", displayName: "2 Timoteo", rv1909: "55" },
  { id: "tito", displayName: "Tito", rv1909: "56" },
  { id: "filemon", displayName: "Filemón", rv1909: "57" },
  { id: "hebreos", displayName: "Hebreos", rv1909: "58" },
  { id: "santiago", displayName: "Santiago", rv1909: "59" },
  { id: "1pedro", displayName: "1 Pedro", rv1909: "60" },
  { id: "2pedro", displayName: "2 Pedro", rv1909: "61" },
  { id: "1juan", displayName: "1 Juan", rv1909: "62" },
  { id: "2juan", displayName: "2 Juan", rv1909: "63" },
  { id: "3juan", displayName: "3 Juan", rv1909: "64" },
  { id: "judas", displayName: "Judas", rv1909: "65" },
  { id: "apocalipsis", displayName: "Apocalipsis", rv1909: "66" }
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

/** Books with LBF reading text under `data/lbf/nt/{id}.md`. */
const LBF_TEXT_BOOKS = new Set<ReaderBookId>(["tito", "1pedro"]);

/** LBF available as a Reader bible version. */
export function readerBookHasLbf(bookId: ReaderBookId): boolean {
  return LBF_TEXT_BOOKS.has(bookId);
}

/**
 * Observer Structure / Compiler need reverse-interlinear alignment, not just
 * reading text. Titus only until each book gets `*.alignment.json` + wiring.
 */
export function readerBookHasLbfStructure(bookId: ReaderBookId): boolean {
  return bookId === "tito" || bookId === "1pedro";
}

/**
 * localStorage slug for workshop progress.
 * Tito keeps the legacy lab slug `titus` so existing progress migrates.
 */
export function workshopStorageSlug(bookId: ReaderBookId): string {
  return bookId === "tito" ? "titus" : bookId;
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
  apocalipsis: "87-Re"
};

export interface WorkshopProgressKeys {
  finiteMarks: string;
  commandMarks: string;
  statementMarks: string;
  subjunctiveMarks: string;
  optativeMarks: string;
  participleMarks: string;
  commandRecipients: string;
  dependentIntroducers: string;
  clauseAssignments: string;
  clauseAssignmentsLegacy: string | null;
  clauseObservations: string;
  participleObservations: string;
  /** Manual subject-host word spans for nominative participles (clauseId or verseKey → word ids). */
  participleSubjectHosts: string;
  /** Per finite clause: subject / verb / object spans (SVO actor observations). */
  clauseActors: string;
}

export function workshopProgressKeys(bookId: ReaderBookId): WorkshopProgressKeys {
  const s = workshopStorageSlug(bookId);
  return {
    finiteMarks: `o-prototype:${s}:finite-verb-marks`,
    commandMarks: `roots:${s}:brick2:mood:imperativeCandidates`,
    statementMarks: `roots:${s}:brick2c:mood:statementCandidates`,
    subjunctiveMarks: `roots:${s}:brick3:mood:subjunctiveCandidates`,
    optativeMarks: `roots:${s}:brick3c:mood:optativeCandidates`,
    participleMarks: `roots:${s}:brick4:participleCandidates`,
    commandRecipients: `roots:${s}:brick2b:commandRecipients`,
    dependentIntroducers: `roots:${s}:brick3:dependentThoughtIntroducers`,
    clauseAssignments: `the-reader:spanish-clause-builder:${s}:v3`,
    clauseAssignmentsLegacy: s === "titus" ? "the-reader:clause-builder:titus:1:1-4:v2" : null,
    clauseObservations: `the-reader:spanish-clause-builder:${s}:statement-command-review:v1`,
    participleObservations: `the-reader:spanish-clause-builder:${s}:participles:v1`,
    participleSubjectHosts: `the-reader:spanish-clause-builder:${s}:participle-subjects:v1`,
    clauseActors: `the-reader:spanish-clause-builder:${s}:clause-actors:v1`
  };
}
