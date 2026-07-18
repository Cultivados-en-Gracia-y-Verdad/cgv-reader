// Compiler gathering layer — Reader notes (R→C) and durable Def/XRef pins.
// Pins anchor to the *text* of the target line so they rematch after Generate.
// Never mixed into Observer's mechanical `*` grammar slides.

import { NOTES_KEY } from "@cgv/core";

export interface ReaderNote {
  id: string;
  target: string;
  label: string;
  text: string;
  updatedAt: string;
}

export type CompilerAttachmentKind = "definition" | "xref";

/**
 * Pinned gathering item. Inserts after a resolved line in the generated markdown.
 * `anchorText` is the durable key; `lineNumber` is the current document placement
 * (0 = orphaned after regenerate — needs reattach).
 */
export interface CompilerAttachment {
  id: string;
  kind: CompilerAttachmentKind;
  /** 1-based line in current base markdown; 0 if unmatched after regenerate. */
  lineNumber: number;
  /** Exact text of the line this pin follows — rematched on Generate. */
  anchorText: string;
  lemma: string;
  /** Definition prose, or empty for xref-only pins. */
  text: string;
  /** For xref: other-Scripture reference (e.g. "Romanos 1:1"). */
  reference?: string;
  surfaceForm?: string;
  spanishGloss?: string;
  updatedAt: string;
}

const ATTACHMENTS_KEY = "cgv-reader:compiler:attachments:v3";
const LEGACY_ATTACHMENTS_KEYS = [
  "cgv-suite:compiler:attachments:v3",
  "cgv-suite:compiler:attachments:v2"
];

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readReaderNotes(): ReaderNote[] {
  try {
    const stored = window.localStorage.getItem(NOTES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (note): note is ReaderNote =>
        Boolean(note) &&
        typeof note === "object" &&
        typeof note.id === "string" &&
        typeof note.target === "string" &&
        typeof note.text === "string"
    );
  } catch {
    return [];
  }
}

function isAttachment(item: unknown): item is CompilerAttachment {
  if (!item || typeof item !== "object") return false;
  const row = item as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    (row.kind === "definition" || row.kind === "xref") &&
    typeof row.lineNumber === "number" &&
    row.lineNumber >= 0 &&
    typeof row.lemma === "string" &&
    typeof row.text === "string" &&
    typeof row.anchorText === "string"
  );
}

/** Migrate older suite/lab pin stores into the current key. */
function migrateLegacyAttachments(): CompilerAttachment[] {
  try {
    let stored: string | null = null;
    let sourceKey: string | null = null;
    for (const key of LEGACY_ATTACHMENTS_KEYS) {
      stored = window.localStorage.getItem(key);
      if (stored) {
        sourceKey = key;
        break;
      }
    }
    if (!stored || !sourceKey) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const migrated: CompilerAttachment[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        (row.kind !== "definition" && row.kind !== "xref") ||
        typeof row.lineNumber !== "number" ||
        typeof row.lemma !== "string" ||
        typeof row.text !== "string"
      ) {
        continue;
      }
      migrated.push({
        id: row.id,
        kind: row.kind,
        lineNumber: row.lineNumber >= 1 ? row.lineNumber : 0,
        anchorText: typeof row.anchorText === "string" ? row.anchorText : "",
        lemma: row.lemma,
        text: row.text,
        reference: typeof row.reference === "string" ? row.reference : undefined,
        surfaceForm: typeof row.surfaceForm === "string" ? row.surfaceForm : undefined,
        spanishGloss: typeof row.spanishGloss === "string" ? row.spanishGloss : undefined,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString()
      });
    }
    if (migrated.length) {
      writeCompilerAttachments(migrated);
      for (const key of LEGACY_ATTACHMENTS_KEYS) {
        window.localStorage.removeItem(key);
      }
    }
    return migrated;
  } catch {
    return [];
  }
}

export function readCompilerAttachments(): CompilerAttachment[] {
  try {
    const stored = window.localStorage.getItem(ATTACHMENTS_KEY);
    if (!stored) return migrateLegacyAttachments();
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAttachment);
  } catch {
    return [];
  }
}

export function writeCompilerAttachments(attachments: CompilerAttachment[]): void {
  window.localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachments));
}

export function lineTextAt(markdown: string, lineNumber: number): string {
  if (lineNumber < 1) return "";
  const lines = markdown.split("\n");
  return lines[lineNumber - 1] ?? "";
}

export function addCompilerAttachment(
  patch: Omit<CompilerAttachment, "id" | "updatedAt">
): CompilerAttachment[] {
  const next: CompilerAttachment = {
    ...patch,
    anchorText: patch.anchorText,
    id: makeId(patch.kind),
    updatedAt: new Date().toISOString()
  };
  const all = [...readCompilerAttachments(), next];
  writeCompilerAttachments(all);
  return all;
}

export function removeCompilerAttachment(id: string): CompilerAttachment[] {
  const all = readCompilerAttachments().filter(item => item.id !== id);
  writeCompilerAttachments(all);
  return all;
}

export function clearCompilerAttachments(): void {
  writeCompilerAttachments([]);
}

/** Move an orphaned (or any) pin onto a new line, refreshing its durable anchor. */
export function reattachCompilerAttachment(
  id: string,
  lineNumber: number,
  anchorText: string
): CompilerAttachment[] {
  const all = readCompilerAttachments().map(item =>
    item.id === id
      ? {
          ...item,
          lineNumber,
          anchorText,
          updatedAt: new Date().toISOString()
        }
      : item
  );
  writeCompilerAttachments(all);
  return all;
}

/**
 * Rematch pins onto a freshly generated document by `anchorText`.
 * Exact line match; if several lines match, prefer the closest to the previous lineNumber.
 * Unmatched pins stay in the store with lineNumber 0 (orphaned).
 */
export function remapAttachmentsToMarkdown(
  markdown: string,
  attachments: CompilerAttachment[]
): CompilerAttachment[] {
  if (!attachments.length) return [];
  const lines = markdown.split("\n");
  const indexesByText = new Map<string, number[]>();
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    const list = indexesByText.get(text) ?? [];
    list.push(index);
    indexesByText.set(text, list);
  }

  return attachments.map(item => {
    const anchor = item.anchorText;
    if (!anchor) {
      return { ...item, lineNumber: 0 };
    }
    const candidates = indexesByText.get(anchor);
    if (!candidates?.length) {
      return { ...item, lineNumber: 0 };
    }
    let best = candidates[0];
    if (item.lineNumber >= 1 && candidates.length > 1) {
      let bestDist = Math.abs(best + 1 - item.lineNumber);
      for (const index of candidates) {
        const dist = Math.abs(index + 1 - item.lineNumber);
        if (dist < bestDist) {
          best = index;
          bestDist = dist;
        }
      }
    }
    return { ...item, lineNumber: best + 1 };
  });
}

/** Parse Reader note target (`Tito.1.1` or `Tito.1.1--Tito.1.3`) → verse keys. */
export function verseKeysFromNoteTarget(target: string): string[] {
  const [startRaw, endRaw] = target.split("--");
  const parse = (value: string): { chapter: number; verse: number } | null => {
    const match = value.trim().match(/\.(\d+)\.(\d+)$/);
    if (!match) return null;
    return { chapter: Number(match[1]), verse: Number(match[2]) };
  };
  const start = parse(startRaw);
  if (!start) return [];
  if (!endRaw) return [`${start.chapter}:${start.verse}`];
  const end = parse(endRaw);
  if (!end) return [`${start.chapter}:${start.verse}`];
  if (start.chapter !== end.chapter) {
    return [`${start.chapter}:${start.verse}`, `${end.chapter}:${end.verse}`];
  }
  const keys: string[] = [];
  const low = Math.min(start.verse, end.verse);
  const high = Math.max(start.verse, end.verse);
  for (let verse = low; verse <= high; verse += 1) {
    keys.push(`${start.chapter}:${verse}`);
  }
  return keys;
}

/** Plain Reader-note lines for a Tito verse — never `*` grammar markers. */
export function readerNoteCommentLines(chapter: number, verse: number, notes: ReaderNote[]): string[] {
  const verseKey = `${chapter}:${verse}`;
  const lines: string[] = [];
  for (const note of notes) {
    if (!note.text.trim()) continue;
    if (!verseKeysFromNoteTarget(note.target).includes(verseKey)) continue;
    lines.push(`Nota (Lector): ${note.text.trim()}`);
  }
  return lines;
}

export function formatAttachmentLine(item: CompilerAttachment): string {
  if (item.kind === "definition") {
    const body = item.text.trim() || item.spanishGloss?.trim() || "";
    return `Def. (${item.lemma}): ${body}`;
  }
  const ref = item.reference?.trim() || "";
  const gloss = item.spanishGloss?.trim() || item.text.trim();
  const surface = item.surfaceForm?.trim() || "";
  return [`XRef (${item.lemma}):`, ref, surface, gloss].filter(Boolean).join(" — ").replace(" — — ", " — ");
}

/**
 * Insert pinned Def/XRef lines after their target line numbers.
 * Each pin becomes its own slide (pin line + blank).
 * Line numbers refer to the base markdown (before pins). Orphans (line 0) are skipped.
 */
export function applyLineAttachments(markdown: string, attachments: CompilerAttachment[]): string {
  if (!attachments.length) return markdown;
  const baseLines = markdown.split("\n");
  const byLine = new Map<number, CompilerAttachment[]>();
  for (const item of attachments) {
    if (item.lineNumber < 1) continue;
    const list = byLine.get(item.lineNumber) ?? [];
    list.push(item);
    byLine.set(item.lineNumber, list);
  }

  const out: string[] = [];
  for (let index = 0; index < baseLines.length; index += 1) {
    const lineNumber = index + 1;
    out.push(baseLines[index]);
    const pins = byLine.get(lineNumber);
    if (!pins?.length) continue;
    // If the base line already ends a slide (blank), insert pins before that blank.
    if (baseLines[index] === "" && out.length) {
      out.pop();
      for (const pin of pins) {
        out.push(formatAttachmentLine(pin));
        out.push("");
      }
      out.push("");
      continue;
    }
    for (const pin of pins) {
      out.push(formatAttachmentLine(pin));
      out.push("");
    }
  }
  return out.join("\n");
}

export interface SearchHit {
  lineNumber: number;
  line: string;
  before: string;
  after: string;
}

/** Case-insensitive search over markdown lines; returns context for each hit. */
export function searchMarkdownLines(markdown: string, query: string, limit = 40): SearchHit[] {
  const needle = query.trim();
  if (!needle) return [];
  const lines = markdown.split("\n");
  const lower = needle.toLowerCase();
  const hits: SearchHit[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().includes(lower)) continue;
    hits.push({
      lineNumber: index + 1,
      line: lines[index],
      before: index > 0 ? lines[index - 1] : "",
      after: index + 1 < lines.length ? lines[index + 1] : ""
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
