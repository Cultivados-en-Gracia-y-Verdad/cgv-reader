import type { ClauseBeginningToken } from "./clause-data";

export type FrameType = "time" | "reason" | "condition" | "purpose";

export interface ClauseSignalInput {
  finiteVerbId: string;
  chapter: number;
  verse: number;
  finiteVerbLemma?: string;
  beginningTokens: ClauseBeginningToken[];
}

export type ClauseSignal =
  | { kind: "confident"; choice: "describes"; reason: string }
  | { kind: "confident"; choice: "content"; target: string; reason: string }
  | { kind: "confident"; choice: "frame"; frameType: FrameType; target: string; reason: string }
  | { kind: "uncertain"; reason: string }
  | { kind: "none"; reason: string };

// Robinson's/MorphGNT-style tag for relative pronouns. Verified directly against
// Titus 1:2 token 5 ("ἣν" / "la cual" — the clause the Q1 correction in the spec
// was written for): morph "RR----ASF-", lemma "ὅς".
const RELATIVE_PRONOUN_PREFIX = "RR";

// Case/number/gender occupy the same three characters regardless of part of
// speech in this morph format — "RR----ASF-" (relative pronoun) and
// "N-----ASF-" (noun) both carry "ASF" at index 6. Used to detect the
// "relative of connection" idiom (BDF §458; e.g. Titus 1:13's δι' ἣν αἰτίαν,
// "for which cause" = "therefore"): when a relative pronoun's own antecedent
// is the very next noun in its OWN clause — not an external noun elsewhere —
// the whole phrase functions as a connective, not a bound relative clause
// describing something nearby.
function agreementKey(morph: string): string {
  return morph.slice(6, 9);
}

function findEmbeddedAntecedent(
  tokens: ClauseBeginningToken[],
  relative: ClauseBeginningToken
): ClauseBeginningToken | undefined {
  const relativeIndex = tokens.indexOf(relative);
  if (relativeIndex < 0) return undefined;
  return tokens
    .slice(relativeIndex + 1)
    .find(token => token.morph.startsWith("N") && agreementKey(token.morph) === agreementKey(relative.morph));
}

/**
 * Checks a clause's own leading window for the "relative of connection" idiom
 * (see agreementKey above) — exported so callers outside detectClauseSignal/
 * detectClauseMarker (e.g. a workspace audit) can flag a clause already
 * classified as "describes" whose relative pronoun's antecedent turns out to
 * be inside its own clause, not an external noun.
 */
export function detectRelativeOfConnection(
  beginningTokens: ClauseBeginningToken[]
): { relative: ClauseBeginningToken; antecedent: ClauseBeginningToken } | null {
  const relative = findLeadingToken(beginningTokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX));
  if (!relative) return null;
  const antecedent = findEmbeddedAntecedent(beginningTokens, relative);
  return antecedent ? { relative, antecedent } : null;
}

// Straight from the spec's particle table — Greek lemma to frame type, the same
// lookup already used to auto-derive frameType once Q3 is "yes."
export const FRAME_PARTICLES: Record<string, FrameType> = {
  "ἵνα": "purpose",
  "ὅπως": "purpose",
  "γάρ": "reason",
  "διότι": "reason",
  "εἰ": "condition",
  "ἐάν": "condition",
  "ὅτε": "time",
  "ὡς": "time",
  "ἐπεί": "time"
};

// ὅτι genuinely introduces both content clauses ("that") and reason clauses
// ("because") in Greek, and nothing about the word itself disambiguates — it
// depends on the governing verb, which is exactly what this question is
// supposed to help a student discover. The spec is explicit: do not silently
// resolve this in code. Surface it as a real judgment call instead.
export const AMBIGUOUS_PARTICLES: Record<string, string> = {
  "ὅτι":
    "can introduce either the content of what was said/thought (“that…”) or the reason for it (“because…”), and the word alone never settles which"
};

// Verbs of saying, thinking, wanting, teaching, or reminding — genuinely present
// in Titus (λέγω, λαλέω, διδάσκω, πιστεύω, βούλομαι, ὁμολογέω, παρακαλέω,
// ἐπαγγέλλομαι, ὑπομιμνῄσκω, οἶδα all occur in the book). Used to rank which
// nearby clause is the likelier parent for a content clause, not to declare a
// yes/no on its own — Greek content clauses are marked by ὅτι, which is
// deliberately ambiguous above, so this list only strengthens candidate
// selection once the student (or the ὅτι flag) has already decided "yes."
export const CONTENT_VERB_LEMMAS = new Set([
  "λέγω",
  "λαλέω",
  "διδάσκω",
  "πιστεύω",
  "βούλομαι",
  "θέλω",
  "ὁμολογέω",
  "παρακαλέω",
  "ἐπαγγέλλομαι",
  "ὑπομιμνῄσκω",
  "οἶδα",
  "ἀρνέομαι"
]);

function stripAccentless(lemma: string): string {
  return lemma.trim();
}

// See coordinate-inheritance-spec.md. A clause opening with one of these and
// nothing else (no relative pronoun, no frame particle, no ambiguous
// particle — checked separately via detectClauseSignal returning "none") is
// riding alongside whatever the previous clause already is, not making an
// independent grammatical claim of its own.
export const PLAIN_COORDINATORS = new Set(["καί", "δέ", "ἤ"]);

function clauseOrderKey(clause: ClauseSignalInput): number {
  return clause.chapter * 1000 + clause.verse;
}

function nearestPrecedingClauseId(
  clause: ClauseSignalInput,
  allClauses: ClauseSignalInput[]
): string | null {
  const ordered = [...allClauses].sort((a, b) => clauseOrderKey(a) - clauseOrderKey(b));
  const index = ordered.findIndex(c => c.finiteVerbId === clause.finiteVerbId);
  if (index <= 0) return null;
  return ordered[index - 1].finiteVerbId;
}

// The Greek clause-boundary heuristic sometimes leaves a stray word or two from
// the *previous* clause's own trailing material (e.g. an object pronoun) at the
// front of this one's token range — a preposition-phrase complement that never
// got its own boundary marker. Particles and relative pronouns are themselves
// always clause-initial in Greek, so scanning a short window rather than
// requiring position 0 tolerates that leak without reaching into a different,
// deeper clause.
const LEADING_WINDOW = 4;

function findLeadingToken(
  tokens: ClauseBeginningToken[],
  predicate: (token: ClauseBeginningToken) => boolean
): ClauseBeginningToken | undefined {
  return tokens.slice(0, LEADING_WINDOW).find(predicate);
}

/**
 * Detects a Greek-grounded proposal for what a clause is doing, mirroring the
 * spec's three questions. The evidence is always the Greek morphology/lemma of
 * the clause's opening token(s) — never the Spanish surface text — so a
 * "proposal" is objective rather than a guess dressed up as one. Display stays
 * Spanish; only the reasoning cites the Greek.
 */
export function detectClauseSignal(
  clause: ClauseSignalInput,
  allClauses: ClauseSignalInput[]
): ClauseSignal {
  const relative = findLeadingToken(clause.beginningTokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX));
  if (relative) {
    const connection = detectRelativeOfConnection(clause.beginningTokens);
    if (connection) {
      return {
        kind: "uncertain",
        reason:
          `Opens with “${connection.relative.greek}” (${connection.relative.lemma}), but the noun it agrees with, ` +
          `“${connection.antecedent.greek}” (${connection.antecedent.lemma}), sits right here inside this same clause ` +
          `rather than out in a previous one — a “relative of connection” idiom (e.g. δι' ἣν αἰτίαν, “for which cause” = ` +
          `“therefore”), not a relative clause describing some other nearby noun. What this clause actually is (root? ` +
          `reason? something else riding on the connective sense) is a genuine judgment call, not something to guess at.`
      };
    }
    return {
      kind: "confident",
      choice: "describes",
      reason:
        `Opens with “${relative.greek}” (${relative.lemma}) — that's a relative pronoun, and a clause that ` +
        `opens with one is what makes it a relative clause. It should be describing a noun nearby; select it in the text below.`
    };
  }

  const frameToken = findLeadingToken(clause.beginningTokens, token => Boolean(FRAME_PARTICLES[stripAccentless(token.lemma)]));
  if (frameToken) {
    const frameLemma = stripAccentless(frameToken.lemma);
    const frameType = FRAME_PARTICLES[frameLemma];
    const target = nearestPrecedingClauseId(clause, allClauses);
    if (target) {
      return {
        kind: "confident",
        choice: "frame",
        frameType,
        target,
        reason:
          `Opens with “${frameToken.greek}” (${frameLemma}) — that maps straight to a ${frameType} clause, ` +
          `the same particle table a Greek grammar would use (ἵνα/ὅπως → purpose, γάρ/διότι → reason, and so on).`
      };
    }
  }

  const ambiguousToken = findLeadingToken(clause.beginningTokens, token => Boolean(AMBIGUOUS_PARTICLES[stripAccentless(token.lemma)]));
  if (ambiguousToken) {
    const ambiguousLemma = stripAccentless(ambiguousToken.lemma);
    return {
      kind: "uncertain",
      reason:
        `Opens with “${ambiguousToken.greek}” (${ambiguousLemma}) — ${AMBIGUOUS_PARTICLES[ambiguousLemma]}. ` +
        `That's a genuine judgment call, not something to guess at; it turns on which verb governs it, ` +
        `which is exactly what this question is asking you to work out.`
    };
  }

  return {
    kind: "none",
    reason:
      "No relative pronoun, no connecting particle at the front — none of the usual opening markers are here. " +
      "That absence is itself informative: clauses like this are usually independent, standing on their own."
  };
}

/**
 * Detects a bare coordinator (καί/δέ/ἤ) opening a clause — see
 * coordinate-inheritance-spec.md. Detection alone doesn't decide inheritance:
 * a clause with a relative pronoun, frame particle, or ambiguous particle
 * elsewhere in the same leading window (i.e. detectClauseSignal doesn't come
 * back "none") is making its own claim and must not inherit, even if a
 * coordinator also appears — callers should check both.
 */
export function detectLeadingCoordinator(beginningTokens: ClauseBeginningToken[]): string | null {
  const token = findLeadingToken(beginningTokens, candidate => PLAIN_COORDINATORS.has(stripAccentless(candidate.lemma)));
  return token ? stripAccentless(token.lemma) : null;
}

/**
 * Frame particle in the clause's own leading window, for manual classification
 * (picking a parent directly) rather than detectClauseSignal's full proposal
 * chain. Same tolerant window as everywhere else in this file — γάρ/δέ/οὖν are
 * postpositive, so checking only beginningTokens[0] would miss most of them.
 * Returns undefined, never a guessed default, when no recognized particle is
 * present — callers must not substitute a fallback type for "not yet known."
 */
export function detectLeadingFrameType(beginningTokens: ClauseBeginningToken[]): FrameType | undefined {
  const frameToken = findLeadingToken(beginningTokens, token => Boolean(FRAME_PARTICLES[stripAccentless(token.lemma)]));
  return frameToken ? FRAME_PARTICLES[stripAccentless(frameToken.lemma)] : undefined;
}

/**
 * Ranks candidate parent clauses for a content relation: clauses whose own
 * finite verb is a said/thought/wanted verb are the likelier parent, based on
 * the Greek lemma — not a guess, but not a forced answer either.
 */
export function isLikelyContentParent(candidate: { finiteVerbLemma?: string }): boolean {
  return Boolean(candidate.finiteVerbLemma && CONTENT_VERB_LEMMAS.has(stripAccentless(candidate.finiteVerbLemma)));
}

// --- Ranked choice guidance (suggestion, not decision) ---
//
// When detectClauseSignal can't (or shouldn't) auto-accept a shape, the four
// choice cards still need this-clause evidence: what leans which way, and why
// the others are less likely. Suggested ≠ locked — the student always picks.

export type ClauseChoiceKind = "describes" | "content" | "frame" | "root";

export type ClauseChoiceLean = "suggested" | "available";

export interface ClauseChoiceOption {
  kind: ClauseChoiceKind;
  term: string;
  blurb: string;
  evidence: string;
  lean: ClauseChoiceLean;
}

export interface ClauseChoiceGuidance {
  /** Short paragraph above the grid: positive evidence + what that usually means. */
  summary: string;
  suggested: ClauseChoiceKind | null;
  options: ClauseChoiceOption[];
}

function nounCaseLetter(morph: string): string | null {
  if (!morph.startsWith("N")) return null;
  // Robinson-style short tags: N-ASF / N-GSM
  if (/^N-[A-Z]/.test(morph)) return morph.charAt(2);
  // MorphGNT-style: N-----ASF-
  if (morph.length > 6) return morph.charAt(6);
  return null;
}

/**
 * εἰς + nearby accusative noun = purpose/goal *phrase*, not an ἵνα-purpose
 * clause. Surfaced under the adverbial card so Spanish "para…" / Greek εἰς
 * doesn't pull students into "purpose clause" by habit.
 */
function detectEisGoalPhrase(
  tokens: ClauseBeginningToken[]
): { eis: ClauseBeginningToken; noun: ClauseBeginningToken } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (stripAccentless(tokens[i].lemma) !== "εἰς") continue;
    const noun = tokens.slice(i + 1, i + 4).find(token => nounCaseLetter(token.morph) === "A");
    if (noun) return { eis: tokens[i], noun };
  }
  return null;
}

function choiceKindFromConfident(signal: Extract<ClauseSignal, { kind: "confident" }>): ClauseChoiceKind {
  if (signal.choice === "describes") return "describes";
  if (signal.choice === "content") return "content";
  return "frame";
}

/**
 * Builds ranked, this-clause hints for the four shape cards. Does not decide
 * the classification — only marks a lean when the Greek signal supports one
 * (`none` → independent; `confident` → that shape; `uncertain` → no badge).
 */
export function buildClauseChoiceGuidance(
  clause: ClauseSignalInput,
  signal: ClauseSignal,
  allClauses: ClauseSignalInput[]
): ClauseChoiceGuidance {
  const tokens = clause.beginningTokens;
  const relative = findLeadingToken(tokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX));
  const frameToken = findLeadingToken(tokens, token => Boolean(FRAME_PARTICLES[stripAccentless(token.lemma)]));
  const ambiguousToken = findLeadingToken(tokens, token => Boolean(AMBIGUOUS_PARTICLES[stripAccentless(token.lemma)]));
  const otiToken = findLeadingToken(tokens, token => stripAccentless(token.lemma) === "ὅτι");
  const eisPhrase = detectEisGoalPhrase(tokens);
  const openSurface = tokens
    .slice(0, 3)
    .map(token => token.greek)
    .filter(Boolean)
    .join(" ");

  const prevId = nearestPrecedingClauseId(clause, allClauses);
  const prev = prevId ? allClauses.find(candidate => candidate.finiteVerbId === prevId) : undefined;
  const prevIsContentVerb = Boolean(prev && isLikelyContentParent(prev));

  let suggested: ClauseChoiceKind | null = null;
  if (signal.kind === "confident") suggested = choiceKindFromConfident(signal);
  else if (signal.kind === "none") suggested = "root";

  let summary: string;
  if (signal.kind === "none") {
    const parts: string[] = [];
    if (clause.finiteVerbLemma) parts.push(`Finite verb: ${clause.finiteVerbLemma}.`);
    if (openSurface) parts.push(`Opens with “${openSurface}”.`);
    parts.push(
      "No relative pronoun and no subordinating particle in the opening window — that usually means an independent clause. You still decide."
    );
    summary = parts.join(" ");
  } else {
    summary = signal.reason;
  }

  const describesEvidence = relative
    ? `Opens with “${relative.greek}” (${relative.lemma}) — a relative pronoun.`
    : "No relative pronoun (ὅς / ἥ / ὅ…) in the opening window.";

  let contentEvidence: string;
  if (otiToken || (ambiguousToken && stripAccentless(ambiguousToken.lemma) === "ὅτι")) {
    const token = otiToken ?? ambiguousToken!;
    contentEvidence =
      `Opens with “${token.greek}” (ὅτι) — can mark content (“that…”); also used for reason (“because…”).`;
  } else if (prevIsContentVerb) {
    contentEvidence =
      "No ὅτι up front; a nearby saying/thinking verb makes content possible only if something else marks it.";
  } else {
    contentEvidence = "No ὅτι up front, and no nearby saying/thinking verb standing out.";
  }

  let frameEvidence: string;
  if (frameToken) {
    const frameLemma = stripAccentless(frameToken.lemma);
    const frameType = FRAME_PARTICLES[frameLemma];
    frameEvidence = `Opens with “${frameToken.greek}” (${frameLemma}) → ${frameType}.`;
  } else if (ambiguousToken && stripAccentless(ambiguousToken.lemma) === "ὅτι") {
    frameEvidence = `“${ambiguousToken.greek}” can mean “because…” (reason) — only if it isn’t content.`;
  } else if (eisPhrase) {
    frameEvidence =
      `No ἵνα / ὅπως / γάρ / εἰ… opener. Note: “${eisPhrase.eis.greek}” + “${eisPhrase.noun.greek}” is a purpose/goal ` +
      `phrase (εἰς + noun), not a purpose clause (those need ἵνα / ὅπως + a verb).`;
  } else {
    frameEvidence = "No ἵνα / ὅπως / γάρ / εἰ / ὅτε… in the opening window.";
  }

  const hasSubordinatingOpener = Boolean(relative || frameToken || otiToken || ambiguousToken);
  const rootEvidence =
    suggested === "root"
      ? "Suggested: nothing in the opening window subordinates this clause."
      : hasSubordinatingOpener
        ? "Less likely while a subordinating opener is present — unless that word is only a discourse connective."
        : "Default when subordinating openers are absent.";

  const options: ClauseChoiceOption[] = [
    {
      kind: "describes",
      term: "Relative clause",
      blurb: "Describes something nearby",
      evidence: describesEvidence,
      lean: suggested === "describes" ? "suggested" : "available"
    },
    {
      kind: "content",
      term: "Content clause",
      blurb: "Reports what was said or thought",
      evidence: contentEvidence,
      lean: suggested === "content" ? "suggested" : "available"
    },
    {
      kind: "frame",
      term: "Adverbial clause",
      blurb: "Gives a when, why, if, or so-that",
      evidence: frameEvidence,
      lean: suggested === "frame" ? "suggested" : "available"
    },
    {
      kind: "root",
      term: "Independent clause",
      blurb: "Stands on its own",
      evidence: rootEvidence,
      lean: suggested === "root" ? "suggested" : "available"
    }
  ];

  return { summary, suggested, options };
}

// --- Grammatical-marker anchor lines (cgv-product-suite-spec.md,
// "Auto-suggested anchor points"; format in manual-markdown-format-spec.md) ---
//
// Mechanical surfacing only, reusing markers already detected for frame-type
// classification above — nothing new is interpreted. Two genuinely different
// kinds of word:
//   - "relational" (conector relacional): links two independent, complete
//     thoughts — always this type when it opens a ROOT clause, regardless of
//     which particle it is (even γάρ, normally a "reason" frame-particle,
//     is a discourse connective when the clause it opens stands on its own —
//     see the manual-markdown-format-spec.md worked example, "Porque de tal
//     manera te dejé en Creta").
//   - "subordinating" (marcador subordinante): creates actual grammatical
//     dependency — only possible on a clause already resolved as dependent
//     (describes/content/frame); the subtype comes from that resolution,
//     not re-detected here.
export type ClauseMarkerType = "relational" | "subordinating";

export interface ClauseMarker {
  word: string;
  lemma: string;
  type: ClauseMarkerType;
  subtype: string;
}

// Purely coordinating words — never themselves create subordination, so a
// clause opening with one of these is "relational" regardless of whether
// it's a root or (per coordinate-inheritance-spec.md) a coordinate-inherited
// dependent riding on one.
const RELATIONAL_CONNECTIVE_SUBTYPES: Record<string, string> = {
  "καί": "adición",
  "δέ": "contraste",
  "ἀλλά": "contraste",
  "οὖν": "inferencia"
};

const FRAME_TYPE_SUBTYPE_ES: Record<FrameType, string> = {
  purpose: "propósito",
  reason: "razón/fundamento",
  condition: "condición",
  time: "tiempo"
};

export type LeadingMarker =
  | { kind: "relative"; token: ClauseBeginningToken }
  | { kind: "frame"; token: ClauseBeginningToken; frameType: FrameType }
  | { kind: "content"; token: ClauseBeginningToken }
  | { kind: "coordinator"; token: ClauseBeginningToken; lemma: string }
  | { kind: "none" };

// Same priority order detectClauseSignal already checks, but returns the
// actual matched token (not just a formatted label) — needed by callers like
// Compiler's markdown generator that quote the token's own Spanish alignment
// (`.ble`) rather than a pre-built English/Spanish sentence fragment.
export function findLeadingMarkerToken(beginningTokens: ClauseBeginningToken[]): LeadingMarker {
  const relative = findLeadingToken(beginningTokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX));
  if (relative) return { kind: "relative", token: relative };

  const frameToken = findLeadingToken(beginningTokens, token => Boolean(FRAME_PARTICLES[stripAccentless(token.lemma)]));
  if (frameToken) return { kind: "frame", token: frameToken, frameType: FRAME_PARTICLES[stripAccentless(frameToken.lemma)] };

  const contentToken = findLeadingToken(beginningTokens, token => stripAccentless(token.lemma) === "ὅτι");
  if (contentToken) return { kind: "content", token: contentToken };

  const coordToken = findLeadingToken(beginningTokens, token => PLAIN_COORDINATORS.has(stripAccentless(token.lemma)));
  if (coordToken) return { kind: "coordinator", token: coordToken, lemma: stripAccentless(coordToken.lemma) };

  return { kind: "none" };
}

/**
 * The clause's own opening word, if it's a recognized marker — type and
 * subtype derived from the SAME relation/frameType Q1/Q2/Q3 already
 * resolved (or "root" for an independent clause), never re-guessed here.
 * Returns null when the clause simply doesn't open with one of these
 * (most clauses; per detectClauseSignal, that's itself informative, not
 * an error) — no marker line renders for those.
 */
export function detectClauseMarker(
  beginningTokens: ClauseBeginningToken[],
  relation: "root" | "describes" | "content" | "frame" | null,
  frameType?: FrameType
): ClauseMarker | null {
  // Same tolerant leading-window search detectClauseSignal already uses for
  // relative pronouns/frame particles above — genuinely required here too,
  // not just for consistency: γάρ/δέ/οὖν are postpositive in Greek (they
  // never stand as literally the first word of a clause, typically landing
  // second, often right after the clause's own verb), so checking only
  // beginningTokens[0] would silently miss almost every relational connector.
  const relative = findLeadingToken(beginningTokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX));
  if (relative && !findEmbeddedAntecedent(beginningTokens, relative)) {
    return { word: relative.greek, lemma: stripAccentless(relative.lemma), type: "subordinating", subtype: "descripción" };
  }

  const connectiveToken = findLeadingToken(beginningTokens, token => Boolean(RELATIONAL_CONNECTIVE_SUBTYPES[stripAccentless(token.lemma)]));
  const frameToken = findLeadingToken(beginningTokens, token => Boolean(FRAME_PARTICLES[stripAccentless(token.lemma)]));

  if (relation === "root") {
    if (connectiveToken) {
      const lemma = stripAccentless(connectiveToken.lemma);
      return { word: connectiveToken.greek, lemma, type: "relational", subtype: RELATIONAL_CONNECTIVE_SUBTYPES[lemma] };
    }
    if (frameToken) {
      const lemma = stripAccentless(frameToken.lemma);
      return { word: frameToken.greek, lemma, type: "relational", subtype: FRAME_TYPE_SUBTYPE_ES[FRAME_PARTICLES[lemma]] };
    }
    return null;
  }

  if (relation === "frame" && frameType && frameToken) {
    return { word: frameToken.greek, lemma: stripAccentless(frameToken.lemma), type: "subordinating", subtype: FRAME_TYPE_SUBTYPE_ES[frameType] };
  }
  if (relation === "content") {
    const contentToken = findLeadingToken(beginningTokens, token => stripAccentless(token.lemma) === stripAccentless("ὅτι"));
    if (contentToken) {
      return { word: contentToken.greek, lemma: stripAccentless(contentToken.lemma), type: "subordinating", subtype: "contenido" };
    }
  }
  if (connectiveToken) {
    const lemma = stripAccentless(connectiveToken.lemma);
    return { word: connectiveToken.greek, lemma, type: "relational", subtype: RELATIONAL_CONNECTIVE_SUBTYPES[lemma] };
  }

  return null;
}
