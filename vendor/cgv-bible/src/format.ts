import type { BibleVerse } from "./types";

export function formatBibleVerseLabel(verse: BibleVerse): string {
  return `${verse.book} ${verse.chapter}:${verse.verse}`;
}

/** Plain scripture line for CGV manual (verse text only, joined for ranges). */
export function formatScriptureLine(verses: BibleVerse[]): string {
  return verses.map(verse => verse.text.trim()).filter(Boolean).join(" ");
}

export function formatBiblePopupText(verses: BibleVerse[]): string {
  return verses
    .map(verse => `${formatBibleVerseLabel(verse)} ${verse.text}`)
    .join("\n\n");
}
