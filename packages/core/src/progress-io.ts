import {
  getReaderBookInfo,
  readReaderBook,
  readerBookIdFromWorkshopSlug,
  workshopProgressKeys,
  workshopStorageSlug,
  type ReaderBookId
} from "./reader-book";
import type { ProgressKeyInfo } from "./progress-keys";

export interface ProgressBundle {
  schema: 1;
  /** Workshop storage slug (`titus`, `1juan`, …). Legacy exports always used `titus`. */
  book: string;
  exportedAt: string;
  data: Record<string, unknown>;
  source?: "cgv-reader" | "cgv-suite";
}

/**
 * Progress keys for **one** workshop book only (Mark + Structure + Reader notes).
 * Never merges another book’s keys — books are independent.
 */
export function progressKeysForBook(bookId: ReaderBookId): ProgressKeyInfo[] {
  const keys = workshopProgressKeys(bookId);
  const entries: ProgressKeyInfo[] = [
    { key: keys.readerNotes, label: "Notes" },
    { key: keys.finiteMarks, label: "Finite verb marks (Brick 1)" },
    { key: keys.nominalHeads, label: "Nominal clause heads" },
    { key: keys.commandMarks, label: "Command mood marks" },
    { key: keys.statementMarks, label: "Statement mood marks" },
    { key: keys.subjunctiveMarks, label: "Subjunctive mood marks" },
    { key: keys.optativeMarks, label: "Optative mood marks" },
    { key: keys.commandRecipients, label: "Command recipients" },
    { key: keys.dependentIntroducers, label: "Dependent introducer marks" },
    { key: keys.participleMarks, label: "Participle marks (Brick 4)" },
    { key: keys.clauseAssignments, label: "Clause spans" },
    { key: keys.clauseObservations, label: "Clause observations" },
    { key: keys.participleObservations, label: "Participle classifications" },
    { key: keys.participleSubjectHosts, label: "Participle subject hosts" },
    { key: keys.clauseActors, label: "Clause actors (SVO)" },
    { key: keys.h3Flow, label: "H3 flow developments" },
    { key: keys.contrasts, label: "Contrast observations" },
    { key: keys.bookDefinitions, label: "Book definitions" },
    { key: keys.bookThread, label: "Book thread" }
  ];
  if (keys.clauseAssignmentsLegacy) {
    entries.push({ key: keys.clauseAssignmentsLegacy, label: "Clause spans (legacy)" });
  }
  return entries;
}

export function buildProgressBundle(bookId: ReaderBookId = readReaderBook()): ProgressBundle {
  const data: Record<string, unknown> = {};

  for (const { key } of progressKeysForBook(bookId)) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      // Skip corrupt entries.
    }
  }

  return {
    schema: 1,
    book: workshopStorageSlug(bookId),
    exportedAt: new Date().toISOString(),
    data,
    source: "cgv-reader"
  };
}

export function downloadProgressFile(bookId: ReaderBookId = readReaderBook()): void {
  const bundle = buildProgressBundle(bookId);
  const slug = workshopStorageSlug(bookId);
  const date = bundle.exportedAt.slice(0, 10);
  // No path separators — browsers turn `cgv-reader/…` into `cgv-reader_…`.
  const filename = `cgv-reader-${slug}-progress-${date}.json`;
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function readProgressFile(file: File): Promise<unknown> {
  return file.text().then(text => JSON.parse(text));
}

export interface ImportSummary {
  restoredCount: number;
  /** Keys in the file that are not progress keys for this book’s slug. */
  unrecognizedKeys: string[];
  /** Keys skipped because they belong to another book (must never restore). */
  skippedForeignKeys: string[];
}

export function applyProgressBundle(bundle: unknown): ImportSummary {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("That file doesn't look like a Reader progress export.");
  }

  const record = bundle as Record<string, unknown>;
  if (typeof record.book !== "string" || !record.data || typeof record.data !== "object") {
    throw new Error("That file doesn't look like a Reader progress export.");
  }

  // Accept schema 1 bundles from this app and the former cgv-suite / lab export.
  if (record.schema !== undefined && record.schema !== 1) {
    throw new Error(`Unsupported progress schema: ${String(record.schema)}`);
  }

  const bookId = readerBookIdFromWorkshopSlug(record.book);
  if (!bookId) {
    throw new Error(`Unknown progress book slug: ${record.book}`);
  }

  const allowed = new Set(progressKeysForBook(bookId).map(entry => entry.key));
  const data = record.data as Record<string, unknown>;
  const unrecognizedKeys: string[] = [];
  const skippedForeignKeys: string[] = [];
  let restoredCount = 0;

  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key)) {
      // Another book’s stores (or unknown keys) must never wipe this browser’s other books.
      if (looksLikeWorkshopProgressKey(key)) skippedForeignKeys.push(key);
      else unrecognizedKeys.push(key);
      continue;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
    restoredCount += 1;
  }

  return { restoredCount, unrecognizedKeys, skippedForeignKeys };
}

function looksLikeWorkshopProgressKey(key: string): boolean {
  return (
    key.startsWith("o-prototype:") ||
    key.startsWith("roots:") ||
    key.startsWith("the-reader:spanish-clause-builder:") ||
    /^the-reader:[^:]+:notes$/.test(key)
  );
}

/** Count how many progress keys for the **current** book already have data. */
export function countExistingProgressKeys(bookId: ReaderBookId = readReaderBook()): number {
  let count = 0;
  for (const { key } of progressKeysForBook(bookId)) {
    if (window.localStorage.getItem(key) !== null) count += 1;
  }
  return count;
}

export function progressExportLabel(bookId: ReaderBookId = readReaderBook()): string {
  return getReaderBookInfo(bookId).displayName;
}
