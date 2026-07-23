import type { ReaderBookId } from "@cgv/core";
import { getWorkshopBookId } from "./workshop-book";
import { loadLbfAlignmentRaw } from "./book-assets";

/**
 * Greek (MorphGNT/BLE token number) → LBF Spanish word index.
 *
 * LBF is the Spanish surface for Observer's reverse/outcome reading.
 * The Greek workstation spine stays MorphGNT so brick marks / clause ids keep working.
 */

export interface LbfAlignmentRecord {
  chapter: number;
  verse: number;
  token: number;
  greekSurface: string;
  lbfSurface: string;
  lbfWordIndex: number;
}

interface RawAlignmentFile {
  records: LbfAlignmentRecord[];
}

const cacheByBook = new Map<
  string,
  {
    raw: string;
    byVerse: Map<string, Map<number, number>>;
    surfacesByVerse: Map<string, Map<number, string>>;
  }
>();

function ensureCaches(bookId: ReaderBookId = getWorkshopBookId()): void {
  const raw = loadLbfAlignmentRaw(bookId);
  const cached = cacheByBook.get(bookId);
  if (cached && cached.raw === raw) return;

  const data = JSON.parse(raw) as RawAlignmentFile;
  const byVerse = new Map<string, Map<number, number>>();
  const surfaces = new Map<string, Map<number, string>>();

  for (const record of data.records ?? []) {
    const key = `${record.chapter}:${record.verse}`;
    const indexMap = byVerse.get(key) ?? new Map<number, number>();
    const surfaceMap = surfaces.get(key) ?? new Map<number, string>();
    indexMap.set(record.token, record.lbfWordIndex);
    surfaceMap.set(record.token, record.lbfSurface);
    byVerse.set(key, indexMap);
    surfaces.set(key, surfaceMap);
  }

  cacheByBook.set(bookId, { raw, byVerse, surfacesByVerse: surfaces });
}

/** token number → LBF word index for one verse */
export function loadLbfTokenWordMap(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): Map<number, number> {
  ensureCaches(bookId);
  return cacheByBook.get(bookId)!.byVerse.get(`${chapter}:${verse}`) ?? new Map();
}

/** token number → LBF surface string for one verse */
export function loadLbfTokenSurfaces(
  chapter: number,
  verse: number,
  bookId: ReaderBookId = getWorkshopBookId()
): Map<number, string> {
  ensureCaches(bookId);
  return cacheByBook.get(bookId)!.surfacesByVerse.get(`${chapter}:${verse}`) ?? new Map();
}

export function findWordIndexBySurface(
  words: { index: number; text: string }[],
  targetSurface: string
): number | null {
  const wanted = normalizeSpanish(targetSurface);
  const match = words.find(word => normalizeSpanish(word.text) === wanted);
  return match ? match.index : null;
}

/**
 * LBF often stores a multi-word Spanish phrase for one Greek token
 * ("son guardados" for φρουρουμένους). Whitespace tokenization splits that
 * phrase, and the recorded index may land on an auxiliary ("son"). Prefer the
 * last content word of the phrase when it appears at/after the recorded index.
 */
export function resolveLbfPhraseWordIndex(
  words: { index: number; text: string }[],
  recordedIndex: number | undefined,
  lbfSurface: string | undefined
): number | undefined {
  if (recordedIndex === undefined) return undefined;
  if (!lbfSurface) return recordedIndex;
  const parts = lbfSurface
    .trim()
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return recordedIndex;
  const wanted = normalizeSpanish(parts[parts.length - 1] ?? "");
  if (!wanted) return recordedIndex;
  const match = words.find(
    word => word.index >= recordedIndex && normalizeSpanish(word.text) === wanted
  );
  return match ? match.index : recordedIndex;
}

function normalizeSpanish(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
