// Compiler reading-block Bible version — independent of Reader prefs and of
// Observer's LBF outline spans (#### / - / + stay LBF from O).

import {
  BIBLE_VERSIONS,
  DEFAULT_BIBLE_VERSION,
  isBibleVersionId,
  type BibleVersionId,
  type BibleVersionInfo
} from "./bible-version";

export const COMPILER_BIBLE_VERSION_KEY = "the-reader:compiler:bible-version";

/** Default reading quotes to LBF so they match Observer Spanish. */
export const DEFAULT_COMPILER_BIBLE_VERSION: BibleVersionId = "LBF";

export const COMPILER_BIBLE_VERSIONS: BibleVersionInfo[] = BIBLE_VERSIONS;

const LISTENERS = new Set<(version: BibleVersionId) => void>();

export function readCompilerBibleVersion(): BibleVersionId {
  try {
    const stored = window.localStorage.getItem(COMPILER_BIBLE_VERSION_KEY);
    if (stored && isBibleVersionId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_COMPILER_BIBLE_VERSION;
}

export function writeCompilerBibleVersion(version: BibleVersionId): void {
  window.localStorage.setItem(COMPILER_BIBLE_VERSION_KEY, version);
  for (const listener of LISTENERS) listener(version);
}

export function subscribeCompilerBibleVersion(
  listener: (version: BibleVersionId) => void
): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}

// Re-export for callers that only import this module.
export type { BibleVersionId, BibleVersionInfo };
export { DEFAULT_BIBLE_VERSION };
