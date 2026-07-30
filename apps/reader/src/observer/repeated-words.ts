/**
 * Repeated LBF Spanish content words across the book (see book-movement-spec.md).
 * Objective recurrence — never theme labels.
 */

export type MovementVerseText = {
  verseKey: string;
  reference: string;
  text: string;
};

export type RepeatedWordVerseHit = {
  verseKey: string;
  reference: string;
  count: number;
  /** True when this word already appeared earlier, then was absent, then returns. */
  isReturn: boolean;
};

export type RepeatedWordEntry = {
  /** Folded surface used as the key (e.g. "comunion"). */
  word: string;
  /** Display form (first seen surface, preferably accented). */
  display: string;
  count: number;
  verses: RepeatedWordVerseHit[];
};

function fold(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const STOPWORDS = new Set(
  [
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "de",
    "del",
    "al",
    "a",
    "en",
    "y",
    "e",
    "o",
    "u",
    "que",
    "quien",
    "quienes",
    "cual",
    "cuales",
    "como",
    "cuando",
    "donde",
    "con",
    "sin",
    "por",
    "para",
    "sobre",
    "entre",
    "hacia",
    "hasta",
    "desde",
    "contra",
    "segun",
    "durante",
    "mediante",
    "su",
    "sus",
    "mi",
    "mis",
    "tu",
    "tus",
    "nuestro",
    "nuestra",
    "nuestros",
    "nuestras",
    "vuestro",
    "vuestra",
    "vuestros",
    "vuestras",
    "este",
    "esta",
    "estos",
    "estas",
    "ese",
    "esa",
    "esos",
    "esas",
    "aquel",
    "aquella",
    "aquellos",
    "aquellas",
    "esto",
    "eso",
    "aquello",
    "lo",
    "le",
    "les",
    "se",
    "me",
    "te",
    "nos",
    "os",
    "yo",
    "ella",
    "nosotros",
    "nosotras",
    "vosotros",
    "vosotras",
    "ellos",
    "ellas",
    "usted",
    "ustedes",
    "si",
    "no",
    "ni",
    "mas",
    "pero",
    "sino",
    "aunque",
    "porque",
    "pues",
    "asi",
    "tambien",
    "ya",
    "aun",
    "muy",
    "menos",
    "tan",
    "tanto",
    "todo",
    "toda",
    "todos",
    "todas",
    "otro",
    "otra",
    "otros",
    "otras",
    "mismo",
    "misma",
    "mismos",
    "mismas",
    "hay",
    "ser",
    "es",
    "son",
    "era",
    "eran",
    "fue",
    "fueron",
    "sea",
    "sean",
    "estar",
    "estan",
    "estaba",
    "estaban",
    "haber",
    "ha",
    "han",
    "he",
    "hemos",
    "habia",
    "habian",
    "tiene",
    "tienen",
    "tener",
    "cosa",
    "cosas",
    "uno",
    "dos",
    "tres"
  ].map(fold)
);

function tokenize(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map(t => t.trim())
    .filter(Boolean);
}

/**
 * Rank repeated LBF Spanish content words (≥3 hits in ≥2 verses).
 */
export function buildRepeatedWords(
  verses: MovementVerseText[],
  options?: { minCount?: number; minVerses?: number }
): RepeatedWordEntry[] {
  const minCount = options?.minCount ?? 3;
  const minVerses = options?.minVerses ?? 2;

  type Acc = {
    display: string;
    total: number;
    byVerse: Map<string, { reference: string; count: number; order: number }>;
  };

  const byWord = new Map<string, Acc>();
  const ordered = [...verses].sort((a, b) => {
    const [ac, av] = a.verseKey.split(":").map(Number);
    const [bc, bv] = b.verseKey.split(":").map(Number);
    return ac! - bc! || av! - bv!;
  });

  ordered.forEach((verse, order) => {
    const seenInVerse = new Map<string, number>();
    for (const raw of tokenize(verse.text)) {
      const key = fold(raw);
      if (key.length < 3) continue;
      if (STOPWORDS.has(key)) continue;
      if (/^\d+$/.test(key)) continue;
      seenInVerse.set(key, (seenInVerse.get(key) ?? 0) + 1);
      let acc = byWord.get(key);
      if (!acc) {
        acc = { display: raw, total: 0, byVerse: new Map() };
        byWord.set(key, acc);
      } else if (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(raw) && !/[áéíóúüñÁÉÍÓÚÜÑ]/.test(acc.display)) {
        acc.display = raw;
      }
    }
    for (const [key, count] of seenInVerse) {
      const acc = byWord.get(key)!;
      acc.total += count;
      const existing = acc.byVerse.get(verse.verseKey);
      if (existing) {
        existing.count += count;
      } else {
        acc.byVerse.set(verse.verseKey, {
          reference: verse.reference,
          count,
          order
        });
      }
    }
  });

  const entries: RepeatedWordEntry[] = [];
  for (const [word, acc] of byWord) {
    if (acc.total < minCount || acc.byVerse.size < minVerses) continue;
    const verseHits = [...acc.byVerse.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([verseKey, info], index, arr) => {
        let isReturn = false;
        if (index > 0) {
          const prev = arr[index - 1]![1];
          if (info.order - prev.order > 1) isReturn = true;
        }
        return {
          verseKey,
          reference: info.reference,
          count: info.count,
          isReturn
        };
      });
    entries.push({
      word,
      display: acc.display,
      count: acc.total,
      verses: verseHits
    });
  }

  return entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.display.localeCompare(b.display, "es");
  });
}

/** Per-verse repeated-word return hits for convergence scoring. */
export type RepeatedWordReturnHit = {
  word: string;
  display: string;
  verseKey: string;
  reference: string;
};

export function repeatedWordReturns(entries: RepeatedWordEntry[]): RepeatedWordReturnHit[] {
  const hits: RepeatedWordReturnHit[] = [];
  for (const entry of entries) {
    for (const verse of entry.verses) {
      if (!verse.isReturn) continue;
      hits.push({
        word: entry.word,
        display: entry.display,
        verseKey: verse.verseKey,
        reference: verse.reference
      });
    }
  }
  return hits;
}
