import { parseReferenceParts } from "./parse-reference";
import { normalizeReferenceText } from "./normalize";
import type { BibleIndex, BibleVerse, ResolveBibleReferenceResult } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getReferenceVerses(
  index: BibleIndex,
  book: string,
  chapter: number,
  startVerse: number,
  endVerse = startVerse
): BibleVerse[] {
  const normalizedBook = normalizeReferenceText(book);
  const verses: BibleVerse[] = [];

  for (let verse = startVerse; verse <= endVerse; verse += 1) {
    const reference = index.references.get(`${normalizedBook}.${chapter}.${verse}`);
    if (reference) verses.push(reference);
  }

  return verses;
}

function getChapterVerseCount(index: BibleIndex, book: string, chapter: number): number {
  return index.chapterVerseCounts.get(`${normalizeReferenceText(book)}.${chapter}`) || 0;
}

function getChapterVerses(index: BibleIndex, book: string, chapter: number): BibleVerse[] {
  const count = getChapterVerseCount(index, book, chapter);
  if (!count) return [];
  return getReferenceVerses(index, book, chapter, 1, count);
}

function getReferenceRangeVerses(
  index: BibleIndex,
  book: string,
  startChapter: number,
  startVerse: number,
  endChapter: number,
  endVerse: number
): BibleVerse[] {
  if (endChapter < startChapter) return [];

  const verses: BibleVerse[] = [];

  for (let chapter = startChapter; chapter <= endChapter; chapter += 1) {
    const chapterVerseCount = getChapterVerseCount(index, book, chapter);
    if (!chapterVerseCount) continue;

    const firstVerse = chapter === startChapter ? startVerse : 1;
    const lastVerse = chapter === endChapter ? endVerse : chapterVerseCount;
    verses.push(...getReferenceVerses(index, book, chapter, firstVerse, lastVerse));
  }

  return verses;
}

function versesForPart(index: BibleIndex, part: ReturnType<typeof parseReferenceParts>[number]): BibleVerse[] {
  switch (part.kind) {
    case "chapter":
      return getChapterVerses(index, part.book, part.chapter || 0);
    case "chapter-range":
      return getReferenceRangeVerses(
        index,
        part.book,
        part.startChapter || 0,
        1,
        part.endChapter || 0,
        getChapterVerseCount(index, part.book, part.endChapter || 0)
      );
    case "range":
      return getReferenceRangeVerses(
        index,
        part.book,
        part.startChapter || 0,
        part.startVerse || 0,
        part.endChapter || 0,
        part.endVerse || 0
      );
    case "verses":
      return getReferenceVerses(
        index,
        part.book,
        part.chapter || 0,
        part.startVerse || 0,
        part.endVerse || 0
      );
    default:
      return [];
  }
}

export function resolveBibleReference(
  referenceText: string,
  index: BibleIndex
): ResolveBibleReferenceResult | null {
  const trimmed = referenceText.trim();
  if (!trimmed || !index.bookPatterns.length) return null;

  const bookPattern = index.bookPatterns.map(escapeRegExp).join("|");
  const pattern = new RegExp(`^(${bookPattern})\\s+(.+)$`, "i");
  const match = trimmed.match(pattern);

  if (!match) return null;

  const book = match[1].trim();
  const remainder = match[2].trim();
  const verses = parseReferenceParts(book, remainder)
    .flatMap(part => versesForPart(index, part));

  if (!verses.length) return null;

  return { reference: trimmed, verses };
}
