import type { BibleIndex } from "./types";

export interface InlineBibleMatch {
  start: number;
  end: number;
  reference: string;
  book: string;
  referenceList: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildInlineReferencePattern(index: BibleIndex): RegExp | null {
  if (!index.bookPatterns.length) return null;

  const bookPattern = index.bookPatterns.map(escapeRegExp).join("|");
  return new RegExp(
    `\\b(${bookPattern})\\s+((?:\\d{1,3}(?::\\d{1,3})?(?:[-–](?:(?:\\d{1,3}:)?\\d{1,3}))?)(?:\\s*(?:,|y)\\s*(?:(?:\\d{1,3}:)?\\d{1,3})(?:[-–](?:(?:\\d{1,3}:)?\\d{1,3}))?)*)`,
    "gi"
  );
}

function referenceWithBook(book: string, part: string, currentChapter: number | null): string {
  const trimmed = part.trim();
  if (/^\d{1,3}:/.test(trimmed) || currentChapter === null) return `${book} ${trimmed}`;
  return `${book} ${currentChapter}:${trimmed}`;
}

function chapterFromPart(part: string): number | null {
  const chapterVerseMatch = part.match(/^(\d{1,3}):/);
  if (chapterVerseMatch) return Number(chapterVerseMatch[1]);
  return null;
}

function splitReferenceList(
  book: string,
  referenceList: string,
  groupStart: number,
  listStart: number
): InlineBibleMatch[] {
  const matches: InlineBibleMatch[] = [];
  let currentChapter: number | null = null;
  const partPattern =
    /(?:^|\s*(?:,|\by\b)\s*)((?:\d{1,3}:)?\d{1,3}(?:[-–](?:(?:\d{1,3}:)?\d{1,3}))?)/gi;

  for (const partMatch of referenceList.matchAll(partPattern)) {
    if (partMatch.index === undefined) continue;

    const full = partMatch[0];
    const part = partMatch[1];
    const partOffset = partMatch.index + full.lastIndexOf(part);
    const start = partMatch.index === 0 ? groupStart : listStart + partOffset;
    const end = listStart + partOffset + part.length;
    const chapter = chapterFromPart(part);
    if (chapter !== null) currentChapter = chapter;

    matches.push({
      start,
      end,
      reference: referenceWithBook(book, part, currentChapter),
      book,
      referenceList: part
    });
  }

  return matches;
}

export function findInlineBibleReferenceMatches(
  text: string,
  index: BibleIndex
): InlineBibleMatch[] {
  const pattern = buildInlineReferencePattern(index);
  if (!pattern || !text) return [];

  const matches: InlineBibleMatch[] = [];

  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;

    const book = match[1];
    const referenceList = match[2];
    const listStart = match.index + match[0].lastIndexOf(referenceList);
    matches.push(...splitReferenceList(book, referenceList, match.index, listStart));
  }

  return matches;
}

export function getInlineBibleReferenceAtPosition(
  text: string,
  offset: number,
  index: BibleIndex
): InlineBibleMatch | null {
  if (offset < 0) return null;

  return (
    findInlineBibleReferenceMatches(text, index).find(
      match => offset >= match.start && offset < match.end
    ) ?? null
  );
}
