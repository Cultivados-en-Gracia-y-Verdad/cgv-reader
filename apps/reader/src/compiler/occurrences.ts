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

/** Lazy per-book chunks — keep the main Worker asset under Cloudflare's 25 MiB limit. */
const occurrenceFiles = import.meta.glob("@cgv-data/interlinears/NT/*.tokens.jsonl", {
  query: "?raw",
  import: "default"
}) as Record<string, () => Promise<string>>;

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
let rowsPromise: Promise<TokenRow[]> | null = null;

async function allRows(): Promise<TokenRow[]> {
  if (cachedRows) return cachedRows;
  if (!rowsPromise) {
    rowsPromise = (async () => {
      const contents = await Promise.all(Object.values(occurrenceFiles).map(load => load()));
      const rows: TokenRow[] = [];
      for (const content of contents) {
        for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
          const row = parseTokenLine(line);
          if (row) rows.push(row);
        }
      }
      cachedRows = rows;
      return rows;
    })();
  }
  return rowsPromise;
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
export async function findOccurrencesByLemma(lemma: string): Promise<WordOccurrence[]> {
  const target = lemma.trim();
  if (!target) return [];

  return (await allRows())
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
export async function listAvailableLemmas(): Promise<{ lemma: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const row of await allRows()) {
    counts.set(row.lemma, (counts.get(row.lemma) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([lemma, count]) => ({ lemma, count }))
    .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
}

export interface BibleVerseHit {
  reference: string;
  book: string;
  bookName: string;
  chapter: number;
  verse: number;
  /** Spanish glosses joined for the verse (searchable reading surface). */
  spanishText: string;
  /** Greek surfaces joined (also matched in search). */
  greekText: string;
  before: string;
  after: string;
}

interface VerseBundle {
  book: string;
  chapter: number;
  verse: number;
  spanishParts: string[];
  greekParts: string[];
}

let cachedVerses: VerseBundle[] | null = null;

async function allVerses(): Promise<VerseBundle[]> {
  if (cachedVerses) return cachedVerses;
  const map = new Map<string, VerseBundle>();
  for (const row of await allRows()) {
    const key = `${row.book}:${row.ch}:${row.vs}`;
    let bundle = map.get(key);
    if (!bundle) {
      bundle = {
        book: row.book,
        chapter: row.ch,
        verse: row.vs,
        spanishParts: [],
        greekParts: []
      };
      map.set(key, bundle);
    }
    const gloss = row.es.replace(/·/g, " ").trim();
    if (gloss) bundle.spanishParts.push(gloss);
    const surface = row.surface.trim();
    if (surface) bundle.greekParts.push(surface);
  }
  cachedVerses = Array.from(map.values()).sort((a, b) => {
    const bookDiff = bookOrderIndex(a.book) - bookOrderIndex(b.book);
    if (bookDiff) return bookDiff;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });
  return cachedVerses;
}

/**
 * Phrase/word search across NT verse text (Spanish glosses + Greek surfaces).
 * Returns verse hits with neighboring-verse context — Scripture only, no ranking.
 */
export async function searchBibleText(query: string, limit = 40): Promise<BibleVerseHit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const verses = await allVerses();
  const hits: BibleVerseHit[] = [];
  for (let index = 0; index < verses.length; index += 1) {
    const verse = verses[index];
    const spanishText = verse.spanishParts.join(" ");
    const greekText = verse.greekParts.join(" ");
    const haystack = `${spanishText} ${greekText}`.toLowerCase();
    if (!haystack.includes(needle)) continue;
    const before = index > 0 ? verses[index - 1] : null;
    const after = index + 1 < verses.length ? verses[index + 1] : null;
    hits.push({
      reference: `${BOOK_DISPLAY_NAMES[verse.book] ?? verse.book} ${verse.chapter}:${verse.verse}`,
      book: verse.book,
      bookName: BOOK_DISPLAY_NAMES[verse.book] ?? verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      spanishText,
      greekText,
      before: before
        ? `${BOOK_DISPLAY_NAMES[before.book] ?? before.book} ${before.chapter}:${before.verse} · ${before.spanishParts.join(" ")}`
        : "",
      after: after
        ? `${BOOK_DISPLAY_NAMES[after.book] ?? after.book} ${after.chapter}:${after.verse} · ${after.spanishParts.join(" ")}`
        : ""
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
