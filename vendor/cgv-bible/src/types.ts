export interface BibleVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleFile {
  fileName: string;
  content: string;
}

export interface BibleIndex {
  version: string;
  references: Map<string, BibleVerse>;
  chapterVerseCounts: Map<string, number>;
  bookNames: string[];
  bookPatterns: string[];
}

export interface ResolveBibleReferenceResult {
  reference: string;
  verses: BibleVerse[];
}

export interface BibleIndexStats {
  version: string;
  books: number;
  references: number;
}
