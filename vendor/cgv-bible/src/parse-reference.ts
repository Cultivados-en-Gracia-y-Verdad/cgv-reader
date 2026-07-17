interface ParsedReferencePart {
  kind: "chapter" | "chapter-range" | "range" | "verses";
  book: string;
  chapter?: number;
  startChapter?: number;
  endChapter?: number;
  startVerse?: number;
  endVerse?: number;
}

export function parseReferenceParts(book: string, referenceList: string): ParsedReferencePart[] {
  const references: ParsedReferencePart[] = [];
  let currentChapter: number | null = null;

  for (const part of referenceList
    .split(/\s*(?:,|\by\b)\s*/i)
    .map(value => value.trim())
    .filter(Boolean)) {
    const crossChapterRangeMatch = part.match(/^(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}):(\d{1,3}))$/);
    const chapterVerseMatch = part.match(/^(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?$/);
    const chapterRangeMatch = part.match(/^(\d{1,3})(?:[-–](\d{1,3}))?$/);

    if (crossChapterRangeMatch) {
      currentChapter = Number(crossChapterRangeMatch[1]);
      references.push({
        kind: "range",
        book,
        startChapter: Number(crossChapterRangeMatch[1]),
        startVerse: Number(crossChapterRangeMatch[2]),
        endChapter: Number(crossChapterRangeMatch[3]),
        endVerse: Number(crossChapterRangeMatch[4])
      });
      continue;
    }

    if (chapterVerseMatch) {
      currentChapter = Number(chapterVerseMatch[1]);
      const startVerse = Number(chapterVerseMatch[2]);
      const endVerse = chapterVerseMatch[3] ? Number(chapterVerseMatch[3]) : startVerse;
      references.push({
        kind: "verses",
        book,
        chapter: currentChapter,
        startVerse,
        endVerse
      });
      continue;
    }

    if (chapterRangeMatch && currentChapter === null && chapterRangeMatch[2]) {
      references.push({
        kind: "chapter-range",
        book,
        startChapter: Number(chapterRangeMatch[1]),
        endChapter: Number(chapterRangeMatch[2])
      });
      continue;
    }

    if (chapterRangeMatch && currentChapter !== null) {
      const startVerse = Number(chapterRangeMatch[1]);
      const endVerse = chapterRangeMatch[2] ? Number(chapterRangeMatch[2]) : startVerse;
      references.push({
        kind: "verses",
        book,
        chapter: currentChapter,
        startVerse,
        endVerse
      });
      continue;
    }

    if (chapterRangeMatch) {
      references.push({
        kind: "chapter",
        book,
        chapter: Number(chapterRangeMatch[1])
      });
    }
  }

  return references;
}

export type { ParsedReferencePart };
