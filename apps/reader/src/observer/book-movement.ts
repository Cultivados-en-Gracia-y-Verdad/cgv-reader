/**
 * Book movement — macro observations above H3 flow (see book-movement-spec.md).
 * Derived only; never auto-places an H2.
 */

import {
  buildRepeatedWords,
  repeatedWordReturns,
  type MovementVerseText,
  type RepeatedWordEntry,
  type RepeatedWordReturnHit
} from "./repeated-words";

export type { MovementVerseText, RepeatedWordEntry, RepeatedWordReturnHit };

export type BookMovementClause = {
  finiteVerbId: string;
  reference: string;
  spanText: string;
  /** Book order among independent roots (H3s). */
  order: number;
};

export type WritingPurposeHit = {
  finiteVerbId: string;
  reference: string;
  spanText: string;
  /** Short trajectory label, e.g. "escribo → no pequen". */
  trajectory: string;
};

export type DiscourseResetHit = {
  finiteVerbId: string;
  reference: string;
  spanText: string;
  kind: "vocative" | "writing" | "message" | "time" | "redirect";
  label: string;
};

export type FormulaFamilyId =
  | "el-que-dice"
  | "si-decimos"
  | "en-esto"
  | "todo-el-que"
  | "sabemos"
  | "les-escribo"
  | "permanece"
  | "el-que-ama"
  | "nacido-de-dios";

export type FormulaHit = {
  familyId: FormulaFamilyId;
  familyLabel: string;
  finiteVerbId: string;
  reference: string;
  spanText: string;
  /** Index within this family (0-based). */
  occurrence: number;
};

export type VocabFieldId = "light" | "family" | "abiding" | "truth" | "life" | "world" | "love";

export type VocabFieldHit = {
  fieldId: VocabFieldId;
  fieldLabel: string;
  finiteVerbId: string;
  reference: string;
  matched: string[];
  /** True when this field already appeared earlier, then was absent, then returns. */
  isReturn: boolean;
};

export type ConvergencePoint = {
  finiteVerbId: string;
  reference: string;
  signalKinds: string[];
  /** Distinct signal kind count (≥ 3 for candidate boundary). */
  strength: number;
};

export type CandidateBoundary = {
  /** Seam after this H3 (before the next). */
  afterH3Id: string;
  reference: string;
  signalKinds: string[];
  strength: number;
};

export type BookMovementReport = {
  writingPurposes: WritingPurposeHit[];
  discourseResets: DiscourseResetHit[];
  formulas: FormulaHit[];
  formulasByFamily: { familyId: FormulaFamilyId; familyLabel: string; hits: FormulaHit[] }[];
  /** Primary: LBF Spanish content-word frequency (≥3 in ≥2 verses). */
  repeatedWords: RepeatedWordEntry[];
  /** Verse-level returns from repeatedWords (for convergence scoring). */
  repeatedWordReturns: RepeatedWordReturnHit[];
  /** Secondary curated semantic families. */
  vocabReturns: VocabFieldHit[];
  vocabByField: { fieldId: VocabFieldId; fieldLabel: string; hits: VocabFieldHit[] }[];
  convergences: ConvergencePoint[];
  candidateBoundaries: CandidateBoundary[];
};

function fold(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function has(text: string, ...needles: string[]): boolean {
  const t = fold(text);
  return needles.some(n => t.includes(fold(n)));
}

function matchWords(text: string, words: string[]): string[] {
  const t = fold(text);
  const found: string[] = [];
  for (const w of words) {
    const f = fold(w);
    // Word-ish boundary: avoid matching inside longer tokens when possible.
    if (new RegExp(`(?:^|[^a-z])${f}(?:$|[^a-z])`).test(t) || t.includes(f)) {
      if (!found.includes(w)) found.push(w);
    }
  }
  return found;
}

const FORMULA_FAMILIES: {
  id: FormulaFamilyId;
  label: string;
  test: (span: string) => boolean;
}[] = [
  {
    id: "el-que-dice",
    label: "El que dice…",
    test: span => has(span, "el que dice", "el que diga")
  },
  {
    id: "si-decimos",
    label: "Si decimos…",
    test: span => has(span, "si decimos", "si dijéramos")
  },
  {
    id: "en-esto",
    label: "En esto…",
    test: span => has(span, "en esto", "en esta")
  },
  {
    id: "todo-el-que",
    label: "Todo el que…",
    test: span => has(span, "todo el que", "todo aquel que", "todos los que")
  },
  {
    id: "sabemos",
    label: "Sabemos / conocemos",
    test: span => has(span, "sabemos", "conocemos", "hemos conocido", "conozcamos", "sepa", "sepan")
  },
  {
    id: "les-escribo",
    label: "Les escribo / he escrito",
    test: span =>
      has(span, "les escribo", "les he escrito", "escribimos", "estas cosas les", "estas cosas escribo")
  },
  {
    id: "permanece",
    label: "Permanece",
    test: span => has(span, "permanece", "permanecer", "permanezca", "permanezcan", "permanecemos")
  },
  {
    id: "el-que-ama",
    label: "El que ama / aborrece",
    test: span => has(span, "el que ama", "el que aborrece", "quien ama", "quien aborrece")
  },
  {
    id: "nacido-de-dios",
    label: "Nacido de Dios",
    test: span => has(span, "nacido de dios", "nacidos de dios", "ha nacido de dios", "nace de dios")
  }
];

const VOCAB_FIELDS: {
  id: VocabFieldId;
  label: string;
  words: string[];
}[] = [
  {
    id: "light",
    label: "LIGHT",
    words: ["luz", "tinieblas", "andar", "andamos", "oscuridad", "ciego"]
  },
  {
    id: "family",
    label: "FAMILY",
    words: ["padre", "hijo", "hijos", "hermano", "hermanos", "hijitos", "ninatos", "niñitos", "nacido", "nacidos"]
  },
  {
    id: "abiding",
    label: "ABIDING",
    words: ["permanece", "permanecer", "guardar", "guarda", "mandamiento", "mandamientos", "palabra", "uncion", "unción"]
  },
  {
    id: "truth",
    label: "TRUTH",
    words: ["verdad", "mentira", "mentiroso", "enganar", "engañar", "enganados", "confesar", "testimonio", "testigo"]
  },
  {
    id: "life",
    label: "LIFE",
    words: ["vida", "muerte", "eterna", "manifestar", "manifestado", "manifestó", "aparecido"]
  },
  {
    id: "world",
    label: "WORLD",
    words: ["mundo", "mundanal"]
  },
  {
    id: "love",
    label: "LOVE",
    words: ["amor", "amar", "amemos", "ama", "amados", "aborrece", "odio", "odia"]
  }
];

function writingTrajectory(span: string): string | null {
  const t = fold(span);
  const writes =
    t.includes("anunciamos") ||
    t.includes("escribo") ||
    t.includes("escribimos") ||
    t.includes("escrito");
  if (!writes) return null;
  if (!t.includes("para que") && !t.includes("acerca de") && !t.includes("acerca")) {
    // Still a writing statement without purpose — keep if clear write verb + audience.
    if (t.includes("les escribo") || t.includes("les he escrito") || t.includes("estas cosas")) {
      const verb = t.includes("anunci")
        ? "anunciamos"
        : t.includes("he escrito") || t.includes("escrito")
          ? "he escrito"
          : t.includes("escribimos")
            ? "escribimos"
            : "escribo";
      return `${verb} → (sin para que)`;
    }
    return null;
  }
  const verb = t.includes("anunci")
    ? "anunciamos"
    : t.includes("he escrito") || (t.includes("escrito") && t.includes("he"))
      ? "he escrito"
      : t.includes("escribimos")
        ? "escribimos"
        : "escribo";
  let goal = "…";
  if (t.includes("comunion") || t.includes("comunión")) goal = "comunión";
  else if (t.includes("gozo")) goal = "gozo completo";
  else if (t.includes("pequen") || t.includes("pequen") || t.includes("pequen")) goal = "no pequen";
  else if (t.includes("pecado") && t.includes("para que no")) goal = "no pequen";
  else if (t.includes("engan") || t.includes("engañ")) goal = "engañadores";
  else if (t.includes("vida eterna") || (t.includes("vida") && t.includes("eterna"))) goal = "sepan que tienen vida eterna";
  else if (t.includes("sepan") || t.includes("sepais")) goal = "sepan…";
  else if (t.includes("acerca")) goal = "acerca de…";
  return `${verb} → ${goal}`;
}

function detectDiscourseReset(clause: BookMovementClause): DiscourseResetHit | null {
  const span = clause.spanText;
  const t = fold(span);
  if (has(span, "hijitos", "hijitos mios", "hijitos míos")) {
    return { ...baseReset(clause, "vocative"), label: "Hijitos…" };
  }
  if (has(span, "amados")) {
    return { ...baseReset(clause, "vocative"), label: "Amados…" };
  }
  if (has(span, "hermanos")) {
    return { ...baseReset(clause, "vocative"), label: "Hermanos…" };
  }
  if (has(span, "ninatos", "niñitos", "ninos", "niños")) {
    return { ...baseReset(clause, "vocative"), label: "Niñitos…" };
  }
  if (has(span, "este es el mensaje", "este es el mandamiento", "este es el anuncio")) {
    return { ...baseReset(clause, "message"), label: "Este es el mensaje…" };
  }
  if (has(span, "y ahora", "ahora pues")) {
    return { ...baseReset(clause, "redirect"), label: "Y ahora…" };
  }
  if (has(span, "ultima hora", "última hora")) {
    return { ...baseReset(clause, "time"), label: "Última hora" };
  }
  if (
    (t.includes("les escribo") || t.includes("les he escrito") || t.includes("estas cosas les")) &&
    (t.includes("estas cosas") || t.includes("acerca") || t.includes("para que"))
  ) {
    return { ...baseReset(clause, "writing"), label: "Escritura / propósito" };
  }
  if (has(span, "miren", "ved", "mirad") && has(span, "amor", "clase de amor")) {
    return { ...baseReset(clause, "redirect"), label: "Miren qué clase de amor…" };
  }
  if (has(span, "no crean") && has(span, "prueben", "probar")) {
    return { ...baseReset(clause, "redirect"), label: "No crean… prueben…" };
  }
  return null;
}

function baseReset(
  clause: BookMovementClause,
  kind: DiscourseResetHit["kind"]
): Omit<DiscourseResetHit, "label"> {
  return {
    finiteVerbId: clause.finiteVerbId,
    reference: clause.reference,
    spanText: clause.spanText,
    kind
  };
}

function signalsAtClause(
  clause: BookMovementClause,
  writingIds: Set<string>,
  resetIds: Set<string>,
  formulaFamiliesHere: Set<FormulaFamilyId>,
  vocabFieldsHere: Set<VocabFieldId>,
  prevFormulaDominant: FormulaFamilyId | null,
  prevVocabDominant: VocabFieldId | null
): string[] {
  const kinds: string[] = [];
  if (writingIds.has(clause.finiteVerbId)) kinds.push("writing-purpose");
  if (resetIds.has(clause.finiteVerbId)) kinds.push("discourse-reset");
  if (formulaFamiliesHere.size) kinds.push("formula");
  if (vocabFieldsHere.size >= 2) kinds.push("vocab-convergence");
  const formulaDom = [...formulaFamiliesHere][0] ?? null;
  if (formulaDom && prevFormulaDominant && formulaDom !== prevFormulaDominant) {
    kinds.push("formula-shift");
  }
  const vocabDom = [...vocabFieldsHere][0] ?? null;
  if (vocabDom && prevVocabDominant && vocabDom !== prevVocabDominant && vocabFieldsHere.size >= 2) {
    kinds.push("vocab-shift");
  }
  return kinds;
}

/**
 * Build the book-movement report from H3 (outline root) clauses in book order.
 * Pass `verses` for the repeated-words inventory (LBF Spanish verse texts).
 */
export function buildBookMovementReport(
  clauses: BookMovementClause[],
  options?: { verses?: MovementVerseText[] }
): BookMovementReport {
  const ordered = [...clauses].sort((a, b) => a.order - b.order);

  const writingPurposes: WritingPurposeHit[] = [];
  for (const clause of ordered) {
    const t = fold(clause.spanText);
    const isWrite =
      t.includes("escribo") ||
      t.includes("escribimos") ||
      t.includes("escrito") ||
      t.includes("anunciamos");
    if (!isWrite) continue;
    if (!(t.includes("para que") || t.includes("acerca"))) continue;
    const trajectory = writingTrajectory(clause.spanText);
    if (!trajectory || trajectory.endsWith("(sin para que)")) continue;
    writingPurposes.push({
      finiteVerbId: clause.finiteVerbId,
      reference: clause.reference,
      spanText: clause.spanText,
      trajectory
    });
  }

  const discourseResets: DiscourseResetHit[] = [];
  for (const clause of ordered) {
    const hit = detectDiscourseReset(clause);
    if (hit) discourseResets.push(hit);
  }

  const formulas: FormulaHit[] = [];
  const familyCounts = new Map<FormulaFamilyId, number>();
  for (const clause of ordered) {
    for (const family of FORMULA_FAMILIES) {
      if (!family.test(clause.spanText)) continue;
      const occurrence = familyCounts.get(family.id) ?? 0;
      familyCounts.set(family.id, occurrence + 1);
      formulas.push({
        familyId: family.id,
        familyLabel: family.label,
        finiteVerbId: clause.finiteVerbId,
        reference: clause.reference,
        spanText: clause.spanText,
        occurrence
      });
    }
  }
  const formulasByFamily = FORMULA_FAMILIES.map(family => ({
    familyId: family.id,
    familyLabel: family.label,
    hits: formulas.filter(h => h.familyId === family.id)
  })).filter(row => row.hits.length > 0);

  const vocabReturns: VocabFieldHit[] = [];
  for (const field of VOCAB_FIELDS) {
    let seen = false;
    let absentSince = false;
    for (const clause of ordered) {
      const matched = matchWords(clause.spanText, field.words);
      if (!matched.length) {
        if (seen) absentSince = true;
        continue;
      }
      const isReturn = seen && absentSince;
      vocabReturns.push({
        fieldId: field.id,
        fieldLabel: field.label,
        finiteVerbId: clause.finiteVerbId,
        reference: clause.reference,
        matched,
        isReturn
      });
      seen = true;
      absentSince = false;
    }
  }
  const vocabByField = VOCAB_FIELDS.map(field => ({
    fieldId: field.id,
    fieldLabel: field.label,
    hits: vocabReturns.filter(h => h.fieldId === field.id)
  })).filter(row => row.hits.length > 0);

  const writingIds = new Set(writingPurposes.map(h => h.finiteVerbId));
  const resetIds = new Set(discourseResets.map(h => h.finiteVerbId));
  const formulasByClause = new Map<string, Set<FormulaFamilyId>>();
  for (const hit of formulas) {
    const set = formulasByClause.get(hit.finiteVerbId) ?? new Set();
    set.add(hit.familyId);
    formulasByClause.set(hit.finiteVerbId, set);
  }
  const vocabByClause = new Map<string, Set<VocabFieldId>>();
  for (const hit of vocabReturns) {
    const set = vocabByClause.get(hit.finiteVerbId) ?? new Set();
    set.add(hit.fieldId);
    vocabByClause.set(hit.finiteVerbId, set);
  }

  const convergences: ConvergencePoint[] = [];
  let prevFormulaDom: FormulaFamilyId | null = null;
  let prevVocabDom: VocabFieldId | null = null;
  for (const clause of ordered) {
    const fHere = formulasByClause.get(clause.finiteVerbId) ?? new Set();
    const vHere = vocabByClause.get(clause.finiteVerbId) ?? new Set();
    const kinds = signalsAtClause(
      clause,
      writingIds,
      resetIds,
      fHere,
      vHere,
      prevFormulaDom,
      prevVocabDom
    );
    // Convergence: multiple fields or multiple signal kinds on one clause
    if (vHere.size >= 2 || kinds.length >= 2) {
      const signalKinds = [
        ...kinds,
        ...[...vHere].map(id => `field:${id}`),
        ...[...fHere].map(id => `formula:${id}`)
      ];
      convergences.push({
        finiteVerbId: clause.finiteVerbId,
        reference: clause.reference,
        signalKinds,
        strength: signalKinds.length
      });
    }
    if (fHere.size) prevFormulaDom = [...fHere][0]!;
    if (vHere.size) prevVocabDom = [...vHere][0]!;
  }

  // Candidate boundaries: seam after clause i when clause i+1 (or window) has ≥3 kind clusters
  const candidateBoundaries: CandidateBoundary[] = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const next = ordered[i + 1]!;
    const prev = ordered[i]!;
    const kinds = new Set<string>();
    if (resetIds.has(next.finiteVerbId)) kinds.add("discourse-reset");
    if (writingIds.has(next.finiteVerbId)) kinds.add("writing-purpose");
    const fNext = formulasByClause.get(next.finiteVerbId) ?? new Set();
    const fPrev = formulasByClause.get(prev.finiteVerbId) ?? new Set();
    const vNext = vocabByClause.get(next.finiteVerbId) ?? new Set();
    const vPrev = vocabByClause.get(prev.finiteVerbId) ?? new Set();
    if (fNext.size && fPrev.size) {
      const same = [...fNext].some(id => fPrev.has(id));
      if (!same) kinds.add("formula-shift");
    }
    if (fNext.size) kinds.add("formula");
    // Vocab: Jaccard-ish — if dominant fields change substantially
    const vPrevArr = [...vPrev];
    const vNextArr = [...vNext];
    if (vNextArr.length && vPrevArr.length) {
      const overlap = vNextArr.filter(id => vPrev.has(id)).length;
      if (overlap === 0 && vNextArr.length >= 1) kinds.add("vocab-shift");
    }
    if (vNext.size >= 2) kinds.add("vocab-convergence");
    // Also count reset on prev ending a stretch
    if (resetIds.has(prev.finiteVerbId) && writingIds.has(next.finiteVerbId)) {
      kinds.add("reset-then-write");
    }
    if (kinds.size >= 3) {
      candidateBoundaries.push({
        afterH3Id: prev.finiteVerbId,
        reference: `${prev.reference} → ${next.reference}`,
        signalKinds: [...kinds],
        strength: kinds.size
      });
    }
  }

  const repeatedWords = buildRepeatedWords(options?.verses ?? []);

  return {
    writingPurposes,
    discourseResets,
    formulas,
    formulasByFamily,
    repeatedWords,
    repeatedWordReturns: repeatedWordReturns(repeatedWords),
    vocabReturns,
    vocabByField,
    convergences: convergences.filter(c => c.strength >= 3).slice(0, 40),
    candidateBoundaries
  };
}
