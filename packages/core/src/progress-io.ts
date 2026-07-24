import {
  getReaderBookInfo,
  readReaderBook,
  workshopProgressKeys,
  workshopStorageSlug,
  type ReaderBookId
} from "./reader-book";
import { NOTES_KEY, PROGRESS_KEYS, type ProgressKeyInfo } from "./progress-keys";

const KNOWN_KEYS = new Set(PROGRESS_KEYS.map(entry => entry.key));

export interface ProgressBundle {
  schema: 1;
  /** Workshop storage slug (`titus`, `mateo`, …). Legacy exports always used `titus`. */
  book: string;
  exportedAt: string;
  data: Record<string, unknown>;
  source?: "cgv-reader" | "cgv-suite";
}

/** Progress keys for one workshop book (Mark + Structure), plus shared Reader notes. */
export function progressKeysForBook(bookId: ReaderBookId): ProgressKeyInfo[] {
  const keys = workshopProgressKeys(bookId);
  const entries: ProgressKeyInfo[] = [
    { key: NOTES_KEY, label: "Notes" },
    { key: keys.finiteMarks, label: "Finite verb marks (Brick 1)" },
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
    { key: keys.h3Flow, label: "H3 flow developments" }
  ];
  if (keys.clauseAssignmentsLegacy) {
    entries.push({ key: keys.clauseAssignmentsLegacy, label: "Clause spans (legacy)" });
  }
  return entries;
}

function collectKeySet(bookId: ReaderBookId): ProgressKeyInfo[] {
  const byKey = new Map<string, ProgressKeyInfo>();
  for (const entry of PROGRESS_KEYS) byKey.set(entry.key, entry);
  for (const entry of progressKeysForBook(bookId)) byKey.set(entry.key, entry);
  return Array.from(byKey.values());
}

export function buildProgressBundle(bookId: ReaderBookId = readReaderBook()): ProgressBundle {
  const data: Record<string, unknown> = {};

  for (const { key } of collectKeySet(bookId)) {
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
  unrecognizedKeys: string[];
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

  const data = record.data as Record<string, unknown>;
  const unrecognizedKeys: string[] = [];
  let restoredCount = 0;

  for (const [key, value] of Object.entries(data)) {
    window.localStorage.setItem(key, JSON.stringify(value));
    restoredCount += 1;
    if (!KNOWN_KEYS.has(key)) unrecognizedKeys.push(key);
  }

  return { restoredCount, unrecognizedKeys };
}

/** Count how many known progress keys already have data in this browser. */
export function countExistingProgressKeys(): number {
  let count = 0;
  const seen = new Set<string>();
  for (const { key } of PROGRESS_KEYS) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (window.localStorage.getItem(key) !== null) count += 1;
  }
  try {
    for (const { key } of progressKeysForBook(readReaderBook())) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (window.localStorage.getItem(key) !== null) count += 1;
    }
  } catch {
    /* non-browser */
  }
  return count;
}

export function progressExportLabel(bookId: ReaderBookId = readReaderBook()): string {
  return getReaderBookInfo(bookId).displayName;
}
