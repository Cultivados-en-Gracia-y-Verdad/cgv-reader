import { parseNblaContent, type BibleVerse } from "cgv-bible";
import {
  getReaderBookInfo,
  readerBookHasBibleVersion,
  readerBookHasLbf,
  readerBookHasOshb,
  type BibleVersionId,
  type ReaderBookId
} from "@cgv/core";
import { loadLbfRaw, loadTokensRaw } from "../observer/book-assets";
import {
  loadLbfSourceTokenUnits,
  loadLbfTokenWordIndexes,
  loadLbfTokenWordMap
} from "../observer/lbf-alignment";
import { describeMorph, morphGntToRmac } from "../observer/morph-describe";
import { mtToProtestant } from "../observer/oshb";
import {
  bleFiles,
  nblaFiles,
  rv1909Files,
  spnbesFiles
} from "../core/reader-assets.generated";
import { takeTrailingPunctuation } from "./reader-emphasis";

export interface ReaderBook {
  id: ReaderBookId;
  title: string;
  version: BibleVersionId;
  versionLabel: string;
  verses: BibleVerse[];
}

export interface ReaderVersePart {
  text: string;
  trailingPunctuation?: string;
  wordIndex?: number;
  sourceTokenIds?: string[];
  alignmentUnitIds?: string[];
}

export interface ReaderMorphologyToken {
  chapter: number;
  verse: number;
  token: number;
  surface: string;
  lemma: string;
  morph: string;
  description: string;
  gloss: string;
}

export type ReaderMorphologyIndex = Map<string, ReaderMorphologyToken>;

const readerMorphologyCache = new Map<ReaderBookId, Promise<ReaderMorphologyIndex>>();

/** Read-only morphology index from the selected cgv-data token spine. */
export function loadReaderMorphologyIndex(
  bookId: ReaderBookId
): Promise<ReaderMorphologyIndex> {
  const cached = readerMorphologyCache.get(bookId);
  if (cached) return cached;

  const pending = loadTokensRaw(bookId)
    .then(raw => {
      const index: ReaderMorphologyIndex = new Map();
      for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
        if (!line.trim()) continue;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (
          row.book !== bookId ||
          typeof row.ch !== "number" ||
          typeof row.vs !== "number" ||
          typeof row.surface !== "string" ||
          typeof row.morph !== "string"
        ) {
          continue;
        }
        const token =
          typeof row.tok === "number" ? row.tok : typeof row.w === "number" ? row.w : null;
        if (token === null) continue;
        const reference = mtToProtestant(bookId, row.ch, row.vs);
        const lemma = typeof row.lemma === "string" ? row.lemma : "";
        const morphSystem = readerBookHasOshb(bookId) ? "OSHB" : "RMAC";
        const morph = morphSystem === "RMAC" ? morphGntToRmac(row.morph, lemma) : row.morph;
        const morphology: ReaderMorphologyToken = {
          chapter: reference.chapter,
          verse: reference.verse,
          token,
          surface: row.surface,
          lemma,
          morph,
          description: describeMorph(morph),
          gloss: typeof row.es === "string" ? row.es.replace(/·/g, " ") : ""
        };
        index.set(`${morphology.chapter}:${morphology.verse}:${token}`, morphology);
      }
      return index;
    })
    .catch(error => {
      readerMorphologyCache.delete(bookId);
      throw error;
    });

  readerMorphologyCache.set(bookId, pending);
  return pending;
}

const LBF_WORD_PATTERN = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]*/gu;

/**
 * Split an LBF verse into display-preserving text parts and word anchors.
 * Published source-token ids are preferred. Older alignment records fall back
 * to a dataset-bound book/chapter/verse/token id, never to the Greek surface.
 */
export function loadLbfReaderVerseParts(
  bookId: ReaderBookId,
  verse: BibleVerse
): ReaderVersePart[] {
  const sourceIdsByWord = new Map<number, Set<string>>();
  const unitIdsByWord = new Map<number, Set<string>>();
  const sourceUnits = loadLbfSourceTokenUnits(verse.chapter, verse.verse, bookId);

  for (const [sourceTokenId, units] of sourceUnits) {
    if (!/^[hn]\d+$/.test(sourceTokenId)) continue;
    for (const unit of units) {
      const indexes = unit.lbfWordIndexes.length ? unit.lbfWordIndexes : [unit.lbfWordIndex];
      for (const index of indexes) {
        const ids = sourceIdsByWord.get(index) ?? new Set<string>();
        ids.add(sourceTokenId);
        sourceIdsByWord.set(index, ids);
        if (unit.unitId) {
          const unitIds = unitIdsByWord.get(index) ?? new Set<string>();
          unitIds.add(unit.unitId);
          unitIdsByWord.set(index, unitIds);
        }
      }
    }
  }

  // Local legacy alignments have stable token positions but no source-token id.
  const primaryIndexes = loadLbfTokenWordMap(verse.chapter, verse.verse, bookId);
  const multipleIndexes = loadLbfTokenWordIndexes(verse.chapter, verse.verse, bookId);
  for (const [token, primaryIndex] of primaryIndexes) {
    const indexes = multipleIndexes.get(token) ?? [primaryIndex];
    for (const index of indexes) {
      if (sourceIdsByWord.has(index)) continue;
      const ids = sourceIdsByWord.get(index) ?? new Set<string>();
      ids.add(`cgv:${bookId}:${verse.chapter}:${verse.verse}:${token}`);
      sourceIdsByWord.set(index, ids);
    }
  }

  const parts: ReaderVersePart[] = [];
  let cursor = 0;
  let wordIndex = 0;
  for (const match of verse.text.matchAll(LBF_WORD_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: verse.text.slice(cursor, start) });
    parts.push({
      text: match[0],
      wordIndex,
      sourceTokenIds: Array.from(sourceIdsByWord.get(wordIndex) ?? []).sort(),
      alignmentUnitIds: Array.from(unitIdsByWord.get(wordIndex) ?? []).sort()
    });
    cursor = start + match[0].length;
    wordIndex += 1;
  }
  if (cursor < verse.text.length) parts.push({ text: verse.text.slice(cursor) });

  // Keep closing punctuation in the same inline box as its preceding word.
  // Otherwise an aligned word button followed by a separate text span gives
  // the browser a wrap opportunity before commas (Tito 3:1), periods, etc.
  for (let index = 0; index < parts.length - 1; index += 1) {
    const word = parts[index];
    const following = parts[index + 1];
    if (word.wordIndex === undefined || following.wordIndex !== undefined) continue;
    const { punctuation, remainder } = takeTrailingPunctuation(following.text);
    if (!punctuation) continue;
    word.trailingPunctuation = punctuation;
    following.text = remainder;
  }
  return parts;
}

const VERSION_LABELS: Record<BibleVersionId, string> = {
  NBLA: "NBLA",
  BLE: "BLE",
  SPNBES: "SPNBES",
  RV1909: "RV1909",
  LBF: "LPF"
};

function findLoader(
  files: Record<string, () => Promise<string>>,
  endsWith: string
): (() => Promise<string>) | null {
  const key = Object.keys(files).find(path => path.endsWith(endsWith));
  return key ? files[key] : null;
}

async function loadRaw(bookId: ReaderBookId, version: BibleVersionId): Promise<string> {
  const info = getReaderBookInfo(bookId);

  if (version === "LBF") {
    if (!readerBookHasLbf(bookId)) {
      throw new Error(`LPF is not available for ${info.displayName} yet.`);
    }
    return loadLbfRaw(bookId);
  }

  const loader =
    version === "NBLA"
      ? findLoader(nblaFiles, `/${bookId}.nbla.md`)
      : version === "BLE"
        ? findLoader(bleFiles, `/${bookId}.ble.md`)
        : version === "SPNBES"
          ? findLoader(spnbesFiles, `/${bookId}.txt`)
          : findLoader(rv1909Files, `/${info.rv1909}.content.md`);

  if (!loader) {
    throw new Error(`No ${version} text found for ${info.displayName}.`);
  }
  return loader();
}

/** Keep note targets stable across versions (`Tito.1.1`). */
function normalizeVerses(displayName: string, verses: BibleVerse[]): BibleVerse[] {
  return verses
    .map(verse => ({
      ...verse,
      book: displayName,
      text: verse.text.replace(/\u2022/g, "·").trim()
    }))
    .filter(verse => verse.text.length > 0)
    .sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
}

/** Line format: `Mateo 1:1 …` / `tito 1:1 …` (NBLA, BLE, SPNBES). */
function parseLineBible(displayName: string, content: string): BibleVerse[] {
  return normalizeVerses(displayName, parseNblaContent(content));
}

/**
 * RV1909 Aquifer markdown:
 * `## Mateo 1:1 (id: …)` then one or more body lines until the next `##`.
 */
function parseRv1909Content(displayName: string, content: string): BibleVerse[] {
  const verses: BibleVerse[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let current: { chapter: number; verse: number; parts: string[] } | null = null;

  function flush() {
    if (!current) return;
    let text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    // Drop leading verse-number glued to the first word ("1LIBRO" → "LIBRO").
    text = text.replace(/^\d+/, "").trim();
    if (text) {
      verses.push({
        book: displayName,
        chapter: current.chapter,
        verse: current.verse,
        text
      });
    }
    current = null;
  }

  for (const line of lines) {
    const heading = line.match(/^##\s*.+?\s+(\d+):(\d+)\b/);
    if (heading) {
      flush();
      current = {
        chapter: Number(heading[1]),
        verse: Number(heading[2]),
        parts: []
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("#") || line.startsWith("---") || line.startsWith("**")) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    current.parts.push(trimmed);
  }
  flush();
  return normalizeVerses(displayName, verses);
}

/**
 * LBF markdown:
 * - cgv-data: `Daniel 1:1 …`
 * - legacy local: `### 1:1` then body text until the next heading.
 */
function parseLbfContent(displayName: string, content: string): BibleVerse[] {
  const verses: BibleVerse[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let current: { chapter: number; verse: number; parts: string[] } | null = null;

  function flush() {
    if (!current) return;
    const text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      verses.push({
        book: displayName,
        chapter: current.chapter,
        verse: current.verse,
        text
      });
    }
    current = null;
  }

  for (const line of lines) {
    const lineVerse = line.match(/^\s*.+?\s+(\d+):(\d+)\s+(.+?)\s*$/);
    if (lineVerse) {
      flush();
      verses.push({
        book: displayName,
        chapter: Number(lineVerse[1]),
        verse: Number(lineVerse[2]),
        text: lineVerse[3].trim()
      });
      continue;
    }

    const heading = line.match(/^###\s+(\d+):(\d+)\s*$/);
    if (heading) {
      flush();
      current = {
        chapter: Number(heading[1]),
        verse: Number(heading[2]),
        parts: []
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("#")) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(">")) continue;
    current.parts.push(trimmed);
  }
  flush();
  return normalizeVerses(displayName, verses);
}

/** Prefer requested version when present for the book; else first available. */
export function resolveReaderVersion(
  bookId: ReaderBookId,
  version: BibleVersionId
): BibleVersionId {
  if (readerBookHasBibleVersion(bookId, version)) return version;
  const fallback: BibleVersionId[] = ["LBF", "BLE", "SPNBES", "RV1909", "NBLA"];
  const hit = fallback.find(v => readerBookHasBibleVersion(bookId, v));
  return hit ?? "BLE";
}

export async function loadReaderBook(
  bookId: ReaderBookId,
  version: BibleVersionId
): Promise<ReaderBook> {
  const info = getReaderBookInfo(bookId);
  const effective = resolveReaderVersion(bookId, version);
  const raw = await loadRaw(bookId, effective);
  const verses =
    effective === "RV1909"
      ? parseRv1909Content(info.displayName, raw)
      : effective === "LBF"
        ? parseLbfContent(info.displayName, raw)
        : parseLineBible(info.displayName, raw);

  return {
    id: bookId,
    title: info.displayName,
    version: effective,
    versionLabel: VERSION_LABELS[effective],
    verses
  };
}

/** @deprecated Use loadReaderBook("tito", version). */
export async function loadTitus(version: BibleVersionId): Promise<ReaderBook> {
  return loadReaderBook("tito", version);
}
