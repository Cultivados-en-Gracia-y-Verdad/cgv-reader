import titusLbfAlignment from "@cgv-lbf/nt/tito.alignment.json?raw";

/**
 * Greek (MorphGNT/BLE token number) → LBF Spanish word index for Titus.
 *
 * LBF is the Spanish surface for Observer's reverse/outcome reading.
 * The Greek workstation spine stays MorphGNT so existing Titus progress
 * (brick marks, clause greek* ids) keeps working. A later TR1894 spine
 * switch can replace this file once LBF↔TR alignment is complete.
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

let cachedByVerse: Map<string, Map<number, number>> | null = null;
let cachedSurfacesByVerse: Map<string, Map<number, string>> | null = null;

function ensureCaches(): void {
  if (cachedByVerse && cachedSurfacesByVerse) return;

  const data = JSON.parse(titusLbfAlignment) as RawAlignmentFile;
  const byVerse = new Map<string, Map<number, number>>();
  const surfaces = new Map<string, Map<number, string>>();

  for (const record of data.records) {
    const key = `${record.chapter}:${record.verse}`;
    const indexMap = byVerse.get(key) ?? new Map<number, number>();
    const surfaceMap = surfaces.get(key) ?? new Map<number, string>();
    indexMap.set(record.token, record.lbfWordIndex);
    surfaceMap.set(record.token, record.lbfSurface);
    byVerse.set(key, indexMap);
    surfaces.set(key, surfaceMap);
  }

  cachedByVerse = byVerse;
  cachedSurfacesByVerse = surfaces;
}

/** token number → LBF word index for one verse */
export function loadLbfTokenWordMap(chapter: number, verse: number): Map<number, number> {
  ensureCaches();
  return cachedByVerse!.get(`${chapter}:${verse}`) ?? new Map();
}

/** token number → LBF surface string for one verse */
export function loadLbfTokenSurfaces(chapter: number, verse: number): Map<number, string> {
  ensureCaches();
  return cachedSurfacesByVerse!.get(`${chapter}:${verse}`) ?? new Map();
}

export function findWordIndexBySurface(
  words: { index: number; text: string }[],
  targetSurface: string
): number | null {
  const wanted = normalizeSpanish(targetSurface);
  const match = words.find(word => normalizeSpanish(word.text) === wanted);
  return match ? match.index : null;
}

function normalizeSpanish(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
