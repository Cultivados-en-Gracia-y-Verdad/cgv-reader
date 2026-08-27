/**
 * NT H4 claim peel — when the prefix is real participle scaffolding
 * (ἐραυνῶντες…), the finite can stand as the claim and the prefix as `+`.
 * Do not peel 1B heads, doubled finites, or leftover 1–2 word stubs.
 */

export function isParticipleGreekMorph(morph: string | undefined): boolean {
  return Boolean(morph && morph.startsWith("V-") && morph.length > 5 && morph[5] === "P");
}

export function isFiniteGreekMorph(morph: string | undefined): boolean {
  return Boolean(morph && /^V-[123]/.test(morph));
}

export function prefixWordIsParticipleScaffold(input: {
  markedAsParticiple: boolean;
  greekMorph: string | undefined;
  wordHasOwnFinite: boolean;
}): boolean {
  if (input.wordHasOwnFinite) return false;
  if (input.markedAsParticiple) return true;
  return isParticipleGreekMorph(input.greekMorph);
}

export function prefixWordIsFiniteHost(input: {
  greekMorph: string | undefined;
  finiteVerbId: string | null | undefined;
  currentFiniteVerbId: string;
}): boolean {
  if (isFiniteGreekMorph(input.greekMorph)) return true;
  if (input.finiteVerbId && input.finiteVerbId !== input.currentFiniteVerbId) return true;
  return false;
}

export function claimWordKey(text: string): string {
  return text.replace(/^[¿¡]+|[.,;:!?«»“”]+$/g, "").trim().toLowerCase();
}

export function prefixRepeatsFiniteSurface(prefixTexts: string[], finiteText: string): boolean {
  const finite = claimWordKey(finiteText);
  if (!finite) return false;
  return prefixTexts.some(text => claimWordKey(text) === finite);
}

export function shouldPeelLeadingScaffolding(input: {
  isNominalHead: boolean;
  prefixWordCount: number;
  claimWordCount: number;
  prefixHasParticipleScaffold: boolean;
  prefixContainsFinite: boolean;
}): boolean {
  if (input.isNominalHead) return false;
  if (input.prefixContainsFinite) return false;
  if (input.prefixWordCount <= 0) return false;
  if (!input.prefixHasParticipleScaffold) return false;
  if (input.claimWordCount > 0 && input.claimWordCount < 3) return false;
  return true;
}
