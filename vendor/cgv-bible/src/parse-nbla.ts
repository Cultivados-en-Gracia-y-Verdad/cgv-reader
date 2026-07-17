import type { BibleVerse } from "./types";

export function parseNblaContent(content: string): BibleVerse[] {
  const verses: BibleVerse[] = [];

  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const match =
      line.match(/^(.+?)\s+(\d+):(\d+)\s+(.+)$/) ||
      line.match(/^#+\s*(.+?)\s+(\d+):(\d+)\s*$/);

    if (!match) continue;

    const book = match[1].trim();
    const chapter = Number(match[2]);
    const verse = Number(match[3]);
    const text = (match[4] || "").trim();

    if (!book || !chapter || !verse) continue;

    verses.push({ book, chapter, verse, text });
  }

  return verses;
}
