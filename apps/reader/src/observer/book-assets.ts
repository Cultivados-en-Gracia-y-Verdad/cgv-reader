import {
  MORPHGNT_STEM_BY_BOOK,
  getReaderBookInfo,
  readerBookHasOshb,
  registerPublishedLbfAssets,
  type ReaderBookId
} from "@cgv/core";
import { nblaFiles } from "../core/reader-assets.generated";

/** Eager so Reader / Mark can load LBF sync when the book has text. */
const lbfMdFiles = import.meta.glob(
  ["@cgv-data/bibles/LBF/*.lbf.md"],
  {
    query: "?raw",
    import: "default",
    eager: true
  }
) as Record<string, string>;

const canonicalLbfAlignmentFiles = import.meta.glob(
  ["@cgv-data/bibles/LBF/alignments/*.alignment.json"],
  {
    query: "?raw",
    import: "default",
    eager: true
  }
) as Record<string, string>;

const lbfAlignmentFiles = import.meta.glob(
  ["@cgv-lbf/nt/*.alignment.json", "@cgv-lbf/ot/*.alignment.json"],
  {
    query: "?raw",
    import: "default",
    eager: true
  }
) as Record<string, string>;

/** Lazy globs — keep each book under the Cloudflare Workers 25 MiB asset limit. */
const morphFiles = import.meta.glob("@cgv-data/morphology/MorphGNT/*-morphgnt.txt", {
  query: "?raw",
  import: "default"
}) as Record<string, () => Promise<string>>;

/**
 * Sync morph/tokens only for LBF Structure books.
 * Eager-loading the whole NT overflows Cloudflare Workers' 25 MiB asset limit.
 */
const morphFilesEager = import.meta.glob(
  [
    "@cgv-data/morphology/MorphGNT/77-Tit-morphgnt.txt",
    "@cgv-data/morphology/MorphGNT/81-1Pe-morphgnt.txt",
    "@cgv-data/morphology/MorphGNT/86-Jud-morphgnt.txt",
    "@cgv-data/morphology/MorphGNT/83-1Jn-morphgnt.txt",
    "@cgv-data/morphology/MorphGNT/87-Re-morphgnt.txt"
  ],
  {
    query: "?raw",
    import: "default",
    eager: true
  }
) as Record<string, string>;

const tokenFiles = import.meta.glob(
  ["@cgv-data/interlinears/NT/*.tokens.jsonl", "@cgv-data/interlinears/OT/*.tokens.jsonl"],
  {
    query: "?raw",
    import: "default"
  }
) as Record<string, () => Promise<string>>;

const tokenFilesEager = import.meta.glob(
  [
    "@cgv-data/interlinears/NT/tito.tokens.jsonl",
    "@cgv-data/interlinears/NT/1pedro.tokens.jsonl",
    "@cgv-data/interlinears/NT/judas.tokens.jsonl",
    "@cgv-data/interlinears/NT/1juan.tokens.jsonl",
    "@cgv-data/interlinears/NT/apocalipsis.tokens.jsonl",
    "@cgv-data/interlinears/OT/daniel.tokens.jsonl",
    "@cgv-data/interlinears/OT/zacarias.tokens.jsonl"
  ],
  {
    query: "?raw",
    import: "default",
    eager: true
  }
) as Record<string, string>;

const interlinearFiles = import.meta.glob(
  [
    "@cgv-data/interlinears/NT/*.interlinear.txt",
    "@cgv-data/interlinears/OT/*.interlinear.txt"
  ],
  {
    query: "?raw",
    import: "default"
  }
) as Record<string, () => Promise<string>>;

function globKey(files: Record<string, unknown>, endsWith: string): string | undefined {
  return Object.keys(files).find(path => path.endsWith(endsWith));
}

function publishedLbfExists(bookId: ReaderBookId): boolean {
  return Boolean(globKey(lbfMdFiles, `/${bookId}.lbf.md`));
}

function publishedAlignmentExists(bookId: ReaderBookId): boolean {
  if (globKey(canonicalLbfAlignmentFiles, `/alignments/${bookId}.alignment.json`)) return true;
  const folder = getReaderBookInfo(bookId).testament === "ot" ? "ot" : "nt";
  return Boolean(globKey(lbfAlignmentFiles, `/${folder}/${bookId}.alignment.json`));
}

registerPublishedLbfAssets(publishedLbfExists, publishedAlignmentExists);

const morphCache = new Map<ReaderBookId, string>();
const tokenCache = new Map<ReaderBookId, string>();
const sourceLoads = new Map<ReaderBookId, Promise<void>>();

function eagerMorph(bookId: ReaderBookId): string | undefined {
  const stem = MORPHGNT_STEM_BY_BOOK[bookId];
  if (!stem) return undefined;
  const key = globKey(morphFilesEager, `/${stem}-morphgnt.txt`);
  return key ? morphFilesEager[key] : undefined;
}

function eagerTokens(bookId: ReaderBookId): string | undefined {
  const key = globKey(tokenFilesEager, `/${bookId}.tokens.jsonl`);
  return key ? tokenFilesEager[key] : undefined;
}

/** Warm MorphGNT + tokens for Structure. Eager copies if bundled; else lazy glob. */
export async function ensureWorkshopSources(bookId: ReaderBookId): Promise<void> {
  if (readerBookHasOshb(bookId) && (eagerTokens(bookId) || tokenCache.has(bookId))) return;
  if (!readerBookHasOshb(bookId) && (eagerMorph(bookId) || morphCache.has(bookId)) && (eagerTokens(bookId) || tokenCache.has(bookId))) {
    return;
  }
  const pending = sourceLoads.get(bookId);
  if (pending) return pending;
  const load = (async () => {
    if (!readerBookHasOshb(bookId) && !eagerMorph(bookId) && !morphCache.has(bookId)) {
      morphCache.set(bookId, await loadMorphRaw(bookId));
    }
    if (!eagerTokens(bookId) && !tokenCache.has(bookId)) {
      tokenCache.set(bookId, await loadTokensRaw(bookId));
    }
  })();
  sourceLoads.set(bookId, load);
  try {
    await load;
  } finally {
    sourceLoads.delete(bookId);
  }
}

async function loadByEndsWith(
  files: Record<string, () => Promise<string>>,
  endsWith: string
): Promise<string> {
  const key = globKey(files, endsWith);
  if (!key) throw new Error(`Missing asset ending with ${endsWith}`);
  return files[key]();
}

export async function loadMorphRaw(bookId: ReaderBookId): Promise<string> {
  const stem = MORPHGNT_STEM_BY_BOOK[bookId];
  if (!stem) {
    throw new Error(
      `No MorphGNT spine for ${getReaderBookInfo(bookId).displayName} (OT uses OSHB tokens).`
    );
  }
  return loadByEndsWith(morphFiles, `/${stem}-morphgnt.txt`);
}

export function loadMorphRawSync(bookId: ReaderBookId): string {
  if (readerBookHasOshb(bookId)) {
    // Structure maps OT progress ids without MorphGNT lines.
    return "";
  }
  const eager = eagerMorph(bookId);
  if (eager !== undefined) return eager;
  const cached = morphCache.get(bookId);
  if (cached !== undefined) return cached;
  throw new Error(
    `MorphGNT for ${getReaderBookInfo(bookId).displayName} is not loaded yet. Call ensureWorkshopSources first.`
  );
}

export async function loadTokensRaw(bookId: ReaderBookId): Promise<string> {
  return loadByEndsWith(tokenFiles, `/${bookId}.tokens.jsonl`);
}

export function loadTokensRawSync(bookId: ReaderBookId): string {
  const eager = eagerTokens(bookId);
  if (eager !== undefined) return eager;
  const cached = tokenCache.get(bookId);
  if (cached !== undefined) return cached;
  throw new Error(
    `Tokens for ${getReaderBookInfo(bookId).displayName} are not loaded yet. Call ensureWorkshopSources first.`
  );
}

export async function loadNblaRaw(bookId: ReaderBookId): Promise<string> {
  return loadByEndsWith(nblaFiles, `/${bookId}.nbla.md`);
}

/** Concatenated chapter interlinear files for one book (sorted). */
export async function loadInterlinearRaw(bookId: ReaderBookId): Promise<string> {
  const suffix = ".interlinear.txt";
  const chapters = Object.keys(interlinearFiles)
    .filter(path => {
      const base = path.split("/").pop() ?? "";
      return base.startsWith(`${bookId}-`) && base.endsWith(suffix);
    })
    .sort();
  if (!chapters.length) {
    throw new Error(`No interlinear chapters for ${getReaderBookInfo(bookId).displayName}`);
  }
  const parts = await Promise.all(chapters.map(path => interlinearFiles[path]()));
  return parts.join("\n");
}

function lbfMarkdownPath(bookId: ReaderBookId): string {
  const endsWith = `/${bookId}.lbf.md`;
  const key = Object.keys(lbfMdFiles).find(path => path.endsWith(endsWith));
  if (!key) {
    throw new Error(`Missing LBF markdown for ${getReaderBookInfo(bookId).displayName}`);
  }
  return key;
}

export function loadLbfRaw(bookId: ReaderBookId): string {
  if (!publishedLbfExists(bookId)) {
    throw new Error(`LBF is not available for ${getReaderBookInfo(bookId).displayName} yet.`);
  }
  return lbfMdFiles[lbfMarkdownPath(bookId)];
}

export function loadLbfAlignmentRaw(bookId: ReaderBookId): string {
  // Prefer published cgv-data, then local fallback. Empty file if neither exists.
  const canonicalKey = globKey(canonicalLbfAlignmentFiles, `/alignments/${bookId}.alignment.json`);
  if (canonicalKey) {
    return canonicalLbfAlignmentFiles[canonicalKey];
  }
  const folder = getReaderBookInfo(bookId).testament === "ot" ? "ot" : "nt";
  const key = globKey(lbfAlignmentFiles, `/${folder}/${bookId}.alignment.json`);
  if (!key) {
    return JSON.stringify({ records: [] });
  }
  return lbfAlignmentFiles[key];
}
