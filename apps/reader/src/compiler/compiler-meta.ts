/**
 * Manual YAML frontmatter for Compiler output.
 * Headings (H1/H2) are separate — human-assigned in the markdown body, not from YAML.
 *
 * `book` is not a free-form field: it always follows the workshop book on Generate
 * and when rewriting frontmatter. Title / subtitle / author / cover / date / version
 * stay whatever the student typed in the YAML form (stored per book).
 */

import { getReaderBookInfo, type ReaderBookId } from "@cgv/core";

export interface ManualMeta {
  book: string;
  title: string;
  subtitle: string;
  author: string;
  cover: string;
  date: string;
  version: string;
}

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Placeholder title/subtitle from Generate — treat as unfilled until the student edits. */
export const PLACEHOLDER_TITLE = "título";
export const PLACEHOLDER_SUBTITLE = "subtítulo";

export function bookLabelFor(bookId: ReaderBookId): string {
  return getReaderBookInfo(bookId).displayName;
}

export function createDefaultManualMeta(bookId?: ReaderBookId): ManualMeta {
  return {
    book: bookId ? bookLabelFor(bookId) : "[book]",
    title: PLACEHOLDER_TITLE,
    subtitle: PLACEHOLDER_SUBTITLE,
    author: "CGV",
    cover: "images/portada.png",
    date: todayIsoDate(),
    version: "1.0"
  };
}

/** Static snapshot for reset buttons — date refreshed via createDefaultManualMeta(). */
export const DEFAULT_MANUAL_META: ManualMeta = createDefaultManualMeta();

const META_STORAGE_PREFIX = "cgv-reader:compiler:manual-meta:v2";
const LEGACY_GLOBAL_META_KEY = "cgv-reader:compiler:manual-meta:v2";
const LEGACY_SUITE_META_KEY = "cgv-suite:compiler:manual-meta:v2";

function metaStorageKey(bookId: ReaderBookId): string {
  return `${META_STORAGE_PREFIX}:${bookId}`;
}

function sanitizeMeta(parsed: Partial<ManualMeta>, defaults: ManualMeta): ManualMeta {
  return {
    book: defaults.book,
    title: typeof parsed.title === "string" ? parsed.title : defaults.title,
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : defaults.subtitle,
    author: typeof parsed.author === "string" ? parsed.author : defaults.author,
    cover: typeof parsed.cover === "string" ? parsed.cover : defaults.cover,
    date: typeof parsed.date === "string" && parsed.date.trim() ? parsed.date : defaults.date,
    version: typeof parsed.version === "string" ? parsed.version : defaults.version
  };
}

function readRawMeta(key: string): Partial<ManualMeta> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManualMeta>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function readManualMeta(bookId?: ReaderBookId): ManualMeta {
  const defaults = createDefaultManualMeta(bookId);
  if (typeof window === "undefined") return defaults;

  if (bookId) {
    const perBook = readRawMeta(metaStorageKey(bookId));
    if (perBook) return sanitizeMeta(perBook, defaults);

    // Migrate editable fields only from legacy global meta when it named this book.
    const legacy =
      readRawMeta(LEGACY_GLOBAL_META_KEY) ?? readRawMeta(LEGACY_SUITE_META_KEY);
    if (legacy) {
      const legacyBook =
        typeof legacy.book === "string" ? legacy.book.trim().toLowerCase() : "";
      const expected = defaults.book.trim().toLowerCase();
      if (
        legacyBook === expected ||
        legacyBook === "[book]" ||
        legacyBook === "" ||
        legacyBook === bookId
      ) {
        return sanitizeMeta(legacy, defaults);
      }
    }
    return defaults;
  }

  const global =
    readRawMeta(LEGACY_GLOBAL_META_KEY) ?? readRawMeta(LEGACY_SUITE_META_KEY);
  return global ? sanitizeMeta(global, defaults) : defaults;
}

export function writeManualMeta(meta: ManualMeta, bookId?: ReaderBookId): void {
  if (typeof window === "undefined") return;
  const key = bookId ? metaStorageKey(bookId) : LEGACY_GLOBAL_META_KEY;
  const stored = bookId ? { ...meta, book: bookLabelFor(bookId) } : meta;
  window.localStorage.setItem(key, JSON.stringify(stored));
}

/**
 * Meta written into Generate YAML:
 * - `book` always = current workshop book display name
 * - other fields = form values (student edits after Generate), else book defaults
 */
export function resolveMetaForGenerate(
  formMeta: ManualMeta | undefined,
  bookId: ReaderBookId
): ManualMeta {
  const defaults = createDefaultManualMeta(bookId);
  if (!formMeta) return defaults;
  return {
    book: defaults.book,
    date: formMeta.date.trim() ? formMeta.date : defaults.date,
    title: formMeta.title.trim() ? formMeta.title : defaults.title,
    subtitle: formMeta.subtitle.trim() ? formMeta.subtitle : defaults.subtitle,
    author: formMeta.author.trim() ? formMeta.author : defaults.author,
    cover: formMeta.cover.trim() ? formMeta.cover : defaults.cover,
    version: formMeta.version.trim() ? formMeta.version : defaults.version
  };
}

/** Export filename stem — prefer real title, else book name, else id. */
export function exportSlugFromMeta(meta: ManualMeta, bookId: ReaderBookId): string {
  const title = meta.title.trim();
  const book = bookLabelFor(bookId);
  const raw =
    title && title !== PLACEHOLDER_TITLE
      ? title
      : book && book !== "[book]"
        ? book
        : bookId;
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

function yamlScalar(value: string): string {
  if (value === "") return '""';
  if (/^[\w./:[\]-]+$/u.test(value) && !/^(true|false|null|yes|no)$/i.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

/** YAML frontmatter block (including --- fences). */
export function formatYamlFrontmatter(meta: ManualMeta): string {
  const lines = [
    "---",
    `book: ${yamlScalar(meta.book.trim() || "[book]")}`,
    `title: ${yamlScalar(meta.title.trim() || PLACEHOLDER_TITLE)}`,
    `subtitle: ${yamlScalar(meta.subtitle.trim() || PLACEHOLDER_SUBTITLE)}`,
    `author: ${yamlScalar(meta.author.trim() || "CGV")}`,
    `cover: ${yamlScalar(meta.cover.trim() || "images/portada.png")}`,
    `date: ${yamlScalar(meta.date.trim() || todayIsoDate())}`,
    `version: ${yamlScalar(meta.version.trim() || "1.0")}`,
    "---"
  ];
  return lines.join("\n");
}

/**
 * Replace leading YAML in an existing generated doc, leaving headings and
 * clause sections untouched. If the doc has no frontmatter yet, prepends one.
 */
export function applyMetaToMarkdown(markdown: string, meta: ManualMeta): string {
  const yaml = `${formatYamlFrontmatter(meta)}\n\n`;
  if (/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(markdown)) {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, yaml);
  }
  return `${yaml}${markdown.replace(/^\n+/, "")}`;
}
