import { buildBibleBookAliases } from "./aliases";
import { normalizeBibleVersion, normalizeReferenceText } from "./normalize";
import { parseNblaContent } from "./parse-nbla";
import type { BibleFile, BibleIndex, BibleIndexStats } from "./types";

export function buildBibleIndex(files: BibleFile[], version = "NBLA"): BibleIndex {
  const normalizedVersion = normalizeBibleVersion(version);
  const references = new Map<string, ReturnType<typeof parseNblaContent>[number]>();
  const chapterVerseCounts = new Map<string, number>();

  for (const file of files) {
    for (const verse of parseNblaContent(file.content)) {
      const key = `${normalizeReferenceText(verse.book)}.${verse.chapter}.${verse.verse}`;
      references.set(key, verse);

      const chapterKey = `${normalizeReferenceText(verse.book)}.${verse.chapter}`;
      chapterVerseCounts.set(
        chapterKey,
        Math.max(chapterVerseCounts.get(chapterKey) || 0, verse.verse)
      );
    }
  }

  const bookNames = Array.from(
    new Set(Array.from(references.values()).map(reference => reference.book))
  ).sort((a, b) => b.length - a.length);

  const bookPatterns = Array.from(
    new Set(bookNames.flatMap(buildBibleBookAliases))
  ).sort((a, b) => b.length - a.length);

  return {
    version: normalizedVersion,
    references,
    chapterVerseCounts,
    bookNames,
    bookPatterns
  };
}

export function getBibleIndexStats(index: BibleIndex): BibleIndexStats {
  return {
    version: index.version,
    books: index.bookNames.length,
    references: index.references.size
  };
}

export function isEmptyBibleIndex(index: BibleIndex | null | undefined): boolean {
  return !index || index.references.size === 0;
}
