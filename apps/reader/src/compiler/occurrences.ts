// Word/lemma occurrence gathering — Compiler's first tool, per
// compiler-manual-generation-spec.md's "Confirmed next step." Reuses the
// actual occurrence-generation logic from /herramientas/cgv-translator's
// src/data/cgvData.js (getGreekOccurrencesByStrongs): scan every NT book for
// a matching lemma, return each occurrence with its reference and Greek
// data. That implementation reads MorphGNT off Node's filesystem and cross-
// references four separate historical-translation indexes (RV1862, BLE,
// SPNBES, SPNVBL) — none of which this browser-only app loads or needs.
// What's reused here is the actual algorithm (scan every book, match by
// lemma, collect one entry per hit) against the same underlying data,
// re-pointed at the *.tokens.jsonl files this app already reads for Titus
// (see clause-data.ts) — a lighter, uniform format the whole NT already has,
// rather than re-parsing raw MorphGNT text per cgvData.js's own approach.
//
// Scripture-only discipline, per cgv-product-suite-spec.md's Compiler
// section: this locates occurrences and presents them. It never argues for
// which ones matter — that's Writer's job, downstream of this.

const occurrenceFiles = import.meta.glob("@cgv-data/interlinears/NT/*.tokens.jsonl", {
  as: "raw",
  eager: true
}) as Record<string, string>;

// Spanish display names for the NT book slugs used in *.tokens.jsonl's own
// "book" field (matches the filename stem) — the same 27 NT books this
// project's cgv-data checkout already carries token files for.
const BOOK_DISPLAY_NAMES: Record<string, string> = {
  mateo: "Mateo",
  marcos: "Marcos",
  lucas: "Lucas",
  juan: "Juan",
  hechos: "Hechos",
  romanos: "Romanos",
  "1corintios": "1 Corintios",
  "2corintios": "2 Corintios",
  galatas: "Gálatas",
  efesios: "Efesios",
  filipenses: "Filipenses",
  colosenses: "Colosenses",
  "1tesalonicenses": "1 Tesalonicenses",
  "2tesalonicenses": "2 Tesalonicenses",
  "1timoteo": "1 Timoteo",
  "2timoteo": "2 Timoteo",
  tito: "Tito",
  filemon: "Filemón",
  hebreos: "Hebreos",
  santiago: "Santiago",
  "1pedro": "1 Pedro",
  "2pedro": "2 Pedro",
  "1juan": "1 Juan",
  "2juan": "2 Juan",
  "3juan": "3 Juan",
  judas: "Judas",
  apocalipsis: "Apocalipsis"
};

interface TokenRow {
  book: string;
  ch: number;
  vs: number;
  tok: number;
  surface: string;
  lemma: string;
  morph: string;
  es: string;
}

function parseTokenLine(line: string): TokenRow | null {
  if (!line.trim()) return null;
  try {
    const row = JSON.parse(line);
    if (
      typeof row.book === "string" &&
      typeof row.ch === "number" &&
      typeof row.vs === "number" &&
      typeof row.tok === "number" &&
      typeof row.surface === "string" &&
      typeof row.lemma === "string" &&
      typeof row.morph === "string" &&
      typeof row.es === "string"
    ) {
      return row as TokenRow;
    }
    return null;
  } catch {
    return null;
  }
}

export interface WordOccurrence {
  reference: string;
  book: string;
  bookName: string;
  chapter: number;
  verse: number;
  surfaceForm: string;
  lemma: string;
  morphology: string;
  spanishGloss: string;
}

let cachedRows: TokenRow[] | null = null;

function allRows(): TokenRow[] {
  if (cachedRows) return cachedRows;
  const rows: TokenRow[] = [];
  for (const content of Object.values(occurrenceFiles)) {
    for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
      const row = parseTokenLine(line);
      if (row) rows.push(row);
    }
  }
  cachedRows = rows;
  return rows;
}

// Book order follows the NT's own canonical order (Matthew → Revelation),
// not filename/alphabetical order — the same "chronological, document
// order" discipline the skeleton generator already follows within one book.
const BOOK_ORDER = Object.keys(BOOK_DISPLAY_NAMES);

function bookOrderIndex(book: string): number {
  const index = BOOK_ORDER.indexOf(book);
  return index === -1 ? BOOK_ORDER.length : index;
}

/**
 * Every occurrence of a Greek lemma across the whole NT, in canonical book
 * order then chapter:verse:token order. Read-only, presents what's found —
 * never ranks or selects which occurrences matter.
 */
export function findOccurrencesByLemma(lemma: string): WordOccurrence[] {
  const target = lemma.trim();
  if (!target) return [];

  return allRows()
    .filter(row => row.lemma === target)
    .map(row => ({
      reference: `${BOOK_DISPLAY_NAMES[row.book] ?? row.book} ${row.ch}:${row.vs}`,
      book: row.book,
      bookName: BOOK_DISPLAY_NAMES[row.book] ?? row.book,
      chapter: row.ch,
      verse: row.vs,
      surfaceForm: row.surface,
      lemma: row.lemma,
      morphology: row.morph,
      spanishGloss: row.es.replace(/·/g, " ")
    }))
    .sort((a, b) => {
      const bookDiff = bookOrderIndex(a.book) - bookOrderIndex(b.book);
      if (bookDiff) return bookDiff;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });
}

/**
 * Distinct lemmas present anywhere in the NT data — feeds a lemma picker so
 * a writer isn't stuck typing accented Greek by hand. Sorted by how often
 * each occurs (most common first) purely as a browsing convenience, not a
 * judgment about importance.
 */
export function listAvailableLemmas(): { lemma: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of allRows()) {
    counts.set(row.lemma, (counts.get(row.lemma) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([lemma, count]) => ({ lemma, count }))
    .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
}
