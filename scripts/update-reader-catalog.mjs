#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BOOKS = [
  ["genesis", "Génesis", "01", "ot"],
  ["exodo", "Éxodo", "02", "ot"],
  ["levitico", "Levítico", "03", "ot"],
  ["numeros", "Números", "04", "ot"],
  ["deuteronomio", "Deuteronomio", "05", "ot"],
  ["josue", "Josué", "06", "ot"],
  ["jueces", "Jueces", "07", "ot"],
  ["rut", "Rut", "08", "ot"],
  ["1samuel", "1 Samuel", "09", "ot"],
  ["2samuel", "2 Samuel", "10", "ot"],
  ["1reyes", "1 Reyes", "11", "ot"],
  ["2reyes", "2 Reyes", "12", "ot"],
  ["1cronicas", "1 Crónicas", "13", "ot"],
  ["2cronicas", "2 Crónicas", "14", "ot"],
  ["esdras", "Esdras", "15", "ot"],
  ["nehemias", "Nehemías", "16", "ot"],
  ["ester", "Ester", "17", "ot"],
  ["job", "Job", "18", "ot"],
  ["salmos", "Salmos", "19", "ot"],
  ["proverbios", "Proverbios", "20", "ot"],
  ["eclesiastes", "Eclesiastés", "21", "ot"],
  ["cantares", "Cantares", "22", "ot"],
  ["isaias", "Isaías", "23", "ot"],
  ["jeremias", "Jeremías", "24", "ot"],
  ["lamentaciones", "Lamentaciones", "25", "ot"],
  ["ezequiel", "Ezequiel", "26", "ot"],
  ["daniel", "Daniel", "27", "ot"],
  ["oseas", "Oseas", "28", "ot"],
  ["joel", "Joel", "29", "ot"],
  ["amos", "Amós", "30", "ot"],
  ["abdias", "Abdías", "31", "ot"],
  ["jonas", "Jonás", "32", "ot"],
  ["miqueas", "Miqueas", "33", "ot"],
  ["nahum", "Nahúm", "34", "ot"],
  ["habacuc", "Habacuc", "35", "ot"],
  ["sofonias", "Sofonías", "36", "ot"],
  ["hageo", "Hageo", "37", "ot"],
  ["zacarias", "Zacarías", "38", "ot"],
  ["malaquias", "Malaquías", "39", "ot"],
  ["mateo", "Mateo", "40", "nt", "61-Mt"],
  ["marcos", "Marcos", "41", "nt", "62-Mk"],
  ["lucas", "Lucas", "42", "nt", "63-Lk"],
  ["juan", "Juan", "43", "nt", "64-Jn"],
  ["hechos", "Hechos", "44", "nt", "65-Ac"],
  ["romanos", "Romanos", "45", "nt", "66-Ro"],
  ["1corintios", "1 Corintios", "46", "nt", "67-1Co"],
  ["2corintios", "2 Corintios", "47", "nt", "68-2Co"],
  ["galatas", "Gálatas", "48", "nt", "69-Ga"],
  ["efesios", "Efesios", "49", "nt", "70-Eph"],
  ["filipenses", "Filipenses", "50", "nt", "71-Php"],
  ["colosenses", "Colosenses", "51", "nt", "72-Col"],
  ["1tesalonicenses", "1 Tesalonicenses", "52", "nt", "73-1Th"],
  ["2tesalonicenses", "2 Tesalonicenses", "53", "nt", "74-2Th"],
  ["1timoteo", "1 Timoteo", "54", "nt", "75-1Ti"],
  ["2timoteo", "2 Timoteo", "55", "nt", "76-2Ti"],
  ["tito", "Tito", "56", "nt", "77-Tit"],
  ["filemon", "Filemón", "57", "nt", "78-Phm"],
  ["hebreos", "Hebreos", "58", "nt", "79-Heb"],
  ["santiago", "Santiago", "59", "nt", "80-Jas"],
  ["1pedro", "1 Pedro", "60", "nt", "81-1Pe"],
  ["2pedro", "2 Pedro", "61", "nt", "82-2Pe"],
  ["1juan", "1 Juan", "62", "nt", "83-1Jn"],
  ["2juan", "2 Juan", "63", "nt", "84-2Jn"],
  ["3juan", "3 Juan", "64", "nt", "85-3Jn"],
  ["judas", "Judas", "65", "nt", "86-Jud"],
  ["apocalipsis", "Apocalipsis", "66", "nt", "87-Re"]
].map(([id, displayName, rv1909, testament, morphGntStem = ""]) => ({
  id,
  displayName,
  rv1909,
  testament,
  morphGntStem
}));

function parseArgs(argv) {
  const options = { check: false, dataPath: process.env.CGV_DATA_PATH ?? "../cgv-data" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--data-path") {
      const value = argv[index + 1];
      if (!value) throw new Error("--data-path requires a value");
      options.dataPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function gitCommit(dataDir) {
  try {
    return execFileSync("git", ["-C", dataDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unavailable";
  }
}

function isFile(dataDir, relativePath) {
  return existsSync(resolve(dataDir, relativePath));
}

function listPublishedLbfIds(dataDir) {
  const lbfDir = resolve(dataDir, "bibles/LBF");
  if (!existsSync(lbfDir)) throw new Error(`Missing cgv-data LBF directory: ${lbfDir}`);
  return readdirSync(lbfDir)
    .filter(name => name.endsWith(".lbf.md"))
    .map(name => name.slice(0, -".lbf.md".length))
    .sort();
}

function versionAvailability(dataDir, book) {
  const checks = [
    ["NBLA", `bibles/NBLA/${book.id}.nbla.md`],
    ["BLE", `bibles/BLE/${book.id}.ble.md`],
    ["SPNBES", `bibles/SPNBES/${book.id}.txt`],
    ["RV1909", `bibles/RV1909/md/${book.rv1909}.content.md`],
    ["LBF", `bibles/LBF/${book.id}.lbf.md`]
  ];
  return checks.filter(([, path]) => isFile(dataDir, path)).map(([version]) => version);
}

function quote(value) {
  return JSON.stringify(value);
}

function renderCatalog(books, commit) {
  const rows = books.map(book => {
    const versions = `[${book.versions.map(quote).join(", ")}]`;
    return `  { id: ${quote(book.id)}, displayName: ${quote(book.displayName)}, rv1909: ${quote(book.rv1909)}, testament: ${quote(book.testament)}, versions: ${versions}, morphGntStem: ${quote(book.morphGntStem)}, hasOshb: ${book.hasOshb} }`;
  });
  return `/* This file is generated by scripts/update-reader-catalog.mjs. Do not edit. */
import type { BibleVersionId } from "./bible-version";

export const CGV_DATASET_PROVENANCE = {
  id: "cgv-data",
  gitCommit: ${quote(commit)}
} as const;

export interface GeneratedReaderBookInfo {
  id: string;
  displayName: string;
  rv1909: string;
  testament: "ot" | "nt";
  versions: readonly BibleVersionId[];
  morphGntStem: string;
  hasOshb: boolean;
}

export const GENERATED_READER_BOOKS = [
${rows.join(",\n")}
] as const satisfies readonly GeneratedReaderBookInfo[];
`;
}

function globLines(books, version) {
  return books
    .filter(book => book.versions.includes(version))
    .map(book => {
      if (version === "NBLA") return `    "@cgv-data/bibles/NBLA/${book.id}.nbla.md"`;
      if (version === "BLE") return `    "@cgv-data/bibles/BLE/${book.id}.ble.md"`;
      if (version === "SPNBES") return `    "@cgv-data/bibles/SPNBES/${book.id}.txt"`;
      return `    "@cgv-data/bibles/RV1909/md/${book.rv1909}.content.md"`;
    })
    .join(",\n");
}

function renderAssets(books) {
  return `/* This file is generated by scripts/update-reader-catalog.mjs. Do not edit. */
export type ReaderRawLoaders = Record<string, () => Promise<string>>;

export const nblaFiles = import.meta.glob(
  [
${globLines(books, "NBLA")}
  ],
  { query: "?raw", import: "default" }
) as ReaderRawLoaders;

export const bleFiles = import.meta.glob(
  [
${globLines(books, "BLE")}
  ],
  { query: "?raw", import: "default" }
) as ReaderRawLoaders;

export const spnbesFiles = import.meta.glob(
  [
${globLines(books, "SPNBES")}
  ],
  { query: "?raw", import: "default" }
) as ReaderRawLoaders;

export const rv1909Files = import.meta.glob(
  [
${globLines(books, "RV1909")}
  ],
  { query: "?raw", import: "default" }
) as ReaderRawLoaders;
`;
}

function updateFile(path, content, check) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === content) return false;
  if (check) throw new Error(`Generated Reader catalog is stale: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
  return true;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dataDir = resolve(REPO_ROOT, options.dataPath);
  if (!existsSync(dataDir)) throw new Error(`Missing cgv-data checkout: ${dataDir}`);

  const byId = new Map(BOOKS.map(book => [book.id, book]));
  const publishedLbfIds = listPublishedLbfIds(dataDir);
  const unknown = publishedLbfIds.filter(id => !byId.has(id));
  if (unknown.length) {
    throw new Error(`Published LBF book(s) lack canonical Reader metadata: ${unknown.join(", ")}`);
  }

  // Reader baseline is the whole NT. OT books enter automatically when LBF is published.
  const included = BOOKS.filter(book => book.testament === "nt" || publishedLbfIds.includes(book.id)).map(book => ({
    ...book,
    versions: versionAvailability(dataDir, book),
    hasOshb: book.testament === "ot" && isFile(dataDir, `interlinears/OT/${book.id}.tokens.jsonl`)
  }));

  const withoutText = included.filter(book => book.versions.length === 0);
  if (withoutText.length) {
    throw new Error(`Reader book(s) have no available Bible text: ${withoutText.map(book => book.id).join(", ")}`);
  }

  const commit = gitCommit(dataDir);
  const catalogPath = resolve(REPO_ROOT, "packages/core/src/reader-books.generated.ts");
  const assetsPath = resolve(REPO_ROOT, "apps/reader/src/core/reader-assets.generated.ts");
  const changed = [
    updateFile(catalogPath, renderCatalog(included, commit), options.check),
    updateFile(assetsPath, renderAssets(included), options.check)
  ].some(Boolean);

  if (!options.check) {
    console.log(`${changed ? "Updated" : "Verified"} Reader catalog: ${included.length} books from cgv-data ${commit.slice(0, 12)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
