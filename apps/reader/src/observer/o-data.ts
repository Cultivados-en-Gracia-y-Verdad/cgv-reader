import { getReaderBookInfo, readerBookHasOshb, type ReaderBookId } from "@cgv/core";
import { parseNblaContent } from "cgv-bible";
import type { BibleVerse } from "cgv-bible";
import { loadInterlinearRaw, loadLbfRaw, loadMorphRaw, loadNblaRaw, loadTokensRaw } from "./book-assets";
import { describeMorph, describeRmac, morphGntToRmac } from "./morph-describe";
import { mtToProtestant, oshbToSourceMorph, otTokenId } from "./oshb";
import { getWorkshopBookId } from "./workshop-book";

export { describeMorph, describeRmac, morphGntToRmac };

export interface GreekToken {
  id: string;
  chapter: number;
  verse: number;
  token: number;
  surface: string;
  sourceMorph: string;
  rmac: string;
  lemma: string;
}

export interface GreekVerse {
  chapter: number;
  verse: number;
  label: string;
  tokens: GreekToken[];
}

export interface AlignmentToken {
  id: string;
  chapter: number;
  verse: number;
  token: number;
  surface: string;
  lemma: string;
  morph: string;
  es: string;
}

export interface BookMorphData {
  alignment: AlignmentToken[];
  greek: Array<[number, GreekVerse[]]>;
  spanish: BibleVerse[];
}

/** @deprecated Prefer BookMorphData — kept for call sites during migration. */
export type TitusData = BookMorphData;

function parseMorphLine(line: string, index: number): GreekToken | null {
  const match = line.match(/^(\d{6})\s+(\S+)\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s+(.+)$/);
  if (!match) return null;

  const [, reference, partOfSpeech, morph, surface, lemma] = match;
  const chapter = Number(reference.slice(2, 4));
  const verse = Number(reference.slice(4, 6));
  const sourceMorph = `${partOfSpeech}${morph}`;

  return {
    id: `${reference}-${index}`,
    chapter,
    verse,
    token: 0,
    surface,
    sourceMorph,
    rmac: morphGntToRmac(sourceMorph, lemma),
    lemma
  };
}

function parseAlignmentLine(line: string, bookId: ReaderBookId): AlignmentToken | null {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || parsed.book !== bookId) return null;
    const tokenNum =
      typeof parsed.tok === "number"
        ? parsed.tok
        : typeof parsed.w === "number"
          ? parsed.w
          : null;
    if (
      typeof parsed.ch !== "number" ||
      typeof parsed.vs !== "number" ||
      tokenNum === null ||
      typeof parsed.surface !== "string" ||
      typeof parsed.lemma !== "string" ||
      typeof parsed.morph !== "string" ||
      typeof parsed.es !== "string"
    ) {
      return null;
    }

    return {
      id: `${parsed.ch}:${parsed.vs}:${tokenNum}`,
      chapter: parsed.ch,
      verse: parsed.vs,
      token: tokenNum,
      surface: parsed.surface,
      lemma: parsed.lemma,
      morph: parsed.morph,
      es: parsed.es.replace(/·/g, " ")
    };
  } catch {
    return null;
  }
}

export interface VerseInterlinearToken {
  surface: string;
  lemma: string;
  strongs: string;
  morph: string;
  gloss: string;
}

// One line per verse: "{book} {chapter}:{verse}\t{Surface<Lemma|Strongs|Morph|Gloss>}...".
// Read-only, whole-verse context — solves what the token-by-token alignment
// can't: judging who an imperative is addressed to needs the words around
// it, not just the isolated verb and its person/number.
const INTERLINEAR_TOKEN_PATTERN = /(\S+?)<([^|<>]+)\|([^|<>]+)\|([^|<>]+)\|([^<>]+)>/g;

function parseInterlinearVerseLine(
  line: string,
  bookId: ReaderBookId
): { chapter: number; verse: number; tokens: VerseInterlinearToken[] } | null {
  const tabIndex = line.indexOf("\t");
  if (tabIndex === -1) return null;

  const reference = line.slice(0, tabIndex).trim();
  const match = reference.match(new RegExp(`^${bookId}\\s+(\\d+):(\\d+)$`, "i"));
  if (!match) return null;

  const tokens: VerseInterlinearToken[] = [];
  for (const tokenMatch of line.slice(tabIndex + 1).matchAll(INTERLINEAR_TOKEN_PATTERN)) {
    const [, surface, lemma, strongs, morph, gloss] = tokenMatch;
    tokens.push({ surface, lemma, strongs, morph, gloss: gloss.replace(/·/g, " ") });
  }

  let chapter = Number(match[1]);
  let verse = Number(match[2]);
  if (readerBookHasOshb(bookId)) {
    const remapped = mtToProtestant(chapter, verse);
    chapter = remapped.chapter;
    verse = remapped.verse;
  }

  return { chapter, verse, tokens };
}

const interlinearCache = new Map<ReaderBookId, Map<string, VerseInterlinearToken[]>>();
const bookDataCache = new Map<ReaderBookId, BookMorphData>();
const interlinearPending = new Map<ReaderBookId, Promise<Map<string, VerseInterlinearToken[]>>>();
const bookDataPending = new Map<ReaderBookId, Promise<BookMorphData>>();

async function loadVerseInterlinearMap(
  bookId: ReaderBookId
): Promise<Map<string, VerseInterlinearToken[]>> {
  const cached = interlinearCache.get(bookId);
  if (cached) return cached;

  const pending = interlinearPending.get(bookId);
  if (pending) return pending;

  const promise = (async () => {
    const map = new Map<string, VerseInterlinearToken[]>();
    const raw = await loadInterlinearRaw(bookId);
    for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
      if (!line.trim()) continue;
      const parsed = parseInterlinearVerseLine(line, bookId);
      if (parsed) map.set(`${parsed.chapter}:${parsed.verse}`, parsed.tokens);
    }
    interlinearCache.set(bookId, map);
    interlinearPending.delete(bookId);
    return map;
  })();
  interlinearPending.set(bookId, promise);
  return promise;
}

/** Prime interlinear cache for a book (call before sync getVerseInterlinear). */
export async function ensureVerseInterlinear(bookId: ReaderBookId): Promise<void> {
  await loadVerseInterlinearMap(bookId);
}

export function getVerseInterlinear(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): VerseInterlinearToken[] {
  return interlinearCache.get(bookId)?.get(`${chapter}:${verse}`) ?? [];
}

function parseOshbTokensToGreek(
  tokensRaw: string,
  bookId: ReaderBookId,
  displayName: string
): Map<string, GreekVerse> {
  const verses = new Map<string, GreekVerse>();
  for (const line of tokensRaw.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (row.book !== bookId || typeof row.ch !== "number" || typeof row.vs !== "number") continue;
    const w = typeof row.w === "number" ? row.w : typeof row.tok === "number" ? row.tok : null;
    if (w === null || typeof row.surface !== "string" || typeof row.morph !== "string") continue;

    const { chapter, verse } = mtToProtestant(row.ch, row.vs);
    const morph = row.morph;
    const lemma = typeof row.lemma === "string" ? row.lemma : "";
    const sourceMorph = oshbToSourceMorph(morph);
    const key = `${chapter}:${verse}`;
    const greekVerse =
      verses.get(key) ??
      {
        chapter,
        verse,
        label: `${displayName} ${chapter}:${verse}`,
        tokens: [] as GreekToken[]
      };

    greekVerse.tokens.push({
      id: otTokenId(chapter, verse, w),
      chapter,
      verse,
      token: w,
      surface: row.surface,
      sourceMorph,
      rmac: morph,
      lemma
    });
    verses.set(key, greekVerse);
  }
  for (const verse of verses.values()) {
    verse.tokens.sort((a, b) => a.token - b.token);
  }
  return verses;
}

function remapOshbAlignmentTokens(tokens: AlignmentToken[]): AlignmentToken[] {
  return tokens.map(token => {
    const { chapter, verse } = mtToProtestant(token.chapter, token.verse);
    if (chapter === token.chapter && verse === token.verse) return token;
    return {
      ...token,
      id: `${chapter}:${verse}:${token.token}`,
      chapter,
      verse
    };
  });
}

export async function loadBookData(bookId: ReaderBookId): Promise<BookMorphData> {
  const cached = bookDataCache.get(bookId);
  if (cached) return cached;

  const pending = bookDataPending.get(bookId);
  if (pending) return pending;

  const promise = (async () => {
    const displayName = getReaderBookInfo(bookId).displayName;
    const verses = new Map<string, GreekVerse>();

    if (readerBookHasOshb(bookId)) {
      const [tokensRaw] = await Promise.all([loadTokensRaw(bookId), loadVerseInterlinearMap(bookId)]);
      for (const [key, verse] of parseOshbTokensToGreek(tokensRaw, bookId, displayName)) {
        verses.set(key, verse);
      }

      const byChapter = new Map<number, GreekVerse[]>();
      for (const verse of verses.values()) {
        const chapter = byChapter.get(verse.chapter) ?? [];
        chapter.push(verse);
        byChapter.set(verse.chapter, chapter);
      }
      for (const chapterVerses of byChapter.values()) {
        chapterVerses.sort((a, b) => a.verse - b.verse);
      }

      const alignment = remapOshbAlignmentTokens(
        tokensRaw
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map(line => parseAlignmentLine(line.trim(), bookId))
          .filter((token): token is AlignmentToken => Boolean(token))
      );

      // Mark Spanish column: LBF (no NBLA for Daniel).
      const spanish = parseLbfAsBibleVerses(bookId);

      const data: BookMorphData = {
        alignment,
        greek: Array.from(byChapter.entries()).sort((a, b) => a[0] - b[0]),
        spanish
      };
      bookDataCache.set(bookId, data);
      bookDataPending.delete(bookId);
      return data;
    }

    const [morphRaw, tokensRaw, nblaRaw] = await Promise.all([
      loadMorphRaw(bookId),
      loadTokensRaw(bookId),
      loadNblaRaw(bookId),
      loadVerseInterlinearMap(bookId)
    ]);

    morphRaw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .forEach((line, index) => {
        const token = parseMorphLine(line.trim(), index);
        if (!token) return;

        const key = `${token.chapter}:${token.verse}`;
        const verse =
          verses.get(key) ??
          {
            chapter: token.chapter,
            verse: token.verse,
            label: `${displayName} ${token.chapter}:${token.verse}`,
            tokens: []
          };

        token.token = verse.tokens.length + 1;
        verse.tokens.push(token);
        verses.set(key, verse);
      });

    const byChapter = new Map<number, GreekVerse[]>();
    for (const verse of verses.values()) {
      const chapter = byChapter.get(verse.chapter) ?? [];
      chapter.push(verse);
      byChapter.set(verse.chapter, chapter);
    }

    const data: BookMorphData = {
      alignment: tokensRaw
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map(line => parseAlignmentLine(line.trim(), bookId))
        .filter((token): token is AlignmentToken => Boolean(token)),
      greek: Array.from(byChapter.entries()),
      spanish: parseNblaContent(nblaRaw)
    };
    bookDataCache.set(bookId, data);
    bookDataPending.delete(bookId);
    return data;
  })();
  bookDataPending.set(bookId, promise);
  return promise;
}

/** Minimal BibleVerse[] from LBF markdown for Mark's Spanish column. */
function parseLbfAsBibleVerses(bookId: ReaderBookId): BibleVerse[] {
  const raw = loadLbfRaw(bookId);
  const verses: BibleVerse[] = [];
  let chapter = 0;
  let verse = 0;
  let parts: string[] = [];

  const flush = () => {
    if (chapter && verse && parts.length) {
      verses.push({
        book: getReaderBookInfo(bookId).displayName,
        chapter,
        verse,
        text: parts.join(" ").trim()
      });
    }
    parts = [];
  };

  for (const line of raw.split("\n")) {
    const lineVerse = line.match(/^\s*.+?\s+(\d+):(\d+)\s+(.+?)\s*$/);
    if (lineVerse) {
      flush();
      verses.push({
        book: getReaderBookInfo(bookId).displayName,
        chapter: Number(lineVerse[1]),
        verse: Number(lineVerse[2]),
        text: lineVerse[3].trim()
      });
      chapter = 0;
      verse = 0;
      continue;
    }

    const ch = line.match(/^##\s+Capítulo\s+(\d+)/i);
    if (ch) {
      flush();
      chapter = Number(ch[1]);
      verse = 0;
      continue;
    }
    const vs = line.match(/^###\s+(\d+):(\d+)/);
    if (vs) {
      flush();
      chapter = Number(vs[1]);
      verse = Number(vs[2]);
      continue;
    }
    if (!line.trim() || line.startsWith("#") || line.startsWith(">")) continue;
    if (chapter && verse) parts.push(line.trim());
  }
  flush();
  return verses;
}

export async function loadTitusData(): Promise<BookMorphData> {
  return loadBookData("tito");
}
