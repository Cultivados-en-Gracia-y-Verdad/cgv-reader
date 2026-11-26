import type { ClausePredicateMode } from "./clause-data";

export type PredicateModeSuggestion = {
  mode: Exclude<ClausePredicateMode, "impersonal" | "unsure">;
  evidence: "copular-lemma" | "greek-voice";
  greekVoice?: "active" | "middle" | "passive";
};

/**
 * Mechanical proposal from the finite verb's published Greek morphology.
 *
 * This is deliberately only a suggestion: Greek voice does not settle every
 * question about how a predicate functions in Spanish, and morphology alone
 * cannot establish an impersonal construction. The caller must keep this
 * separate from learner-confirmed progress.
 */
export function suggestPredicateMode(
  greekLemma: string | null | undefined,
  greekMorph: string | null | undefined
): PredicateModeSuggestion | null {
  const lemma = greekLemma?.trim();
  const morph = greekMorph?.trim() ?? "";

  // εἰμί is the high-confidence linking verb. Context-sensitive verbs such as
  // γίνομαι are intentionally not treated as copular by morphology alone.
  if (lemma === "εἰμί") {
    return { mode: "copular", evidence: "copular-lemma" };
  }

  // Both published NT tag forms put voice and mood at the end of the first
  // non-empty verb segment:
  //   MorphGNT token spine: V-1PAI-S--
  //   Reader interlinear:  V-PAI-1S
  // Non-finite forms such as V--PAN---- have an empty first segment and are
  // deliberately excluded from this finite-predicate proposal.
  const finiteCode = morph.match(/^V-([^-]+)-/)?.[1] ?? "";
  const mood = finiteCode.charAt(finiteCode.length - 1);
  const voice = finiteCode.charAt(finiteCode.length - 2);
  if (!mood || !"ISOM".includes(mood)) return null;
  if (voice === "A") {
    return { mode: "active", evidence: "greek-voice", greekVoice: "active" };
  }
  if (voice === "M") {
    return { mode: "middle-reflexive", evidence: "greek-voice", greekVoice: "middle" };
  }
  if (voice === "P") {
    return { mode: "passive", evidence: "greek-voice", greekVoice: "passive" };
  }
  return null;
}
