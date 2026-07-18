/**
 * Manual YAML frontmatter for Compiler output.
 * Headings (H1/H2) are separate — human-assigned in the markdown body, not from YAML.
 */

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

export function createDefaultManualMeta(): ManualMeta {
  return {
    book: "[book]",
    title: "título",
    subtitle: "subtítulo",
    author: "CGV",
    cover: "images/portada.png",
    date: todayIsoDate(),
    version: "1.0"
  };
}

/** Static snapshot for reset buttons — date refreshed via createDefaultManualMeta(). */
export const DEFAULT_MANUAL_META: ManualMeta = createDefaultManualMeta();

const META_STORAGE_KEY = "cgv-reader:compiler:manual-meta:v2";
const LEGACY_META_STORAGE_KEY = "cgv-suite:compiler:manual-meta:v2";

export function readManualMeta(): ManualMeta {
  const defaults = createDefaultManualMeta();
  try {
    const raw =
      window.localStorage.getItem(META_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_META_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ManualMeta>;
    return {
      book: typeof parsed.book === "string" ? parsed.book : defaults.book,
      title: typeof parsed.title === "string" ? parsed.title : defaults.title,
      subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : defaults.subtitle,
      author: typeof parsed.author === "string" ? parsed.author : defaults.author,
      cover: typeof parsed.cover === "string" ? parsed.cover : defaults.cover,
      date: typeof parsed.date === "string" && parsed.date.trim() ? parsed.date : defaults.date,
      version: typeof parsed.version === "string" ? parsed.version : defaults.version
    };
  } catch {
    return defaults;
  }
}

export function writeManualMeta(meta: ManualMeta): void {
  window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
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
    `title: ${yamlScalar(meta.title.trim() || "título")}`,
    `subtitle: ${yamlScalar(meta.subtitle.trim() || "subtítulo")}`,
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
