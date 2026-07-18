import { parseNblaContent, type BibleVerse } from "cgv-bible";
import type { BibleVersionId } from "@cgv/core";
import titusNbla from "@cgv-data/bibles/NBLA/tito.nbla.md?raw";
import titusBle from "@cgv-data/bibles/BLE/tito.ble.md?raw";
import titusSpnbes from "@cgv-data/bibles/SPNBES/tito.txt?raw";
import titusRv1909 from "@cgv-data/bibles/RV1909/md/56.content.md?raw";
import titusLbf from "@cgv-lbf/nt/tito.md?raw";

export interface ReaderBook {
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

/** Keep note targets stable across versions (`Tito.1.1`). */
function normalizeTitusVerses(verses: BibleVerse[]): BibleVerse[] {
  return verses
    .map(verse => ({
      ...verse,
      book: "Tito",
      text: verse.text.replace(/\u2022/g, "·").trim()
    }))
    .filter(verse => verse.text.length > 0)
    .sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
}

/** Line format: `Tito 1:1 …` / `tito 1:1 …` (NBLA, BLE, SPNBES). */
function parseLineBible(content: string): BibleVerse[] {
  return normalizeTitusVerses(parseNblaContent(content));
}

/**
 * RV1909 Aquifer markdown:
 * `## Tito 1:1 (id: …)` then one or more body lines until the next `##`.
 */
function parseRv1909Content(content: string): BibleVerse[] {
  const verses: BibleVerse[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let current: { chapter: number; verse: number; parts: string[] } | null = null;

  function flush() {
    if (!current) return;
    let text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    // Drop leading verse-number glued to the first word ("1PABLO" → "PABLO").
    text = text.replace(/^\d+/, "").trim();
    if (text) {
      verses.push({
        book: "Tito",
        chapter: current.chapter,
        verse: current.verse,
        text
      });
    }
    current = null;
  }

  for (const line of lines) {
    const heading = line.match(/^##\s*Tito\s+(\d+):(\d+)\b/i);
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
  return normalizeTitusVerses(verses);
}

/**
 * Suite LBF markdown:
 * `### 1:1` then body text until the next heading.
 */
function parseLbfContent(content: string): BibleVerse[] {
  const verses: BibleVerse[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let current: { chapter: number; verse: number; parts: string[] } | null = null;

  function flush() {
    if (!current) return;
    const text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      verses.push({
        book: "Tito",
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
  return normalizeTitusVerses(verses);
}

const RAW: Record<BibleVersionId, string> = {
  NBLA: titusNbla,
  BLE: titusBle,
  SPNBES: titusSpnbes,
  RV1909: titusRv1909,
  LBF: titusLbf
};

export function loadTitus(version: BibleVersionId): ReaderBook {
  const raw = RAW[version];
  const verses =
    version === "RV1909"
      ? parseRv1909Content(raw)
      : version === "LBF"
        ? parseLbfContent(raw)
        : parseLineBible(raw);

  return {
    title: "Tito",
    version,
    versionLabel: VERSION_LABELS[version],
    verses
  };
}
