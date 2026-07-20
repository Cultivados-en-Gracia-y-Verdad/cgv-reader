import { parseNblaContent, type BibleVerse } from "cgv-bible";
import {
  getReaderBookInfo,
  readerBookHasLbf,
  type BibleVersionId,
  type ReaderBookId
} from "@cgv/core";
import titusLbf from "@cgv-lbf/nt/tito.md?raw";

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

// NT-only globs — avoid shipping unused OT files into the Pages upload.
const nblaFiles = import.meta.glob(
  [
    "@cgv-data/bibles/NBLA/mateo.nbla.md",
    "@cgv-data/bibles/NBLA/marcos.nbla.md",
    "@cgv-data/bibles/NBLA/lucas.nbla.md",
    "@cgv-data/bibles/NBLA/juan.nbla.md",
    "@cgv-data/bibles/NBLA/hechos.nbla.md",
    "@cgv-data/bibles/NBLA/romanos.nbla.md",
    "@cgv-data/bibles/NBLA/1corintios.nbla.md",
    "@cgv-data/bibles/NBLA/2corintios.nbla.md",
    "@cgv-data/bibles/NBLA/galatas.nbla.md",
    "@cgv-data/bibles/NBLA/efesios.nbla.md",
    "@cgv-data/bibles/NBLA/filipenses.nbla.md",
    "@cgv-data/bibles/NBLA/colosenses.nbla.md",
    "@cgv-data/bibles/NBLA/1tesalonicenses.nbla.md",
    "@cgv-data/bibles/NBLA/2tesalonicenses.nbla.md",
    "@cgv-data/bibles/NBLA/1timoteo.nbla.md",
    "@cgv-data/bibles/NBLA/2timoteo.nbla.md",
    "@cgv-data/bibles/NBLA/tito.nbla.md",
    "@cgv-data/bibles/NBLA/filemon.nbla.md",
    "@cgv-data/bibles/NBLA/hebreos.nbla.md",
    "@cgv-data/bibles/NBLA/santiago.nbla.md",
    "@cgv-data/bibles/NBLA/1pedro.nbla.md",
    "@cgv-data/bibles/NBLA/2pedro.nbla.md",
    "@cgv-data/bibles/NBLA/1juan.nbla.md",
    "@cgv-data/bibles/NBLA/2juan.nbla.md",
    "@cgv-data/bibles/NBLA/3juan.nbla.md",
    "@cgv-data/bibles/NBLA/judas.nbla.md",
    "@cgv-data/bibles/NBLA/apocalipsis.nbla.md"
  ],
  { query: "?raw", import: "default" }
) as Record<string, () => Promise<string>>;

const bleFiles = import.meta.glob(
  [
    "@cgv-data/bibles/BLE/mateo.ble.md",
    "@cgv-data/bibles/BLE/marcos.ble.md",
    "@cgv-data/bibles/BLE/lucas.ble.md",
    "@cgv-data/bibles/BLE/juan.ble.md",
    "@cgv-data/bibles/BLE/hechos.ble.md",
    "@cgv-data/bibles/BLE/romanos.ble.md",
    "@cgv-data/bibles/BLE/1corintios.ble.md",
    "@cgv-data/bibles/BLE/2corintios.ble.md",
    "@cgv-data/bibles/BLE/galatas.ble.md",
    "@cgv-data/bibles/BLE/efesios.ble.md",
    "@cgv-data/bibles/BLE/filipenses.ble.md",
    "@cgv-data/bibles/BLE/colosenses.ble.md",
    "@cgv-data/bibles/BLE/1tesalonicenses.ble.md",
    "@cgv-data/bibles/BLE/2tesalonicenses.ble.md",
    "@cgv-data/bibles/BLE/1timoteo.ble.md",
    "@cgv-data/bibles/BLE/2timoteo.ble.md",
    "@cgv-data/bibles/BLE/tito.ble.md",
    "@cgv-data/bibles/BLE/filemon.ble.md",
    "@cgv-data/bibles/BLE/hebreos.ble.md",
    "@cgv-data/bibles/BLE/santiago.ble.md",
    "@cgv-data/bibles/BLE/1pedro.ble.md",
    "@cgv-data/bibles/BLE/2pedro.ble.md",
    "@cgv-data/bibles/BLE/1juan.ble.md",
    "@cgv-data/bibles/BLE/2juan.ble.md",
    "@cgv-data/bibles/BLE/3juan.ble.md",
    "@cgv-data/bibles/BLE/judas.ble.md",
    "@cgv-data/bibles/BLE/apocalipsis.ble.md"
  ],
  { query: "?raw", import: "default" }
) as Record<string, () => Promise<string>>;

const spnbesFiles = import.meta.glob(
  [
    "@cgv-data/bibles/SPNBES/mateo.txt",
    "@cgv-data/bibles/SPNBES/marcos.txt",
    "@cgv-data/bibles/SPNBES/lucas.txt",
    "@cgv-data/bibles/SPNBES/juan.txt",
    "@cgv-data/bibles/SPNBES/hechos.txt",
    "@cgv-data/bibles/SPNBES/romanos.txt",
    "@cgv-data/bibles/SPNBES/1corintios.txt",
    "@cgv-data/bibles/SPNBES/2corintios.txt",
    "@cgv-data/bibles/SPNBES/galatas.txt",
    "@cgv-data/bibles/SPNBES/efesios.txt",
    "@cgv-data/bibles/SPNBES/filipenses.txt",
    "@cgv-data/bibles/SPNBES/colosenses.txt",
    "@cgv-data/bibles/SPNBES/1tesalonicenses.txt",
    "@cgv-data/bibles/SPNBES/2tesalonicenses.txt",
    "@cgv-data/bibles/SPNBES/1timoteo.txt",
    "@cgv-data/bibles/SPNBES/2timoteo.txt",
    "@cgv-data/bibles/SPNBES/tito.txt",
    "@cgv-data/bibles/SPNBES/filemon.txt",
    "@cgv-data/bibles/SPNBES/hebreos.txt",
    "@cgv-data/bibles/SPNBES/santiago.txt",
    "@cgv-data/bibles/SPNBES/1pedro.txt",
    "@cgv-data/bibles/SPNBES/2pedro.txt",
    "@cgv-data/bibles/SPNBES/1juan.txt",
    "@cgv-data/bibles/SPNBES/2juan.txt",
    "@cgv-data/bibles/SPNBES/3juan.txt",
    "@cgv-data/bibles/SPNBES/judas.txt",
    "@cgv-data/bibles/SPNBES/apocalipsis.txt"
  ],
  { query: "?raw", import: "default" }
) as Record<string, () => Promise<string>>;

const rv1909Files = import.meta.glob(
  [
    "@cgv-data/bibles/RV1909/md/40.content.md",
    "@cgv-data/bibles/RV1909/md/41.content.md",
    "@cgv-data/bibles/RV1909/md/42.content.md",
    "@cgv-data/bibles/RV1909/md/43.content.md",
    "@cgv-data/bibles/RV1909/md/44.content.md",
    "@cgv-data/bibles/RV1909/md/45.content.md",
    "@cgv-data/bibles/RV1909/md/46.content.md",
    "@cgv-data/bibles/RV1909/md/47.content.md",
    "@cgv-data/bibles/RV1909/md/48.content.md",
    "@cgv-data/bibles/RV1909/md/49.content.md",
    "@cgv-data/bibles/RV1909/md/50.content.md",
    "@cgv-data/bibles/RV1909/md/51.content.md",
    "@cgv-data/bibles/RV1909/md/52.content.md",
    "@cgv-data/bibles/RV1909/md/53.content.md",
    "@cgv-data/bibles/RV1909/md/54.content.md",
    "@cgv-data/bibles/RV1909/md/55.content.md",
    "@cgv-data/bibles/RV1909/md/56.content.md",
    "@cgv-data/bibles/RV1909/md/57.content.md",
    "@cgv-data/bibles/RV1909/md/58.content.md",
    "@cgv-data/bibles/RV1909/md/59.content.md",
    "@cgv-data/bibles/RV1909/md/60.content.md",
    "@cgv-data/bibles/RV1909/md/61.content.md",
    "@cgv-data/bibles/RV1909/md/62.content.md",
    "@cgv-data/bibles/RV1909/md/63.content.md",
    "@cgv-data/bibles/RV1909/md/64.content.md",
    "@cgv-data/bibles/RV1909/md/65.content.md",
    "@cgv-data/bibles/RV1909/md/66.content.md"
  ],
  { query: "?raw", import: "default" }
) as Record<string, () => Promise<string>>;

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
      throw new Error(`LBF is only available for Tito (requested ${info.displayName}).`);
    }
    return titusLbf;
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
 * Suite LBF markdown:
 * `### 1:1` then body text until the next heading.
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

/** Effective Reader version — LBF only exists for Tito. */
export function resolveReaderVersion(
  bookId: ReaderBookId,
  version: BibleVersionId
): BibleVersionId {
  if (version === "LBF" && !readerBookHasLbf(bookId)) return "NBLA";
  return version;
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
