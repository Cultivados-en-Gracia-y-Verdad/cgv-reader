/**
 * Book definitions — propose related surfaces + definitional hits from LBF text
 * (see book-definitions-spec.md). Software proposes; student confirms. Never auto-defines.
 */

import type { MovementVerseText } from "./repeated-words";

export type DefinitionHitKind = "equative" | "contrast" | "use" | "other";

export type RelatedSurfaceProposal = {
  /** Folded key. */
  word: string;
  display: string;
  count: number;
  reason: "stem" | "partner";
};

export type DefinitionHitProposal = {
  id: string;
  verseKey: string;
  reference: string;
  kind: DefinitionHitKind;
  snippet: string;
  /** Higher = stronger definitional signal. */
  rank: number;
};

export type DefinitionInvestigation = {
  seed: string;
  seedFolded: string;
  related: RelatedSurfaceProposal[];
  hits: DefinitionHitProposal[];
};

function fold(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map(t => t.trim())
    .filter(Boolean);
}

/** Proposal partners only — not theme labels. */
const PARTNER_GROUPS: string[][] = [
  ["luz", "tinieblas", "tiniebla"],
  ["amor", "amar", "ama", "amemos", "amados", "aborrece", "aborrecer", "odio", "odia"],
  ["vida", "muerte"],
  ["verdad", "mentira", "mentiroso", "mentirosos"],
  ["mundo", "padre"]
];

function partnersFor(seedFolded: string): string[] {
  for (const group of PARTNER_GROUPS) {
    if (group.some(p => seedFolded === p || seedFolded.startsWith(p) || p.startsWith(seedFolded))) {
      return group.filter(p => p !== seedFolded);
    }
  }
  return [];
}

function stemPrefix(seedFolded: string): string {
  if (seedFolded.length <= 4) return seedFolded;
  // Drop common Spanish endings for a crude stem
  const stripped = seedFolded.replace(/(ciones|cion|ciones|mente|ados|adas|ando|iendo|amos|emos|imos|aba|ía|ian)$/u, "");
  return stripped.length >= 3 ? stripped : seedFolded.slice(0, Math.min(5, seedFolded.length));
}

function windowHasEquative(foldedVerse: string, term: string): boolean {
  // "es luz" / "luz es" / "son luz" within a short neighborhood
  const patterns = [
    new RegExp(`(?:^|[^a-z])(?:es|son)\\s+(?:\\w+\\s+){0,3}${term}(?:$|[^a-z])`),
    new RegExp(`(?:^|[^a-z])${term}\\s+(?:\\w+\\s+){0,2}(?:es|son)(?:$|[^a-z])`),
    new RegExp(`(?:^|[^a-z])(?:es|son)\\s+${term}(?:$|[^a-z])`)
  ];
  return patterns.some(re => re.test(foldedVerse));
}

function windowHasEnPhrase(foldedVerse: string, term: string): boolean {
  return new RegExp(
    `(?:^|[^a-z])(?:andar|andamos|anda|anden|andando|estar|esta|estan|estoy|estamos)\\s+(?:\\w+\\s+){0,2}en\\s+(?:\\w+\\s+){0,2}${term}(?:$|[^a-z])`
  ).test(foldedVerse);
}

function verseMentions(foldedVerse: string, term: string): boolean {
  return new RegExp(`(?:^|[^a-z])${term}(?:$|[^a-z])`).test(foldedVerse);
}

/**
 * Investigate a seed surface against book verse texts.
 * writingPurposeTexts: optional Spanish snippets already tagged as writing-purpose.
 */
export function investigateBookDefinition(
  seed: string,
  verses: MovementVerseText[],
  options?: {
    writingPurposeTexts?: string[];
    maxHits?: number;
  }
): DefinitionInvestigation {
  const seedDisplay = seed.trim();
  const seedFolded = fold(seedDisplay);
  const maxHits = options?.maxHits ?? 40;
  if (!seedFolded || seedFolded.length < 2) {
    return { seed: seedDisplay, seedFolded, related: [], hits: [] };
  }

  const stem = stemPrefix(seedFolded);
  const partners = partnersFor(seedFolded);
  const partnerSet = new Set(partners);

  // Count surfaces across the book
  const surfaceCounts = new Map<string, { display: string; count: number }>();
  for (const verse of verses) {
    for (const raw of tokenize(verse.text)) {
      const key = fold(raw);
      if (key.length < 3) continue;
      const row = surfaceCounts.get(key) ?? { display: raw, count: 0 };
      row.count += 1;
      if (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(raw) && !/[áéíóúüñÁÉÍÓÚÜÑ]/.test(row.display)) {
        row.display = raw;
      }
      surfaceCounts.set(key, row);
    }
  }

  const related: RelatedSurfaceProposal[] = [];
  const relatedSeen = new Set<string>();

  function addRelated(word: string, display: string, reason: "stem" | "partner"): void {
    if (word === seedFolded || relatedSeen.has(word)) return;
    relatedSeen.add(word);
    const counted = surfaceCounts.get(word);
    related.push({
      word,
      display: counted?.display ?? display,
      count: counted?.count ?? 0,
      reason
    });
  }

  for (const [word, info] of surfaceCounts) {
    if (word === seedFolded) continue;
    if (word.startsWith(stem) || stem.startsWith(word)) {
      addRelated(word, info.display, "stem");
    }
  }
  for (const p of partners) {
    const info = surfaceCounts.get(p);
    if (info) addRelated(p, info.display, "partner");
    else addRelated(p, p, "partner");
  }

  related.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "partner" ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.display.localeCompare(b.display, "es");
  });

  const trackTerms = new Set<string>([seedFolded, ...related.filter(r => r.count > 0).map(r => r.word)]);

  const hits: DefinitionHitProposal[] = [];
  const ordered = [...verses].sort((a, b) => {
    const [ac, av] = a.verseKey.split(":").map(Number);
    const [bc, bv] = b.verseKey.split(":").map(Number);
    return ac! - bc! || av! - bv!;
  });

  for (const verse of ordered) {
    const foldedVerse = fold(verse.text);
    const mentioned = [...trackTerms].filter(t => verseMentions(foldedVerse, t));
    if (!mentioned.length) continue;

    const hasPartner =
      mentioned.some(t => partnerSet.has(t)) ||
      partners.some(p => verseMentions(foldedVerse, p));
    const hasSeed = verseMentions(foldedVerse, seedFolded);
    const equative = mentioned.some(t => windowHasEquative(foldedVerse, t));
    const enPhrase = mentioned.some(t => windowHasEnPhrase(foldedVerse, t));
    const writingHit = (options?.writingPurposeTexts ?? []).some(snippet => {
      const fs = fold(snippet);
      if (!fs.includes(seedFolded)) return false;
      // Snippet belongs to this verse if it overlaps the verse text substantially
      const probe = foldedVerse.slice(0, Math.min(48, foldedVerse.length));
      return probe.length >= 12 && fs.includes(probe);
    });

    let kind: DefinitionHitKind = "use";
    let rank = 1;
    if (equative || enPhrase) {
      kind = "equative";
      rank = 5;
    } else if (hasPartner && hasSeed) {
      kind = "contrast";
      rank = 4;
    } else if (writingHit) {
      kind = "use";
      rank = 3;
    } else if (hasSeed) {
      kind = "use";
      rank = 2;
    } else {
      kind = "use";
      rank = 1;
    }

    // Snippet: prefer clause-ish slice around the seed
    const snippet = buildSnippet(verse.text, seedDisplay, mentioned.map(m => surfaceCounts.get(m)?.display ?? m));

    hits.push({
      id: `hit:${verse.verseKey}:${kind}:${seedFolded}`,
      verseKey: verse.verseKey,
      reference: verse.reference,
      kind,
      snippet,
      rank
    });
  }

  hits.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const [ac, av] = a.verseKey.split(":").map(Number);
    const [bc, bv] = b.verseKey.split(":").map(Number);
    return ac! - bc! || av! - bv!;
  });

  return {
    seed: seedDisplay,
    seedFolded,
    related: related.filter(r => r.count > 0 || r.reason === "partner").slice(0, 24),
    hits: hits.slice(0, maxHits)
  };
}

function buildSnippet(text: string, seed: string, alts: string[]): string {
  const lower = text;
  const needles = [seed, ...alts].filter(Boolean);
  let idx = -1;
  let found = "";
  for (const n of needles) {
    const i = lower.toLowerCase().indexOf(n.toLowerCase());
    if (i >= 0 && (idx < 0 || i < idx)) {
      idx = i;
      found = n;
    }
  }
  if (idx < 0) return text.trim().slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + found.length + 50);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}
