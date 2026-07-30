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

// Verbs of saying, thinking, knowing, perceiving, teaching, or reminding.
// Used to (1) rank likelier parents for a content clause and (2) soft-lean
// ὅτι toward content vs reason when such a verb sits in the leading window
// or immediately preceding clause — never to auto-decide; ὅτι stays a
// judgment call (see AMBIGUOUS_PARTICLES).
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
  "ἀρνέομαι",
  "ἀποκαλύπτω",
  "γινώσκω",
  "ἐπιγινώσκω",
  "ἀκούω",
  "βλέπω",
  "θεωρέω",
  "γεύομαι",
  "γράφω",
  "μιμνῄσκομαι",
  "μνημονεύω",
  "νοέω",
  "ἐπίσταμαι"
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

// Postpositive by definition: these never stand first in their clause and
// routinely land just after the verb, while still marking the whole clause.
// Exempt from the position rule below.
const POSTPOSITIVE_PARTICLES = new Set(["γάρ", "δέ", "οὖν", "μέν", "τε"]);

/**
 * A subordinating marker introduces the clause it governs, so in Greek it
 * stands before that clause's verb. One that turns up AFTER the finite verb is
 * opening something else: 1 Peter 2:11's παρακαλῶ ὡς παροίκους καὶ
 * παρεπιδήμους ("I urge you as sojourners and exiles") is a comparative phrase
 * hanging on the object, not a time clause over παρακαλῶ — but ὡς sits at token
 * 3, inside the leading window, so a position-blind window read it as one.
 * Returns true (no opinion) when the verb isn't in the window to compare with.
 */
function standsBeforeFiniteVerb(
  tokens: ClauseBeginningToken[],
  token: ClauseBeginningToken,
  finiteVerbId?: string
): boolean {
  if (!finiteVerbId) return true;
  if (POSTPOSITIVE_PARTICLES.has(stripAccentless(token.lemma))) return true;
  const verbIndex = tokens.findIndex(candidate => candidate.id === finiteVerbId);
  if (verbIndex < 0) return true;
  return tokens.indexOf(token) < verbIndex;
}

function findLeadingToken(
  tokens: ClauseBeginningToken[],
  predicate: (token: ClauseBeginningToken) => boolean,
  finiteVerbId?: string
): ClauseBeginningToken | undefined {
  return tokens
    .slice(0, LEADING_WINDOW)
    .find(token => predicate(token) && standsBeforeFiniteVerb(tokens, token, finiteVerbId));
}

/**
 * ὡς is the one entry in the particle table that is also an improper
 * preposition, and the morphology says which reading is in play: tagged P it
 * governs a substantive (1 Peter 2:11 ὡς παροίκους, "as sojourners"), tagged C
 * it can open a clause. Only the conjunction can subordinate a verb.
 */
function isFrameParticle(token: ClauseBeginningToken): boolean {
  if (!FRAME_PARTICLES[stripAccentless(token.lemma)]) return false;
  return !token.morph.startsWith("P");
}

// Mood letter of a finite verb: MorphGNT puts it at index 5 (ἔστω =
// "V-3PAD-S--", D for imperative); Robinson writes the same form "V-PAM-3S".
function isImperativeMorph(morph: string): boolean {
  return /^V-[123][A-Z]{2}D/.test(morph) || /^V-[A-Z]{2}M-[123]/.test(morph);
}

/**
 * A relative pronoun up front over an imperative verb — 1 Peter 3:3's ὧν ἔστω
 * … κόσμος, "let their adornment not be…". Greek relative clauses take the
 * indicative, subjunctive or optative; a relative simply cannot govern an
 * imperative. So the pronoun is doing connective work (here a possessive
 * genitive reaching back to the γυναῖκες of 3:1) and the clause stands on its
 * own, even though the antecedent is outside it and detectRelativeOfConnection
 * — which only looks inside the clause — finds nothing.
 */
export function detectRelativeOverImperative(
  clause: ClauseSignalInput
): { relative: ClauseBeginningToken; verb: ClauseBeginningToken } | null {
  const relative = findLeadingToken(clause.beginningTokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX));
  if (!relative) return null;
  const verb = clause.beginningTokens.find(token => token.id === clause.finiteVerbId);
  if (!verb || !isImperativeMorph(verb.morph)) return null;
  return { relative, verb };
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
  const relative = findLeadingToken(
    clause.beginningTokens,
    token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX),
    clause.finiteVerbId
  );
  if (relative) {
    const overImperative = detectRelativeOverImperative(clause);
    if (overImperative) {
      return {
        kind: "uncertain",
        reason:
          `Opens with “${overImperative.relative.greek}” (${overImperative.relative.lemma}), but this clause's own verb ` +
          `“${overImperative.verb.greek}” is an imperative — and a Greek relative clause never governs a command. ` +
          `So the pronoun is almost certainly connective here (“de ellas sea…”, reaching back to a noun in an earlier ` +
          `verse), and the clause stands on its own. Independent is the usual read; you still decide.`
      };
    }
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

  const frameToken = findLeadingToken(clause.beginningTokens, isFrameParticle, clause.finiteVerbId);
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

  const ambiguousToken = findLeadingToken(
    clause.beginningTokens,
    token => Boolean(AMBIGUOUS_PARTICLES[stripAccentless(token.lemma)]),
    clause.finiteVerbId
  );
  if (ambiguousToken) {
    const ambiguousLemma = stripAccentless(ambiguousToken.lemma);
    const otiHint = ambiguousLemma === "ὅτι" ? findOtiGoverningHint(clause, allClauses) : null;
    let reason =
      `Opens with “${ambiguousToken.greek}” (${ambiguousLemma}) — ${AMBIGUOUS_PARTICLES[ambiguousLemma]}. `;
    if (otiHint) {
      const place =
        otiHint.where === "leading-window"
          ? `right here before it (“${otiHint.greek}”, ${otiHint.lemma})`
          : `in the previous clause (${otiHint.lemma})`;
      reason +=
        `A saying/knowing/perceiving verb sits ${place}, which often means content (“that…”) — ` +
        `but check whether “because…” still fits better. You decide.`;
    } else {
      reason +=
        `No saying/knowing verb is sitting nearby, which often means reason (“because…” / Adverbial) — ` +
        `but check whether a content sense still fits. You decide.`;
    }
    return { kind: "uncertain", reason };
  }

  const buried = findSubordinatorPastLeadingWindow(clause.beginningTokens, clause.finiteVerbId);
  if (buried) {
    return {
      kind: "uncertain",
      reason:
        `Nothing at the very front of this clause, but “${buried.token.greek}” (${buried.token.lemma}) — ` +
        `${buried.role} — sits several words in, past where Greek puts a clause's opening marker. That normally means ` +
        `the span starts too early and is carrying words that belong to the clause before it. Tighten the span first: ` +
        `until the front of the clause is right, “independent” isn't a safe read of it.`
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
export function detectLeadingCoordinator(
  beginningTokens: ClauseBeginningToken[],
  finiteVerbId?: string
): string | null {
  const token = findLeadingToken(
    beginningTokens,
    candidate => PLAIN_COORDINATORS.has(stripAccentless(candidate.lemma)),
    finiteVerbId
  );
  if (!token) return null;
  if (joinsAgreeingWords(beginningTokens, token)) return null;
  return stripAccentless(token.lemma);
}

/**
 * καί/ἤ sitting between two declined words that agree with each other is joining
 * WORDS, not clauses — 1 Peter 4:18's ὁ ἀσεβὴς καὶ ἁμαρτωλός (both NSM), 1:2's
 * χάρις καὶ εἰρήνη (both NSF), 1:11's τίνα ἢ ποῖον καιρόν (both ASM). The leading
 * window exists to tolerate a stray word or two leaking in from the previous
 * clause, which also means it reaches far enough to catch a coordinator that
 * belongs to a compound subject. Reading that as a clause connector makes the
 * clause inherit a dependency it never claimed, and prints a connector note over
 * a word-level καί.
 *
 * Verbs are excluded on purpose: two finite verbs joined by καί are two clauses,
 * each with its own row (1 Peter 3:11's ζητησάτω … καὶ διωξάτω), and there the
 * coordinator really does join clauses. Indeclinables are excluded too — their
 * agreement slots are all dashes, which would otherwise match each other.
 * A coordinator at position 0 is never word-level, so it is exempt.
 */
function joinsAgreeingWords(
  tokens: ClauseBeginningToken[],
  coordinator: ClauseBeginningToken
): boolean {
  const index = tokens.indexOf(coordinator);
  if (index <= 0) return false;
  const before = tokens[index - 1];
  const after = tokens[index + 1];
  if (!before || !after) return false;
  const key = declinedAgreementKey(before.morph);
  return key !== null && key === declinedAgreementKey(after.morph);
}

/** Case/number/gender, but only for a word that actually declines. */
function declinedAgreementKey(morph: string): string | null {
  if (morph.startsWith("V")) return null;
  const key = agreementKey(morph);
  return /^[A-Z]{3}$/.test(key) ? key : null;
}

/**
 * Frame particle in the clause's own leading window, for manual classification
 * (picking a parent directly) rather than detectClauseSignal's full proposal
 * chain. Same tolerant window as everywhere else in this file — γάρ/δέ/οὖν are
 * postpositive, so checking only beginningTokens[0] would miss most of them.
 *
 * ὅτι is intentionally absent from FRAME_PARTICLES (it also marks content), so
 * detectClauseSignal never auto-chooses Adverbial from ὅτι alone. Once the
 * student has already chosen the frame/Adverbial path, though, ὅτι's only
 * frame subtype is reason — return that here so parent-picking can store it.
 * Returns undefined when no recognized frame particle (or frame-reading ὅτι)
 * is present.
 */
export function detectLeadingFrameType(
  beginningTokens: ClauseBeginningToken[],
  finiteVerbId?: string
): FrameType | undefined {
  const frameToken = findLeadingToken(beginningTokens, isFrameParticle, finiteVerbId);
  if (frameToken) return FRAME_PARTICLES[stripAccentless(frameToken.lemma)];
  const otiToken = findLeadingToken(beginningTokens, token => stripAccentless(token.lemma) === "ὅτι", finiteVerbId);
  if (otiToken) return "reason";
  return undefined;
}

/**
 * Ranks candidate parent clauses for a content relation: clauses whose own
 * finite verb is a said/thought/wanted verb are the likelier parent, based on
 * the Greek lemma — not a guess, but not a forced answer either.
 */
export function isLikelyContentParent(candidate: { finiteVerbLemma?: string }): boolean {
  return Boolean(candidate.finiteVerbLemma && CONTENT_VERB_LEMMAS.has(stripAccentless(candidate.finiteVerbLemma)));
}

export type OtiGoverningHint = {
  lemma: string;
  greek: string;
  /** Same leading window (e.g. εἰδότες ὅτι) vs previous finite clause. */
  where: "leading-window" | "preceding-clause";
};

/**
 * Soft evidence for ὅτι as content (“that…”) vs reason (“because…”): a
 * saying/knowing/perceiving verb in the opening window or the immediately
 * preceding clause. Absence is itself informative (leans causal), but never
 * decisive on its own.
 */
export function findOtiGoverningHint(
  clause: ClauseSignalInput,
  allClauses: ClauseSignalInput[]
): OtiGoverningHint | null {
  const contentToken = findLeadingToken(clause.beginningTokens, token =>
    CONTENT_VERB_LEMMAS.has(stripAccentless(token.lemma))
  );
  if (contentToken) {
    return {
      lemma: stripAccentless(contentToken.lemma),
      greek: contentToken.greek,
      where: "leading-window"
    };
  }

  const prevId = nearestPrecedingClauseId(clause, allClauses);
  const prev = prevId ? allClauses.find(candidate => candidate.finiteVerbId === prevId) : undefined;
  if (prev?.finiteVerbLemma && CONTENT_VERB_LEMMAS.has(stripAccentless(prev.finiteVerbLemma))) {
    return {
      lemma: stripAccentless(prev.finiteVerbLemma),
      greek: prev.finiteVerbLemma,
      where: "preceding-clause"
    };
  }
  return null;
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
 * (`none` → independent; `confident` → that shape; relative-of-connection
 * uncertain → soft lean independent; ὅτι uncertain → soft lean content or
 * reason from nearby governing-verb evidence; other uncertain → no badge).
 */
export function buildClauseChoiceGuidance(
  clause: ClauseSignalInput,
  signal: ClauseSignal,
  allClauses: ClauseSignalInput[]
): ClauseChoiceGuidance {
  const tokens = clause.beginningTokens;
  const verbId = clause.finiteVerbId;
  const relative = findLeadingToken(tokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX), verbId);
  const connection = detectRelativeOfConnection(tokens);
  const frameToken = findLeadingToken(tokens, isFrameParticle, verbId);
  const ambiguousToken = findLeadingToken(tokens, token => Boolean(AMBIGUOUS_PARTICLES[stripAccentless(token.lemma)]), verbId);
  const otiToken = findLeadingToken(tokens, token => stripAccentless(token.lemma) === "ὅτι", verbId);
  const otiHint = otiToken || (ambiguousToken && stripAccentless(ambiguousToken.lemma) === "ὅτι")
    ? findOtiGoverningHint(clause, allClauses)
    : null;
  const eisPhrase = detectEisGoalPhrase(tokens);
  const openSurface = tokens
    .slice(0, 3)
    .map(token => token.greek)
    .filter(Boolean)
    .join(" ");

  const prevId = nearestPrecedingClauseId(clause, allClauses);
  const prev = prevId ? allClauses.find(candidate => candidate.finiteVerbId === prevId) : undefined;
  const prevIsContentVerb = Boolean(prev && isLikelyContentParent(prev));

  const overImperative = detectRelativeOverImperative(clause);

  let suggested: ClauseChoiceKind | null = null;
  if (signal.kind === "confident") suggested = choiceKindFromConfident(signal);
  else if (signal.kind === "none") suggested = "root";
  // 1 Pet 1:10 περὶ ἧς σωτηρίας / Titus 1:13 δι' ἣν αἰτίαν: the relative is a
  // connective idiom, so Independent is the usual lean — still the student's call.
  else if (signal.kind === "uncertain" && (connection || overImperative)) suggested = "root";
  else if (signal.kind === "uncertain" && otiToken) suggested = otiHint ? "content" : "frame";

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

  let describesEvidence: string;
  if (connection) {
    describesEvidence =
      `Usually avoid: “${connection.relative.greek}” agrees with “${connection.antecedent.greek}” inside this same clause ` +
      `(relative of connection — e.g. περὶ ἧς σωτηρίας, “concerning this salvation”), not a relative describing some earlier noun.`;
  } else if (overImperative) {
    describesEvidence =
      `Usually avoid: the verb here (“${overImperative.verb.greek}”) is an imperative, and a relative clause in Greek ` +
      `never governs a command — so “${overImperative.relative.greek}” isn't describing a noun, it's connecting.`;
  } else if (otiToken) {
    describesEvidence = "Usually avoid: ὅτι is not a relative pronoun.";
  } else if (relative) {
    describesEvidence = `Opens with “${relative.greek}” (${relative.lemma}) — a relative pronoun.`;
  } else {
    describesEvidence = "No relative pronoun (ὅς / ἥ / ὅ…) in the opening window.";
  }

  let contentEvidence: string;
  if (otiToken || (ambiguousToken && stripAccentless(ambiguousToken.lemma) === "ὅτι")) {
    const token = otiToken ?? ambiguousToken!;
    if (otiHint) {
      const place =
        otiHint.where === "leading-window"
          ? `“${otiHint.greek}” (${otiHint.lemma}) in the opening window`
          : `${otiHint.lemma} in the previous clause`;
      contentEvidence =
        `Suggested lean: “${token.greek}” often means “that…” here — ${place} is a saying/knowing/perceiving verb that commonly governs content.`;
    } else {
      contentEvidence =
        `“${token.greek}” can mean “that…” (content), but no saying/knowing verb is nearby — reason (“because…”) may fit better. Still check.`;
    }
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
  } else if (otiToken || (ambiguousToken && stripAccentless(ambiguousToken.lemma) === "ὅτι")) {
    const token = otiToken ?? ambiguousToken!;
    if (otiHint) {
      frameEvidence =
        `“${token.greek}” can still mean “because…” (reason / Adverbial) — only if it isn’t the content of that nearby saying/knowing verb.`;
    } else {
      frameEvidence =
        `Suggested lean: “${token.greek}” often means “because…” (reason) when no saying/knowing verb governs it — pick Adverbial, then reason.`;
    }
  } else if (connection) {
    frameEvidence =
      "No ἵνα / ὅπως / γάρ / εἰ… opener. The relative up front is connective, not an adverbial subordinating particle — " +
      "only pick Adverbial if something else in the clause clearly supplies when / why / if / so-that.";
  } else if (eisPhrase) {
    frameEvidence =
      `No ἵνα / ὅπως / γάρ / εἰ… opener. Note: “${eisPhrase.eis.greek}” + “${eisPhrase.noun.greek}” is a purpose/goal ` +
      `phrase (εἰς + noun), not a purpose clause (those need ἵνα / ὅπως + a verb).`;
  } else {
    frameEvidence = "No ἵνα / ὅπως / γάρ / εἰ / ὅτε… in the opening window.";
  }

  const hasRealSubordinatingOpener = Boolean(
    (!connection && !overImperative && relative) || frameToken || otiToken || ambiguousToken
  );
  let rootEvidence: string;
  if (overImperative) {
    rootEvidence =
      `Suggested lean: “${overImperative.relative.greek}” opens the clause, but “${overImperative.verb.greek}” is an ` +
      `imperative — no relative clause carries a command, so the pronoun is connective and this stands on its own.`;
  } else if (connection) {
    rootEvidence =
      `Suggested lean: “${connection.relative.greek} … ${connection.antecedent.greek}” is doing connective work ` +
      `(like “concerning this salvation” / “therefore”), so the finite clause usually stands on its own. You still decide.`;
  } else if (otiToken) {
    rootEvidence = "Usually avoid: ὅτι typically subordinates (content or reason), rather than standing alone.";
  } else if (suggested === "root") {
    rootEvidence = "Suggested: nothing in the opening window subordinates this clause.";
  } else if (hasRealSubordinatingOpener) {
    rootEvidence =
      "Less likely while a subordinating opener is present — unless that word is only a discourse connective.";
  } else {
    rootEvidence = "Default when subordinating openers are absent.";
  }

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
export function findLeadingMarkerToken(
  beginningTokens: ClauseBeginningToken[],
  finiteVerbId?: string
): LeadingMarker {
  const relative = findLeadingToken(beginningTokens, token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX), finiteVerbId);
  if (relative) return { kind: "relative", token: relative };

  const frameToken = findLeadingToken(beginningTokens, isFrameParticle, finiteVerbId);
  if (frameToken) return { kind: "frame", token: frameToken, frameType: FRAME_PARTICLES[stripAccentless(frameToken.lemma)] };

  const contentToken = findLeadingToken(beginningTokens, token => stripAccentless(token.lemma) === "ὅτι", finiteVerbId);
  if (contentToken) return { kind: "content", token: contentToken };

  const coordToken = findLeadingToken(beginningTokens, token => PLAIN_COORDINATORS.has(stripAccentless(token.lemma)), finiteVerbId);
  // Same word-level test detectLeadingCoordinator applies. Both paths must agree:
  // this one drives the Compiler's printed connector line and its demotion checks,
  // so filtering in only one of them prints "une esta cláusula con la anterior"
  // over a καί that joins two words (1 Peter 1:2, 4:18).
  if (coordToken && !joinsAgreeingWords(beginningTokens, coordToken)) {
    return { kind: "coordinator", token: coordToken, lemma: stripAccentless(coordToken.lemma) };
  }

  return { kind: "none" };
}

/**
 * A subordinator sitting PAST the leading window — the signature of a clause
 * span that starts too early (usually at the verse boundary), leaving the real
 * opening (ἐάν, ὡς, ὅτι…) buried behind words that belong to what came before.
 * Kept apart from findLeadingMarkerToken because it is never grounds for a
 * proposal: what's in question is the span itself, so the fix is to tighten the
 * span, not to read "no marker at the front" as "independent." A plain
 * coordinator in the window doesn't disqualify the scan — καὶ … ἐάν is exactly
 * the shape this catches.
 *
 * Only tokens before the clause's own finite verb count. A subordinator after
 * it opens something the span runs INTO (1 Peter 2:11's αἵτινες στρατεύονται,
 * trailing παρακαλῶ), which is a different question from where the span begins
 * and no reason to doubt an independent reading.
 */
export function findSubordinatorPastLeadingWindow(
  beginningTokens: ClauseBeginningToken[],
  finiteVerbId?: string
): { token: ClauseBeginningToken; role: string } | null {
  const leading = findLeadingMarkerToken(beginningTokens, finiteVerbId);
  if (leading.kind !== "none" && leading.kind !== "coordinator") return null;

  const verbIndex = finiteVerbId ? beginningTokens.findIndex(token => token.id === finiteVerbId) : -1;
  const scanned = verbIndex >= 0 ? beginningTokens.slice(0, verbIndex) : beginningTokens;

  for (const token of scanned.slice(LEADING_WINDOW)) {
    if (token.morph.startsWith(RELATIVE_PRONOUN_PREFIX)) return { token, role: "a relative pronoun" };
    const lemma = stripAccentless(token.lemma);
    const frameType = FRAME_PARTICLES[lemma];
    if (frameType) return { token, role: `a ${frameType} particle` };
    if (AMBIGUOUS_PARTICLES[lemma]) return { token, role: "a content-or-reason particle" };
  }
  return null;
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
  frameType?: FrameType,
  finiteVerbId?: string
): ClauseMarker | null {
  // Same tolerant leading-window search detectClauseSignal already uses for
  // relative pronouns/frame particles above — genuinely required here too,
  // not just for consistency: γάρ/δέ/οὖν are postpositive in Greek (they
  // never stand as literally the first word of a clause, typically landing
  // second, often right after the clause's own verb), so checking only
  // beginningTokens[0] would silently miss almost every relational connector.
  const relative = findLeadingToken(
    beginningTokens,
    token => token.morph.startsWith(RELATIVE_PRONOUN_PREFIX),
    finiteVerbId
  );
  if (relation !== "root" && relative && !findEmbeddedAntecedent(beginningTokens, relative)) {
    return { word: relative.greek, lemma: stripAccentless(relative.lemma), type: "subordinating", subtype: "descripción" };
  }

  const connectiveToken = findLeadingToken(
    beginningTokens,
    token => Boolean(RELATIONAL_CONNECTIVE_SUBTYPES[stripAccentless(token.lemma)]),
    finiteVerbId
  );
  const frameToken = findLeadingToken(beginningTokens, isFrameParticle, finiteVerbId);

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
    const contentToken = findLeadingToken(
      beginningTokens,
      token => stripAccentless(token.lemma) === stripAccentless("ὅτι"),
      finiteVerbId
    );
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
