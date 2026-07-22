import {
  MORPHGNT_STEM_BY_BOOK,
  getReaderBookInfo,
  readerBookHasLbf,
  readerBookHasLbfStructure,
  type ReaderBookId
} from "@cgv/core";

/** Eager so Reader / Mark can load LBF sync when the book has text. */
const lbfMdFiles = import.meta.glob("@cgv-lbf/nt/*.md", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

const lbfAlignmentFiles = import.meta.glob("@cgv-lbf/nt/*.alignment.json", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

/** Lazy globs — keep each book under the Cloudflare Workers 25 MiB asset limit. */
const morphFiles = import.meta.glob("@cgv-data/morphology/MorphGNT/*-morphgnt.txt", {
  query: "?raw",
  import: "default"
}) as Record<string, () => Promise<string>>;

/**
 * Sync morph/tokens only for LBF Structure books (Tito, 1 Pedro).
 * Eager-loading the whole NT overflows Cloudflare Workers' 25 MiB asset limit.
 */
const morphFilesEager = import.meta.glob(
  [
    "@cgv-data/morphology/MorphGNT/77-Tit-morphgnt.txt",
    "@cgv-data/morphology/MorphGNT/81-1Pe-morphgnt.txt"
  ],
  {
    query: "?raw",
    import: "default",
    eager: true
  }
) as Record<string, string>;

const tokenFiles = import.meta.glob("@cgv-data/interlinears/NT/*.tokens.jsonl", {
  query: "?raw",
  import: "default"
}) as Record<string, () => Promise<string>>;

const tokenFilesEager = import.meta.glob(
  ["@cgv-data/interlinears/NT/tito.tokens.jsonl", "@cgv-data/interlinears/NT/1pedro.tokens.jsonl"],
  {
    query: "?raw",
    import: "default",
    eager: true
  }
) as Record<string, string>;

const interlinearFiles = import.meta.glob("@cgv-data/interlinears/NT/*.interlinear.txt", {
  query: "?raw",
  import: "default"
}) as Record<string, () => Promise<string>>;

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

async function loadByEndsWith(
  files: Record<string, () => Promise<string>>,
  endsWith: string
): Promise<string> {
  const key = Object.keys(files).find(path => path.endsWith(endsWith));
  if (!key) throw new Error(`Missing asset ending with ${endsWith}`);
  return files[key]();
}

export async function loadMorphRaw(bookId: ReaderBookId): Promise<string> {
  const stem = MORPHGNT_STEM_BY_BOOK[bookId];
  return loadByEndsWith(morphFiles, `/${stem}-morphgnt.txt`);
}

export function loadMorphRawSync(bookId: ReaderBookId): string {
  const stem = MORPHGNT_STEM_BY_BOOK[bookId];
  const endsWith = `/${stem}-morphgnt.txt`;
  const key = Object.keys(morphFilesEager).find(path => path.endsWith(endsWith));
  if (!key) {
    throw new Error(
      `Sync MorphGNT is only bundled for LBF Structure books; missing ${getReaderBookInfo(bookId).displayName}`
    );
  }
  return morphFilesEager[key];
}

export async function loadTokensRaw(bookId: ReaderBookId): Promise<string> {
  return loadByEndsWith(tokenFiles, `/${bookId}.tokens.jsonl`);
}

export function loadTokensRawSync(bookId: ReaderBookId): string {
  const endsWith = `/${bookId}.tokens.jsonl`;
  const key = Object.keys(tokenFilesEager).find(path => path.endsWith(endsWith));
  if (!key) {
    throw new Error(
      `Sync tokens are only bundled for LBF Structure books; missing ${getReaderBookInfo(bookId).displayName}`
    );
  }
  return tokenFilesEager[key];
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
  const endsWith = `/nt/${bookId}.md`;
  const key = Object.keys(lbfMdFiles).find(path => path.endsWith(endsWith));
  if (!key) {
    throw new Error(`Missing LBF markdown for ${getReaderBookInfo(bookId).displayName}`);
  }
  return key;
}

export function loadLbfRaw(bookId: ReaderBookId): string {
  if (!readerBookHasLbf(bookId)) {
    throw new Error(`LBF is not available for ${getReaderBookInfo(bookId).displayName} yet.`);
  }
  return lbfMdFiles[lbfMarkdownPath(bookId)];
}

export function loadLbfAlignmentRaw(bookId: ReaderBookId): string {
  // Alignment is Structure-only until a book has `*.alignment.json`.
  if (!readerBookHasLbfStructure(bookId)) {
    return JSON.stringify({ records: [] });
  }
  const endsWith = `/nt/${bookId}.alignment.json`;
  const key = Object.keys(lbfAlignmentFiles).find(path => path.endsWith(endsWith));
  if (!key) {
    return JSON.stringify({ records: [] });
  }
  return lbfAlignmentFiles[key];
}
