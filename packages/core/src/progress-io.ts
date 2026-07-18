import { PROGRESS_KEYS } from "./progress-keys";

const KNOWN_KEYS = new Set(PROGRESS_KEYS.map(entry => entry.key));

export interface ProgressBundle {
  schema: 1;
  book: "titus";
  exportedAt: string;
  data: Record<string, unknown>;
  source?: "cgv-reader" | "cgv-suite";
}

export function buildProgressBundle(): ProgressBundle {
  const data: Record<string, unknown> = {};

  for (const { key } of PROGRESS_KEYS) {
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
    book: "titus",
    exportedAt: new Date().toISOString(),
    data,
    source: "cgv-reader"
  };
}

const EXPORT_SUBFOLDER = "cgv-reader";

export function downloadProgressFile(): void {
  const bundle = buildProgressBundle();
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${EXPORT_SUBFOLDER}/titus-progress-${bundle.exportedAt.slice(0, 10)}.json`;
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
    throw new Error("That file doesn't look like a Titus progress export.");
  }

  const record = bundle as Record<string, unknown>;
  if (record.book !== "titus" || !record.data || typeof record.data !== "object") {
    throw new Error("That file doesn't look like a Titus progress export.");
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

/** Count how many lab/suite Titus keys already have data in this browser. */
export function countExistingProgressKeys(): number {
  let count = 0;
  for (const { key } of PROGRESS_KEYS) {
    if (window.localStorage.getItem(key) !== null) count += 1;
  }
  return count;
}
