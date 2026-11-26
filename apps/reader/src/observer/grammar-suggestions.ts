import type { ClausePredicateMode } from "./clause-data";

export type GreekPredicateVoice = "active" | "middle" | "passive";

export type PredicateModeSuggestion = {
  mode: Exclude<ClausePredicateMode, "impersonal" | "unsure">;
  evidence: "target-copular-surface";
  targetSurface: string;
  verbSurface: string;
};

export type SpanishGrammarWord = {
  id: string;
  text: string;
};

export type CopularRoleSuggestion = {
  verbWordIds: string[];
  predicateAttributeWordIds: string[];
  subjectImplicit: boolean;
};

/** A proposed span is confirmed only when that exact span was persisted. */
export function isStoredSpanConfirmation(
  storedWordIds: string[] | null | undefined,
  suggestedWordIds: string[]
): boolean {
  return Boolean(
    storedWordIds?.length &&
      storedWordIds.length === suggestedWordIds.length &&
      storedWordIds.every((id, index) => id === suggestedWordIds[index])
  );
}

const COPULAR_FORMS = new Set([
  // ser
  "soy", "eres", "es", "somos", "sois", "son",
  "era", "eras", "éramos", "erais", "eran",
  "fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron",
  "seré", "serás", "será", "seremos", "seréis", "serán",
  "sería", "serías", "seríamos", "seríais", "serían",
  "sé", "sea", "seas", "seamos", "seáis", "sean",
  "fuera", "fueras", "fuéramos", "fuerais", "fueran",
  "fuese", "fueses", "fuésemos", "fueseis", "fuesen",
  "fuere", "fueres", "fuéremos", "fuereis", "fueren",
  // estar
  "estoy", "estás", "está", "estamos", "estáis", "están",
  "estaba", "estabas", "estábamos", "estabais", "estaban",
  "estuve", "estuviste", "estuvo", "estuvimos", "estuvisteis", "estuvieron",
  "estaré", "estarás", "estará", "estaremos", "estaréis", "estarán",
  "estaría", "estarías", "estaríamos", "estaríais", "estarían",
  "esté", "estés", "estemos", "estéis", "estén", "estad",
  "estuviera", "estuvieras", "estuviéramos", "estuvierais", "estuvieran",
  "estuviese", "estuvieses", "estuviésemos", "estuvieseis", "estuviesen",
  "estuviere", "estuvieres", "estuviéremos", "estuviereis", "estuvieren"
]);

// These forms are also preterite/subjunctive forms of ir. Surface text alone
// cannot decide whether they are linking verbs, so they never generate a mode
// suggestion (they remain useful for locating the finite word in alignment).
const SER_IR_AMBIGUOUS_FORMS = new Set([
  "fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron",
  "fuera", "fueras", "fueramos", "fuerais", "fueran",
  "fuese", "fueses", "fuesemos", "fueseis", "fuesen",
  "fuere", "fueres", "fueremos", "fuereis", "fueren"
]);

const SPANISH_PREPOSITIONS = new Set([
  "a", "al", "ante", "bajo", "con", "contra", "de", "del", "desde", "durante",
  "en", "entre", "hacia", "hasta", "mediante", "para", "por", "segun", "sin",
  "sobre", "tras"
]);

const PERSON_MARKED_COPULAR_FORMS = new Set([
  "soy", "somos", "eres", "sois",
  "seas", "seamos", "seais",
  "estoy", "estamos", "estas", "estais",
  "estes", "estemos", "esteis"
]);

const EXPLICIT_PERSONAL_SUBJECTS = new Set([
  "yo", "tu", "usted", "el", "ella", "nosotros", "nosotras",
  "vosotros", "vosotras", "ustedes", "ellos", "ellas"
]);

export function normalizeSpanishGrammarWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function isSpanishCopularForm(value: string): boolean {
  const form = value
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}]/gu, "");
  return COPULAR_FORMS.has(form);
}

function targetWords(value: string | null | undefined): string[] {
  return value?.match(/[\p{L}\p{N}'’\-]+/gu) ?? [];
}

function looksLikeSpanishParticipleOrGerund(value: string): boolean {
  const word = normalizeSpanishGrammarWord(value);
  return /(ado|ada|ados|adas|ido|ida|idos|idas|ando|iendo|yendo|to|ta|tos|tas|so|sa|sos|sas|cho|cha|chos|chas)$/.test(
    word
  );
}

/**
 * Return only a high-confidence, two-word linking unit such as “seas
 * arrogante”. Longer phrases, ser/ir ambiguity, prepositional predicates and
 * passive/progressive-looking complements are deliberately left to the user.
 */
function safeCopularTarget(
  targetSurface: string | null | undefined
): { words: string[]; verbOffset: 0 } | null {
  const words = targetWords(targetSurface);
  if (words.length !== 2 || !isSpanishCopularForm(words[0] ?? "")) return null;
  const normalizedVerb = normalizeSpanishGrammarWord(words[0] ?? "");
  const normalizedComplement = normalizeSpanishGrammarWord(words[1] ?? "");
  if (
    SER_IR_AMBIGUOUS_FORMS.has(normalizedVerb) ||
    SPANISH_PREPOSITIONS.has(normalizedComplement) ||
    looksLikeSpanishParticipleOrGerund(words[1] ?? "")
  ) {
    return null;
  }
  return { words, verbOffset: 0 };
}

/**
 * Suggest how the published LPF predicate works from the LPF surface itself.
 * Greek voice is intentionally excluded: it is source evidence, not an answer
 * to a Spanish grammatical question.
 */
export function suggestSpanishPredicateMode(
  targetSurface: string | null | undefined
): PredicateModeSuggestion | null {
  const safeTarget = safeCopularTarget(targetSurface);
  if (!safeTarget) return null;
  return {
    mode: "copular",
    evidence: "target-copular-surface",
    targetSurface: targetSurface?.trim() ?? "",
    verbSurface: safeTarget.words[safeTarget.verbOffset] ?? ""
  };
}

/** Match a copular LPF alignment unit back to the learner-visible clause words. */
export function suggestCopularRoles(
  targetSurface: string | null | undefined,
  clauseWords: SpanishGrammarWord[]
): CopularRoleSuggestion | null {
  const safeTarget = safeCopularTarget(targetSurface);
  if (!safeTarget) return null;
  const target = safeTarget.words;
  const verbOffset = safeTarget.verbOffset;
  const wanted = target.map(normalizeSpanishGrammarWord);
  const available = clauseWords.map(word => normalizeSpanishGrammarWord(word.text));
  const starts: number[] = [];
  for (let start = 0; start <= available.length - wanted.length; start += 1) {
    if (wanted.every((word, offset) => available[start + offset] === word)) starts.push(start);
  }
  if (starts.length !== 1) return null;
  const start = starts[0]!;
  const verbWord = clauseWords[start + verbOffset];
  const attributes = clauseWords.slice(start + verbOffset + 1, start + wanted.length);
  if (!verbWord || !attributes.length) return null;

  const normalizedVerb = normalizeSpanishGrammarWord(verbWord.text);
  const hasExplicitPersonalSubject = clauseWords.some(word =>
    EXPLICIT_PERSONAL_SUBJECTS.has(normalizeSpanishGrammarWord(word.text))
  );
  return {
    verbWordIds: [verbWord.id],
    predicateAttributeWordIds: attributes.map(word => word.id),
    subjectImplicit:
      PERSON_MARKED_COPULAR_FORMS.has(normalizedVerb) && !hasExplicitPersonalSubject
  };
}

/** Published Greek voice, retained as evidence but never promoted to Spanish mode. */
export function readGreekPredicateVoice(
  greekMorph: string | null | undefined
): GreekPredicateVoice | null {
  const morph = greekMorph?.trim() ?? "";
  // Both supported tag forms end the first non-empty verb segment with voice+mood:
  // MorphGNT V-1PAI-S--; Reader interlinear V-PAI-1S.
  const finiteCode = morph.match(/^V-([^-]+)-/)?.[1] ?? "";
  const mood = finiteCode.charAt(finiteCode.length - 1);
  const voice = finiteCode.charAt(finiteCode.length - 2);
  // MorphGNT uses D for imperative (V-2PAD-S--); Robinson-style Reader
  // tags use M (V-PAM-2S). Both are finite and both occur in published data.
  if (!mood || !"ISODM".includes(mood)) return null;
  if (voice === "A") return "active";
  if (voice === "M") return "middle";
  if (voice === "P") return "passive";
  return null;
}
