import { parseNblaContent, type BibleVerse } from "cgv-bible";
import {
  getReaderBookInfo,
  readerBookHasBibleVersion,
  readerBookHasLbf,
  type BibleVersionId,
  type ReaderBookId
} from "@cgv/core";
import { loadLbfRaw } from "../observer/book-assets";
import {
  bleFiles,
  nblaFiles,
  rv1909Files,
  spnbesFiles
} from "../core/reader-assets.generated";

export interface ReaderBook {
  id: ReaderBookId;
  title: string;
  version: BibleVersionId;
  versionLabel: string;
  verses: BibleVerse[];
}

const VERSION_LABELS: Record<BibleVersionId, string> = {
  NBLA: "NBLA",
  BLE: "BLE",
  SPNBES: "SPNBES",
  RV1909: "RV1909",
  LBF: "LBF"
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
      throw new Error(`LBF is not available for ${info.displayName} yet.`);
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
