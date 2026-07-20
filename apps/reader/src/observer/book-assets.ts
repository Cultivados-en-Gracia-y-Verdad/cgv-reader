import {
  MORPHGNT_STEM_BY_BOOK,
  getReaderBookInfo,
  readerBookHasLbf,
  type ReaderBookId
} from "@cgv/core";
import titusLbf from "@cgv-lbf/nt/tito.md?raw";
import titusLbfAlignment from "@cgv-lbf/nt/tito.alignment.json?raw";

const morphFiles = import.meta.glob("@cgv-data/morphology/MorphGNT/*-morphgnt.txt", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

const tokenFiles = import.meta.glob("@cgv-data/interlinears/NT/*.tokens.jsonl", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

const interlinearFiles = import.meta.glob("@cgv-data/interlinears/NT/*.interlinear.txt", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

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
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

function findByEndsWith(files: Record<string, string>, endsWith: string): string {
  const key = Object.keys(files).find(path => path.endsWith(endsWith));
  if (!key) throw new Error(`Missing asset ending with ${endsWith}`);
  return files[key];
}

export function loadMorphRaw(bookId: ReaderBookId): string {
  const stem = MORPHGNT_STEM_BY_BOOK[bookId];
  return findByEndsWith(morphFiles, `/${stem}-morphgnt.txt`);
}

export function loadTokensRaw(bookId: ReaderBookId): string {
  return findByEndsWith(tokenFiles, `/${bookId}.tokens.jsonl`);
}

export function loadNblaRaw(bookId: ReaderBookId): string {
  return findByEndsWith(nblaFiles, `/${bookId}.nbla.md`);
}

/** Concatenated chapter interlinear files for one book (sorted). */
export function loadInterlinearRaw(bookId: ReaderBookId): string {
  const prefix = `/${bookId}-`;
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
  // silence unused when filter uses prefix differently
  void prefix;
  return chapters.map(path => interlinearFiles[path]).join("\n");
}

export function loadLbfRaw(bookId: ReaderBookId): string {
  if (!readerBookHasLbf(bookId)) {
    throw new Error(`LBF is not available for ${getReaderBookInfo(bookId).displayName} yet.`);
  }
  return titusLbf;
}

export function loadLbfAlignmentRaw(bookId: ReaderBookId): string {
  if (!readerBookHasLbf(bookId)) {
    return JSON.stringify({ records: [] });
  }
  return titusLbfAlignment;
}
