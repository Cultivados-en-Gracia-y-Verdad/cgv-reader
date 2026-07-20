// Reader Bible-version preference — independent of UI language and of Observer's
// LBF / MorphGNT stack (cgv-product-suite-spec.md).

export const BIBLE_VERSION_KEY = "the-reader:titus:bible-version";

/** Versions with Reader text for the NT (LBF is Titus-only until more LBF ships). */
export type BibleVersionId = "NBLA" | "BLE" | "SPNBES" | "RV1909" | "LBF";

export const DEFAULT_BIBLE_VERSION: BibleVersionId = "NBLA";

export interface BibleVersionInfo {
  id: BibleVersionId;
  /** Short label in the prefs UI */
  label: string;
  /** Longer description */
  description: string;
}

export const BIBLE_VERSIONS: BibleVersionInfo[] = [
  { id: "NBLA", label: "NBLA", description: "Nueva Biblia de las Américas" },
  { id: "BLE", label: "BLE", description: "Biblia Literal en Español (working gloss)" },
  { id: "SPNBES", label: "SPNBES", description: "Biblia en Español Sencillo" },
  { id: "RV1909", label: "RV1909", description: "Reina Valera 1909" },
  { id: "LBF", label: "LBF", description: "La Biblia Fiel — Titus only (Observer Spanish)" }
];

const VALID = new Set<string>(BIBLE_VERSIONS.map(entry => entry.id));

const LISTENERS = new Set<(version: BibleVersionId) => void>();

export function isBibleVersionId(value: string): value is BibleVersionId {
  return VALID.has(value);
}

export function readBibleVersion(): BibleVersionId {
  try {
    const stored = window.localStorage.getItem(BIBLE_VERSION_KEY);
    if (stored && isBibleVersionId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_BIBLE_VERSION;
}

export function writeBibleVersion(version: BibleVersionId): void {
  window.localStorage.setItem(BIBLE_VERSION_KEY, version);
  for (const listener of LISTENERS) listener(version);
}

export function subscribeBibleVersion(listener: (version: BibleVersionId) => void): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}
