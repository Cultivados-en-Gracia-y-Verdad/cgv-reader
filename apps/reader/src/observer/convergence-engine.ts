/**
 * Convergence engine — verse-ranked movement hotspots (see convergence-engine-spec.md).
 * Derived only; never auto-places an H2.
 */

import type {
  BookMovementClause,
  BookMovementReport,
  FormulaHit,
  VocabFieldHit
} from "./book-movement";

export type PressurePhase = "opens" | "intensifies" | "resolves";

export type MovementEvidenceItem = {
  kind: string;
  label: string;
  detail?: string;
  points: number;
};

export type VerseConvergence = {
  verseKey: string;
  /** Display reference, e.g. "1 Juan 2:1". */
  reference: string;
  score: number;
  /** 1–10 bar height relative to max score in the book. */
  bar: number;
  phase: PressurePhase | null;
  evidence: MovementEvidenceItem[];
  /** H3 finiteVerbId that sits in this verse (first by order) — for “begin here”. */
  anchorH3Id: string;
  /** Previous H3 id in book order — breaksAfter target when beginning a movement at anchor. */
  previousH3Id: string | null;
};

export type ConvergenceReport = {
  verses: VerseConvergence[];
  /** Verses with score ≥ threshold, highest first. */
  hotspots: VerseConvergence[];
};

const WEIGHTS = {
  writingPurpose: 5,
  writingFormula: 5,
  discourseReset: 4,
  vocabReturn: 3,
  vocabConvergence: 3,
  repeatedWordReturn: 3,
  imperative: 3,
  studentPressure: 3,
  /** Reason frame grounding an H3 — intensifies / supports, never auto-names. */
  reason: 3,
  studentContrast: 3,
  assurance: 2,
  formulaHit: 2
} as const;

/** One reason-frame clause and the root H3 it grounds. */
export type ReasonHit = {
  finiteVerbId: string;
  rootId: string;
  reference: string;
  spanText: string;
};

/** Student-marked contrast on a verse. */
export type ContrastHit = {
  id: string;
  verseKey: string;
  poleA: string;
  poleB: string;
  note?: string;
};

export type VerseDashboardSection = {
  id: string;
  title: string;
  items: Array<{ label: string; detail?: string }>;
};

export type VerseDevelopmentSection = {
  id: "tension" | "pressure" | "argument";
  title: string;
  items: Array<{ label: string; detail?: string }>;
};

const DASHBOARD_SECTIONS: Array<{
  id: string;
  title: string;
  kinds: string[];
}> = [
  { id: "writing", title: "Writing purpose", kinds: ["writing-purpose", "writing-formula"] },
  { id: "resets", title: "Discourse resets", kinds: ["discourse-reset"] },
  { id: "reasons", title: "Reasons", kinds: ["reason"] },
  { id: "formulas", title: "Formulas", kinds: ["formula"] },
  { id: "repeated", title: "Repeated words", kinds: ["repeated-word", "repeated-word-return"] },
  { id: "vocab", title: "Semantic families", kinds: ["vocab-return", "vocab-convergence"] },
  { id: "contrasts", title: "Contrasts", kinds: ["contrast", "student-contrast"] },
  { id: "commands", title: "Commands", kinds: ["imperative"] },
  { id: "assurance", title: "Assurance", kinds: ["assurance"] },
  { id: "pressure", title: "Student pressure", kinds: ["student-pressure"] }
];

/**
 * Group a verse’s evidence into dashboard sections (empty sections omitted).
 */
export function buildVerseDashboard(hit: VerseConvergence): VerseDashboardSection[] {
  return DASHBOARD_SECTIONS.map(section => ({
    id: section.id,
    title: section.title,
    items: hit.evidence
      .filter(item => section.kinds.includes(item.kind))
      .map(item => ({ label: item.label, detail: item.detail }))
  })).filter(section => section.items.length > 0);
}

/**
 * Assemble tension / pressure / argument for the selected verse (omit empty).
 */
export function buildVerseDevelopment(hit: VerseConvergence): VerseDevelopmentSection[] {
  const tensionKinds = new Set(["student-pressure", "contrast", "student-contrast", "imperative"]);
  const pressureKinds = new Set(["student-pressure"]);
  const argumentKinds = new Set(["writing-purpose", "writing-formula", "reason"]);

  const sections: VerseDevelopmentSection[] = [
    {
      id: "tension",
      title: "Tension",
      items: hit.evidence
        .filter(e => tensionKinds.has(e.kind))
        .map(e => ({ label: e.label, detail: e.detail }))
    },
    {
      id: "pressure",
      title: "Pressure",
      items: hit.evidence
        .filter(e => pressureKinds.has(e.kind))
        .map(e => ({ label: e.label, detail: e.detail }))
    },
    {
      id: "argument",
      title: "Argument",
      items: hit.evidence
        .filter(e => argumentKinds.has(e.kind))
        .map(e => ({ label: e.label, detail: e.detail }))
    }
  ];
  return sections.filter(s => s.items.length > 0);
}

function verseKeyFromReference(reference: string): string | null {
  const match = reference.trim().match(/(\d+)\s*:\s*(\d+)\s*$/);
  if (!match) return null;
  return `${Number(match[1])}:${Number(match[2])}`;
}

function verseKeyFromId(finiteVerbId: string): string | null {
  const parts = finiteVerbId.split(":");
  if (parts.length < 2) return null;
  const ch = Number(parts[0]);
  const vs = Number(parts[1]);
  if (!Number.isFinite(ch) || !Number.isFinite(vs)) return null;
  return `${ch}:${vs}`;
}

function fold(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function looksLikeResolutionPurpose(trajectory: string): boolean {
  const t = fold(trajectory);
  return (
    t.includes("vida eterna") ||
    t.includes("sepan") ||
    t.includes("gozo") ||
    t.includes("sepais")
  );
}

function looksLikeAssuranceSpan(span: string): boolean {
  const t = fold(span);
  return (
    t.includes("sabemos") ||
    t.includes("conocemos") ||
    t.includes("hemos conocido") ||
    t.includes("tenemos confianza") ||
    t.includes("confianza")
  );
}

function contrastPairPresent(matchedFields: Set<string>, span: string): boolean {
  const t = fold(span);
  if (matchedFields.has("light") && (t.includes("luz") && t.includes("tiniebla"))) return true;
  if (matchedFields.has("love") && (t.includes("ama") || t.includes("amor")) && (t.includes("aborrece") || t.includes("odio"))) {
    return true;
  }
  if (matchedFields.has("truth") && t.includes("verdad") && (t.includes("mentir") || t.includes("engan"))) {
    return true;
  }
  if (matchedFields.has("life") && t.includes("vida") && t.includes("muerte")) return true;
  if (matchedFields.has("world") && matchedFields.has("family")) return true;
  return false;
}

type VerseBucket = {
  verseKey: string;
  reference: string;
  order: number;
  anchorH3Id: string;
  previousH3Id: string | null;
  evidence: MovementEvidenceItem[];
  score: number;
  hasReset: boolean;
  hasWritingPurpose: boolean;
  hasResolutionPurpose: boolean;
  hasVocabReturn: boolean;
  hasAssurance: boolean;
  hasContrast: boolean;
  hasStudentPressure: boolean;
  hasImperative: boolean;
  hasReason: boolean;
  hasRepeatedWordReturn: boolean;
};

/**
 * Rank verses by movement-signal convergence; tag pressure lifecycle.
 */
export function buildConvergenceReport(
  clauses: BookMovementClause[],
  movement: BookMovementReport,
  options?: {
    imperativeH3Ids?: Iterable<string>;
    /** pressureAfter = H3 id before the seam; pressure “into” the next H3’s verse. */
    pressureAfterH3Ids?: Iterable<string>;
    /** Reason-frame clauses (and the root each grounds). */
    reasonHits?: ReasonHit[];
    /** Student-marked contrast pairs. */
    contrastHits?: ContrastHit[];
    hotspotMinScore?: number;
  }
): ConvergenceReport {
  const ordered = [...clauses].sort((a, b) => a.order - b.order);
  if (!ordered.length) return { verses: [], hotspots: [] };

  const imperative = new Set(options?.imperativeH3Ids ?? []);
  const pressureAfter = new Set(options?.pressureAfterH3Ids ?? []);
  const reasonHits = options?.reasonHits ?? [];
  const contrastHits = options?.contrastHits ?? [];
  const hotspotMin = options?.hotspotMinScore ?? 6;
  const clauseById = new Map(ordered.map(c => [c.finiteVerbId, c]));

  const prevById = new Map<string, string | null>();
  for (let i = 0; i < ordered.length; i += 1) {
    prevById.set(ordered[i]!.finiteVerbId, i > 0 ? ordered[i - 1]!.finiteVerbId : null);
  }

  const buckets = new Map<string, VerseBucket>();

  function bucketFor(clause: BookMovementClause): VerseBucket | null {
    const verseKey = verseKeyFromId(clause.finiteVerbId) ?? verseKeyFromReference(clause.reference);
    if (!verseKey) return null;
    let bucket = buckets.get(verseKey);
    if (!bucket) {
      bucket = {
        verseKey,
        reference: clause.reference.replace(/\s+\d+:\d+\s*$/, "").trim()
          ? clause.reference
          : clause.reference,
        order: clause.order,
        anchorH3Id: clause.finiteVerbId,
        previousH3Id: prevById.get(clause.finiteVerbId) ?? null,
        evidence: [],
        score: 0,
        hasReset: false,
        hasWritingPurpose: false,
        hasResolutionPurpose: false,
        hasVocabReturn: false,
        hasAssurance: false,
        hasContrast: false,
        hasStudentPressure: false,
        hasImperative: false,
        hasReason: false,
        hasRepeatedWordReturn: false
      };
      // Prefer shorter display like book + verse if reference already has it
      buckets.set(verseKey, bucket);
    } else if (clause.order < bucket.order) {
      bucket.order = clause.order;
      bucket.anchorH3Id = clause.finiteVerbId;
      bucket.previousH3Id = prevById.get(clause.finiteVerbId) ?? null;
      bucket.reference = clause.reference;
    }
    return bucket;
  }

  function addEvidence(bucket: VerseBucket, item: MovementEvidenceItem): void {
    // Dedupe identical kind+label+detail on the same verse
    if (
      bucket.evidence.some(
        e => e.kind === item.kind && e.label === item.label && (e.detail ?? "") === (item.detail ?? "")
      )
    ) {
      return;
    }
    bucket.evidence.push(item);
    bucket.score += item.points;
  }

  const writingById = new Map(movement.writingPurposes.map(h => [h.finiteVerbId, h]));
  const resetById = new Map(movement.discourseResets.map(h => [h.finiteVerbId, h]));

  for (const clause of ordered) {
    const bucket = bucketFor(clause);
    if (!bucket) continue;

    const purpose = writingById.get(clause.finiteVerbId);
    if (purpose) {
      bucket.hasWritingPurpose = true;
      if (looksLikeResolutionPurpose(purpose.trajectory)) bucket.hasResolutionPurpose = true;
      addEvidence(bucket, {
        kind: "writing-purpose",
        label: "Writing-purpose statement",
        detail: purpose.trajectory,
        points: WEIGHTS.writingPurpose
      });
    }

    const reset = resetById.get(clause.finiteVerbId);
    if (reset) {
      bucket.hasReset = true;
      addEvidence(bucket, {
        kind: "discourse-reset",
        label: "Possible discourse reset",
        detail: reset.label,
        points: WEIGHTS.discourseReset
      });
      if (reset.kind === "writing") {
        addEvidence(bucket, {
          kind: "writing-formula",
          label: "Writing formula",
          detail: reset.label,
          points: WEIGHTS.writingFormula
        });
      }
    }

    if (imperative.has(clause.finiteVerbId)) {
      bucket.hasImperative = true;
      addEvidence(bucket, {
        kind: "imperative",
        label: "Imperative",
        points: WEIGHTS.imperative
      });
    }

    if (looksLikeAssuranceSpan(clause.spanText)) {
      bucket.hasAssurance = true;
      addEvidence(bucket, {
        kind: "assurance",
        label: "Assurance (sabemos / conocemos…)",
        points: WEIGHTS.assurance
      });
    }

    // Student pressure on previous H3 → pressure into this clause’s verse
    const prevId = prevById.get(clause.finiteVerbId);
    if (prevId && pressureAfter.has(prevId)) {
      bucket.hasStudentPressure = true;
      addEvidence(bucket, {
        kind: "student-pressure",
        label: "You marked pressure into this verse",
        points: WEIGHTS.studentPressure
      });
    }
  }

  // Reasons — ground the root H3’s verse; also tag the reason’s verse when an H3 sits there
  for (const hit of reasonHits) {
    const snippet = hit.spanText.trim().slice(0, 80) || hit.reference;
    const rootClause = clauseById.get(hit.rootId);
    if (rootClause) {
      const rootBucket = bucketFor(rootClause);
      if (rootBucket) {
        rootBucket.hasReason = true;
        addEvidence(rootBucket, {
          kind: "reason",
          label: "Reason grounds this H3",
          detail: snippet,
          points: WEIGHTS.reason
        });
      }
    }

    const reasonVerse =
      verseKeyFromId(hit.finiteVerbId) ?? verseKeyFromReference(hit.reference);
    if (!reasonVerse) continue;
    if (rootClause) {
      const rootVerse =
        verseKeyFromId(rootClause.finiteVerbId) ?? verseKeyFromReference(rootClause.reference);
      if (rootVerse === reasonVerse) continue;
    }
    const h3InReasonVerse = ordered.find(c => {
      const key = verseKeyFromId(c.finiteVerbId) ?? verseKeyFromReference(c.reference);
      return key === reasonVerse;
    });
    if (!h3InReasonVerse) continue;
    const reasonBucket = bucketFor(h3InReasonVerse);
    if (!reasonBucket) continue;
    reasonBucket.hasReason = true;
    addEvidence(reasonBucket, {
      kind: "reason",
      label: "Reason clause",
      detail: snippet,
      points: WEIGHTS.reason
    });
  }

  // Formulas
  for (const hit of movement.formulas as FormulaHit[]) {
    const clause = ordered.find(c => c.finiteVerbId === hit.finiteVerbId);
    if (!clause) continue;
    const bucket = bucketFor(clause);
    if (!bucket) continue;
    if (hit.familyId === "les-escribo") {
      addEvidence(bucket, {
        kind: "writing-formula",
        label: hit.familyLabel,
        detail: hit.reference,
        points: WEIGHTS.writingFormula
      });
    } else if (hit.familyId === "sabemos") {
      bucket.hasAssurance = true;
      addEvidence(bucket, {
        kind: "assurance",
        label: hit.familyLabel,
        points: WEIGHTS.assurance
      });
    } else {
      addEvidence(bucket, {
        kind: "formula",
        label: hit.familyLabel,
        detail: `occurrence ${hit.occurrence + 1}`,
        points: WEIGHTS.formulaHit
      });
    }
  }

  // Vocab returns + convergence per clause, rolled to verse
  const vocabByClause = new Map<string, VocabFieldHit[]>();
  for (const hit of movement.vocabReturns as VocabFieldHit[]) {
    const list = vocabByClause.get(hit.finiteVerbId) ?? [];
    list.push(hit);
    vocabByClause.set(hit.finiteVerbId, list);
  }
  for (const clause of ordered) {
    const hits = vocabByClause.get(clause.finiteVerbId);
    if (!hits?.length) continue;
    const bucket = bucketFor(clause);
    if (!bucket) continue;
    const fields = new Set(hits.map(h => h.fieldId));
    if (hits.some(h => h.isReturn)) {
      bucket.hasVocabReturn = true;
      const returned = hits.filter(h => h.isReturn).map(h => h.fieldLabel);
      addEvidence(bucket, {
        kind: "vocab-return",
        label: "Vocabulary return",
        detail: returned.join(" · "),
        points: WEIGHTS.vocabReturn
      });
    }
    if (fields.size >= 2) {
      addEvidence(bucket, {
        kind: "vocab-convergence",
        label: "Vocabulary fields converge",
        detail: [...fields].map(id => hits.find(h => h.fieldId === id)?.fieldLabel ?? id).join(" · "),
        points: WEIGHTS.vocabConvergence
      });
    }
    if (contrastPairPresent(fields, clause.spanText)) {
      bucket.hasContrast = true;
      addEvidence(bucket, {
        kind: "contrast",
        label: "Contrast pair active",
        points: 2
      });
    }
  }

  // Repeated words — presence (dashboard) + returns (scored)
  for (const entry of movement.repeatedWords) {
    for (const verse of entry.verses) {
      const bucket = buckets.get(verse.verseKey);
      if (!bucket) continue;
      addEvidence(bucket, {
        kind: "repeated-word",
        label: entry.display,
        detail: `${entry.count}× in book · here ×${verse.count}`,
        points: 0
      });
      if (verse.isReturn) {
        bucket.hasRepeatedWordReturn = true;
        addEvidence(bucket, {
          kind: "repeated-word-return",
          label: `Returns: ${entry.display}`,
          detail: verse.reference,
          points: WEIGHTS.repeatedWordReturn
        });
      }
    }
  }

  // Student contrasts
  for (const hit of contrastHits) {
    const bucket = buckets.get(hit.verseKey);
    if (!bucket) continue;
    bucket.hasContrast = true;
    addEvidence(bucket, {
      kind: "student-contrast",
      label: `${hit.poleA.trim()} / ${hit.poleB.trim()}`,
      detail: hit.note?.trim() || undefined,
      points: WEIGHTS.studentContrast
    });
  }

  function phaseFor(bucket: VerseBucket): PressurePhase | null {
    if (bucket.score < 4) return null;
    if (bucket.hasResolutionPurpose || (bucket.hasAssurance && bucket.hasWritingPurpose)) {
      return "resolves";
    }
    if (bucket.hasAssurance && !bucket.hasReset && bucket.hasVocabReturn) {
      return "resolves";
    }
    if (
      bucket.hasVocabReturn ||
      bucket.hasRepeatedWordReturn ||
      bucket.hasStudentPressure ||
      bucket.hasReason
    ) {
      if (bucket.hasReset || bucket.hasWritingPurpose || bucket.hasContrast) return "opens";
      return "intensifies";
    }
    if (bucket.hasReset || bucket.hasWritingPurpose || bucket.hasContrast || bucket.hasImperative) {
      return "opens";
    }
    return null;
  }

  const maxScore = Math.max(0, ...[...buckets.values()].map(b => b.score));
  const verses: VerseConvergence[] = [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .map(bucket => {
      const bar =
        maxScore <= 0 ? 0 : Math.max(1, Math.round((bucket.score / maxScore) * 10));
      return {
        verseKey: bucket.verseKey,
        reference: bucket.reference,
        score: bucket.score,
        bar: bucket.score > 0 ? bar : 0,
        phase: phaseFor(bucket),
        evidence: bucket.evidence.sort((a, b) => b.points - a.points),
        anchorH3Id: bucket.anchorH3Id,
        previousH3Id: bucket.previousH3Id
      };
    });

  const hotspots = verses
    .filter(v => v.score >= hotspotMin)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const [ac, av] = a.verseKey.split(":").map(Number);
      const [bc, bv] = b.verseKey.split(":").map(Number);
      return ac! - bc! || av! - bv!;
    });

  return { verses, hotspots };
}
