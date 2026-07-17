import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  auditGreekSpanConsistency,
  buildVerseTokenWordMap,
  deriveGreekClauseRange,
  deriveSpanishSpanFromGreekRange,
  formatClauseSpan,
  getClauseBeginningTokens,
  getVersesWithoutFiniteVerb,
  loadTitusClauseVerses,
  readClauseAssignments,
  readClauseObservations,
  readCommandRecipientAssignments,
  readMarkedAlignmentIds,
  readParticipleObservations,
  resolveParticipleClassification,
  spanFromRange,
  wordInSpan,
  writeClauseAssignments,
  writeClauseObservations,
  writeParticipleObservations,
  type ClauseAssignments,
  type ClauseBeginningToken,
  type ClauseObservation,
  type ClauseObservations,
  type GreekClauseRange,
  type ParticipleObservation,
  type ParticipleObservations,
  type SpanishWord
} from "./clause-data";
import {
  detectClauseMarker,
  detectClauseSignal,
  detectLeadingCoordinator,
  detectLeadingFrameType,
  detectRelativeOfConnection,
  isLikelyContentParent,
  type ClauseMarker,
  type ClauseSignal,
  type ClauseSignalInput,
  type FrameType
} from "./clause-signals";
import { describeRmac, getVerseInterlinear } from "./o-data";
import {
  applyCoordinateInheritance,
  deriveOutline,
  deriveSkeleton,
  deriveTelos,
  findRootAncestor,
  resolveClause,
  type ClauseSpanInfo,
  type SkeletonNode
} from "./clause-tree";

type ClauseView = "passage" | "clauses" | "participle-views";
type ParticipleViewTab = "flow" | "emphasis" | "cast";
type ClauseReviewState = "Unreviewed" | "Reviewed" | "Attached" | "Not sure";

interface ClauseOutputRow {
  finiteVerb: SpanishWord;
  reference: string;
  spanText: string;
  selectedWords: SpanishWord[];
  greekRange: GreekClauseRange | null;
  beginningTokens: ClauseBeginningToken[];
  hasDependentIntroducer: boolean;
}

const COMMAND_MARKS_KEY = "roots:titus:brick2:mood:imperativeCandidates";
const STATEMENT_MARKS_KEY = "roots:titus:brick2c:mood:statementCandidates";
const SUBJUNCTIVE_MARKS_KEY = "roots:titus:brick3:mood:subjunctiveCandidates";
const OPTATIVE_MARKS_KEY = "roots:titus:brick3c:mood:optativeCandidates";
const PARTICIPLE_MARKS_KEY = "roots:titus:brick4:participleCandidates";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Every alignment id (finiteVerbId, a Greek token's own id) is
// "chapter:verse:token" — the same shape clause-data.ts's own
// finiteAlignmentId/parseAlignmentId use internally, duplicated here rather
// than exported further since it's a one-line parse.
function parseGreekTokenId(id: string): { chapter: number; verse: number; token: number } | null {
  const [chapter, verse, token] = id.split(":").map(Number);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse) || !Number.isFinite(token)) return null;
  return { chapter, verse, token };
}


const CASE_NAMES: Record<string, string> = { N: "nominative", G: "genitive", D: "dative", A: "accusative" };
const NUMBER_NAMES: Record<string, string> = { S: "singular", P: "plural" };
const GENDER_NAMES: Record<string, string> = { M: "masculine", F: "feminine", N: "neuter" };

function describeParticipleMorph(word: SpanishWord): string {
  const parts = [
    word.participleCase ? CASE_NAMES[word.participleCase] : null,
    word.participleGender ? GENDER_NAMES[word.participleGender] : null,
    word.participleNumber ? NUMBER_NAMES[word.participleNumber] : null
  ].filter(Boolean);
  return parts.join(" ");
}

// Chips need to be readable without knowing Greek by sight — pair the Greek
// surface (what Brick 4 actually marked) with its Spanish word for an anchor,
// falling back to whichever one is available.
function participleChipLabel(word: SpanishWord): string {
  if (word.participleSurface && word.text && word.participleSurface !== word.text) {
    return `${word.participleSurface} (${word.text})`;
  }
  return word.participleSurface ?? word.text;
}

// Finding participles now happens in the Greek O-Prototype view (Brick 4) —
// morphology is visible there (RMAC tag under every token), unlike here
// where only a Spanish gloss is shown. This view reads Brick 4's marks
// read-only, via readMarkedAlignmentIds (same conversion moodReviewedVerbIds
// already uses), and is only responsible for sorting what's already found.
function setsMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// Same rule as Brick 1's brickConfirmed (see ReaderApp.tsx): setsMatch
// already does the right thing when groundTruth is empty — nothing marked
// against nothing to find is the correct, confirmed state, not an unearned one.
function marksConfirmed(marked: Set<string>, groundTruth: Set<string>): boolean {
  return setsMatch(marked, groundTruth);
}

function ParticipleCheck({ confirmed }: { confirmed: boolean }) {
  if (!confirmed) return null;
  return (
    <span className="brick-check" aria-label="Confirmed against the source text">
      ✓
    </span>
  );
}

export default function SpanishClauseBuilder() {
  const verses = useMemo(() => loadTitusClauseVerses(), []);

  const wordById = useMemo(() => {
    const index = new Map<string, SpanishWord>();
    for (const verse of verses) {
      for (const word of verse.words) index.set(word.id, word);
    }
    return index;
  }, [verses]);

  const finiteVerbs = useMemo(
    () => verses.flatMap(verse => verse.words.filter(word => word.finiteVerbId)),
    [verses]
  );

  // For the Greek-token click handler: given a token's own alignment id
  // (same "chapter:verse:token" shape a finiteVerbId already is), is this
  // token the clause's own finite verb? If so we need the SpanishWord it
  // rides on to reuse selectVerb unchanged.
  const finiteVerbByAlignmentId = useMemo(() => {
    const map = new Map<string, SpanishWord>();
    for (const verb of finiteVerbs) {
      if (verb.finiteVerbId) map.set(verb.finiteVerbId, verb);
    }
    return map;
  }, [finiteVerbs]);

  // Skeleton/outline/telos need every mood-tagged finite clause, not just
  // statement/command — purpose clauses (ἵνα) are subjunctive, and telos is
  // unreachable if subjunctive clauses never enter the review workspace.
  const moodReviewedVerbIds = useMemo(() => {
    const ids = new Set<string>();
    readMarkedAlignmentIds(COMMAND_MARKS_KEY).forEach(id => ids.add(id));
    readMarkedAlignmentIds(STATEMENT_MARKS_KEY).forEach(id => ids.add(id));
    readMarkedAlignmentIds(SUBJUNCTIVE_MARKS_KEY).forEach(id => ids.add(id));
    readMarkedAlignmentIds(OPTATIVE_MARKS_KEY).forEach(id => ids.add(id));
    return ids;
  }, []);

  const wordsByVerse = useMemo(() => {
    const index = new Map<string, SpanishWord[]>();
    for (const verse of verses) {
      index.set(`${verse.chapter}:${verse.verse}`, verse.words);
    }
    return index;
  }, [verses]);

  const verseTextByKey = useMemo(() => {
    const index = new Map<string, string>();
    for (const verse of verses) {
      index.set(`${verse.chapter}:${verse.verse}`, verse.text);
    }
    return index;
  }, [verses]);

  const [assignments, setAssignments] = useState<ClauseAssignments>(readClauseAssignments);

  // Read-only audit (clause-selection-greek-spec.md): before Greek becomes
  // the authoritative span, surface every existing clause whose stored
  // Greek range no longer matches what deriving it fresh from the current
  // Spanish span would produce, rather than assuming old data is fine.
  const greekSpanAudit = useMemo(() => auditGreekSpanConsistency(verses, assignments), [verses, assignments]);
  const greekSpanMismatches = useMemo(() => greekSpanAudit.filter(entry => entry.mismatch), [greekSpanAudit]);

  const [activeVerbId, setActiveVerbId] = useState<string | null>(null);

  // Per clause-selection-greek-spec.md: the Greek token range is now the
  // authoritative draft, set directly by clicking Greek tokens. The Spanish
  // span (draftSpan, below) is derived from this for display and for every
  // downstream consumer that already expects Spanish word ids — it's no
  // longer itself something a click sets.
  const [draftGreekRange, setDraftGreekRange] = useState<{ start: number; end: number } | null>(null);
  const [greekRangeAnchorToken, setGreekRangeAnchorToken] = useState<number | null>(null);
  const [view, setView] = useState<ClauseView>("passage");
  const [participleViewTab, setParticipleViewTab] = useState<ParticipleViewTab>("emphasis");
  const [expandedFlowRootId, setExpandedFlowRootId] = useState<string | null>(null);
  const [showDependentLines, setShowDependentLines] = useState(true);
  const [activeBeginningVerbId, setActiveBeginningVerbId] = useState<string | null>(null);
  const [observations, setObservations] = useState<ClauseObservations>(readClauseObservations);
  const [nounAnchorId, setNounAnchorId] = useState<string | null>(null);
  const [forceChoices, setForceChoices] = useState(false);
  // Set only when the active clause changed via moveToNextClause (confirming
  // a clause auto-advances to the next one) rather than a direct click on a
  // specific row/node — see clause-review-focus-bug-and-interaction-model.md
  // item 1. Drives an explicit "moved to next clause" notice so that
  // transition is never confusable with the panel staying put.
  const [autoAdvancedNoticeId, setAutoAdvancedNoticeId] = useState<string | null>(null);

  // forceChoices is reset explicitly by chooseDescribes/Content/Frame/Root,
  // but the active clause can also change via the Skeleton tree, Sequence
  // view, or workspace list (all set activeBeginningVerbId directly without
  // going through those). Without this, a stale forceChoices=true would leak
  // onto whichever clause is selected next — showing the full choice grid
  // immediately instead of that clause's own default/focused view.
  useEffect(() => {
    setForceChoices(false);
  }, [activeBeginningVerbId]);

  const [showGreekBeginning, setShowGreekBeginning] = useState(false);
  const [participleObservations, setParticipleObservations] = useState<ParticipleObservations>(readParticipleObservations);
  const [activeParticipleId, setActiveParticipleId] = useState<string | null>(null);
  const [activeStandaloneParticipleId, setActiveStandaloneParticipleId] = useState<string | null>(null);
  const [participleNounAnchorId, setParticipleNounAnchorId] = useState<string | null>(null);
  const [showParticiples, setShowParticiples] = useState(false);
  const [openParticiplePopoverId, setOpenParticiplePopoverId] = useState<string | null>(null);

  // Brick 4's own marks (Greek O-Prototype), converted from MorphGNT-line-id
  // format to "chapter:verse:token" alignment format — same conversion
  // moodReviewedVerbIds already relies on. Read-only here: this view sorts
  // participles, it doesn't find them.
  const participleMarkedAlignmentIds = useMemo(() => readMarkedAlignmentIds(PARTICIPLE_MARKS_KEY), []);

  const activeVerb = useMemo(
    () => finiteVerbs.find(verb => verb.finiteVerbId === activeVerbId) ?? null,
    [activeVerbId, finiteVerbs]
  );

  const activeVerseWords = useMemo(() => {
    if (!activeVerb) return [];
    return wordsByVerse.get(`${activeVerb.chapter}:${activeVerb.verse}`) ?? [];
  }, [activeVerb, wordsByVerse]);

  const activeVerseText = useMemo(() => {
    if (!activeVerb) return "";
    return verseTextByKey.get(`${activeVerb.chapter}:${activeVerb.verse}`) ?? "";
  }, [activeVerb, verseTextByKey]);

  // Spanish span, derived from the Greek draft range — display/comprehension
  // only now, never itself the thing a click sets. See draftGreekRange above.
  const draftSpan = useMemo(() => {
    if (!draftGreekRange || !activeVerb) return [];
    return deriveSpanishSpanFromGreekRange(
      activeVerb.chapter,
      activeVerb.verse,
      draftGreekRange.start,
      draftGreekRange.end,
      activeVerseWords
    );
  }, [activeVerb, activeVerseWords, draftGreekRange]);

  const overlapWordIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of Object.values(assignments)) {
      for (const id of assignment.selectedSpan) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([id]) => id));
  }, [assignments]);

  const savedWordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const assignment of Object.values(assignments)) {
      assignment.selectedSpan.forEach(id => ids.add(id));
    }
    return ids;
  }, [assignments]);

  // Same two sets, but keyed by Greek token alignment id instead of Spanish
  // word id — the Passage view's Greek row highlights against these now
  // that Greek is the authoritative span; Spanish keeps its own (derived)
  // versions above purely for the comprehension-aid highlighting.
  const { savedGreekTokenIds, overlapGreekTokenIds } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of Object.values(assignments)) {
      if (!assignment.greekStartTokenId || !assignment.greekEndTokenId) continue;
      const start = parseGreekTokenId(assignment.greekStartTokenId);
      const end = parseGreekTokenId(assignment.greekEndTokenId);
      if (!start || !end) continue;
      for (let token = start.token; token <= end.token; token += 1) {
        const id = `${start.chapter}:${start.verse}:${token}`;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return {
      savedGreekTokenIds: new Set(counts.keys()),
      overlapGreekTokenIds: new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([id]) => id))
    };
  }, [assignments]);

  const draftText = useMemo(
    () => (draftSpan.length ? formatClauseSpan(draftSpan, activeVerseWords, activeVerseText) : ""),
    [activeVerseText, activeVerseWords, draftSpan]
  );

  const clauseRows = useMemo<ClauseOutputRow[]>(() => {
    return finiteVerbs.map(finiteVerb => {
      const assignment = finiteVerb.finiteVerbId ? assignments[finiteVerb.finiteVerbId] : null;
      const verseKey = `${finiteVerb.chapter}:${finiteVerb.verse}`;
      const verseWords = wordsByVerse.get(verseKey) ?? [];
      const verseText = verseTextByKey.get(verseKey) ?? "";
      const selectedWords = assignment
        ? assignment.selectedSpan
            .map(id => wordById.get(id))
            .filter((word): word is SpanishWord => Boolean(word))
            .sort((a, b) => a.index - b.index)
        : [];
      const greekRange =
        assignment?.greekStartTokenId && assignment.greekEndTokenId
          ? {
              greekStartTokenId: assignment.greekStartTokenId,
              greekEndTokenId: assignment.greekEndTokenId
            }
          : assignment
            ? deriveGreekClauseRange(assignment.selectedSpan, verseWords, finiteVerb.finiteVerbId ?? "")
            : null;

      return {
        finiteVerb,
        reference: `Tito ${finiteVerb.chapter}:${finiteVerb.verse}`,
        spanText: assignment ? formatClauseSpan(assignment.selectedSpan, verseWords, verseText) : "",
        selectedWords,
        greekRange,
        beginningTokens: getClauseBeginningTokens(greekRange),
        hasDependentIntroducer: selectedWords.some(word => word.dependentIntroducerId)
      };
    });
  }, [assignments, finiteVerbs, verseTextByKey, wordById, wordsByVerse]);

  // Separate from the span-consistency audit above: a clause can be
  // internally consistent (stored range matches what re-deriving it
  // produces) without a human ever having actually re-walked it through the
  // new Greek-token interaction — consistency isn't correctness. Tracks real
  // migration progress, not just data hygiene. See ClauseAssignment.greekConfirmedAt.
  const greekReconfirmationProgress = useMemo(() => {
    const entries = Object.values(assignments);
    const confirmed = entries.filter(assignment => assignment.greekConfirmedAt);
    const unconfirmed = entries
      .filter(assignment => !assignment.greekConfirmedAt)
      .map(assignment => {
        const row = clauseRows.find(candidate => candidate.finiteVerb.finiteVerbId === assignment.finiteVerbId);
        return { assignment, row };
      })
      .sort((a, b) => (a.row?.reference ?? "").localeCompare(b.row?.reference ?? ""));
    return { total: entries.length, confirmedCount: confirmed.length, unconfirmed };
  }, [assignments, clauseRows]);

  const savedClauseRows = useMemo(
    () => clauseRows.filter(row => row.spanText),
    [clauseRows]
  );

  const reviewClauseRows = useMemo(
    () => savedClauseRows.filter(row => {
      const finiteVerbId = row.finiteVerb.finiteVerbId;
      return Boolean(finiteVerbId && moodReviewedVerbIds.has(finiteVerbId));
    }),
    [savedClauseRows, moodReviewedVerbIds]
  );

  const clauseSignalInputs = useMemo<ClauseSignalInput[]>(
    () =>
      reviewClauseRows.map(row => ({
        finiteVerbId: row.finiteVerb.finiteVerbId ?? "",
        chapter: row.finiteVerb.chapter,
        verse: row.finiteVerb.verse,
        finiteVerbLemma: row.finiteVerb.greekLemma,
        beginningTokens: row.beginningTokens
      })),
    [reviewClauseRows]
  );

  // Coordinate inheritance (coordinate-inheritance-spec.md), the "zeroth
  // question" asked before Q1/Q2/Q3: a clause that opens with a bare
  // καί/δέ/ἤ and carries no dependency marker of its own (detectClauseSignal
  // comes back "none") isn't making an independent claim — it's riding
  // alongside whatever the previous clause already is. Flagged here from
  // Greek data; actually resolving the inheritance (and checking that the
  // previous clause is dependent, not just flagging the coordinator) happens
  // in applyCoordinateInheritance, called further down once clauseSpanInfos
  // exists. getClauseReviewState below also treats these as settled, since
  // Q1/Q2/Q3 genuinely don't apply — nothing to review.
  const coordinateContinuationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const input of clauseSignalInputs) {
      if (!input.finiteVerbId) continue;
      if (detectClauseSignal(input, clauseSignalInputs).kind !== "none") continue;
      if (detectLeadingCoordinator(input.beginningTokens)) ids.add(input.finiteVerbId);
    }
    return ids;
  }, [clauseSignalInputs]);

  useEffect(() => {
    let changed = false;
    const next = { ...assignments };

    for (const row of clauseRows) {
      const finiteVerbId = row.finiteVerb.finiteVerbId;
      if (!finiteVerbId || !row.greekRange) continue;
      const assignment = next[finiteVerbId];
      if (!assignment || (assignment.greekStartTokenId && assignment.greekEndTokenId)) continue;
      next[finiteVerbId] = {
        ...assignment,
        ...row.greekRange
      };
      changed = true;
    }

    if (!changed) return;
    setAssignments(next);
    writeClauseAssignments(next);
  }, [assignments, clauseRows]);

  const activeBeginningRow = useMemo(
    () => reviewClauseRows.find(row => row.finiteVerb.finiteVerbId === activeBeginningVerbId) ?? null,
    [activeBeginningVerbId, reviewClauseRows]
  );

  const activeObservation = activeBeginningVerbId ? observations[activeBeginningVerbId] ?? {} : {};

  const getClauseReviewState = useCallback(
    (row: ClauseOutputRow): ClauseReviewState => {
      const finiteVerbId = row.finiteVerb.finiteVerbId;
      const observation = finiteVerbId ? observations[finiteVerbId] ?? {} : {};
      const isAttached =
        Boolean(observation.describedNounSpan?.length) ||
        Boolean(observation.expressedParentClauseId) ||
        Boolean(observation.whenIfParentClauseId) ||
        Boolean(finiteVerbId && coordinateContinuationIds.has(finiteVerbId));
      if (isAttached) return "Attached";
      if (
        observation.describesNoun === "unsure" ||
        observation.isWhatWasExpressed === "unsure" ||
        observation.tellsWhenOrIf === "unsure"
      ) {
        return "Not sure";
      }
      if (observation.describesNoun && observation.isWhatWasExpressed && observation.tellsWhenOrIf) {
        return "Reviewed";
      }
      return "Unreviewed";
    },
    [coordinateContinuationIds, observations]
  );

  const workspaceClauseRows = useMemo(
    () => reviewClauseRows.filter(row => showDependentLines || getClauseReviewState(row) !== "Attached"),
    [getClauseReviewState, reviewClauseRows, showDependentLines]
  );

  const reviewedCount = useMemo(
    () => reviewClauseRows.filter(row => getClauseReviewState(row) !== "Unreviewed").length,
    [getClauseReviewState, reviewClauseRows]
  );

  const nearbyParentClauseRows = useMemo(() => {
    if (!activeBeginningRow) return [];
    const nearby = reviewClauseRows.filter(row => {
      if (row.finiteVerb.finiteVerbId === activeBeginningRow.finiteVerb.finiteVerbId) return false;
      if (row.finiteVerb.chapter !== activeBeginningRow.finiteVerb.chapter) return false;
      return Math.abs(row.finiteVerb.verse - activeBeginningRow.finiteVerb.verse) <= 2;
    });

    return nearby.length
      ? nearby
      : reviewClauseRows.filter(row => row.finiteVerb.finiteVerbId !== activeBeginningRow.finiteVerb.finiteVerbId);
  }, [activeBeginningRow, reviewClauseRows]);

  const clauseSpanInfos = useMemo<ClauseSpanInfo[]>(
    () =>
      reviewClauseRows
        .filter(row => row.finiteVerb.finiteVerbId)
        .map(row => ({
          finiteVerbId: row.finiteVerb.finiteVerbId as string,
          reference: row.reference,
          spanText: row.spanText,
          wordIds: row.selectedWords.map(word => word.id),
          order: row.finiteVerb.chapter * 100000 + row.finiteVerb.verse * 1000 + row.finiteVerb.index
        })),
    [reviewClauseRows]
  );

  // Skeleton/outline/telos/flow — everything downstream that resolves a
  // clause's place in the tree — reads this augmented map, not the raw
  // student observations, so coordinate-inheriting clauses nest correctly
  // without ever having their own Q1/Q2/Q3 answered. The raw `observations`
  // state (and thus localStorage) is untouched.
  const augmentedObservations = useMemo(
    () => applyCoordinateInheritance(clauseSpanInfos, observations, coordinateContinuationIds),
    [clauseSpanInfos, observations, coordinateContinuationIds]
  );

  const skeleton = useMemo(() => deriveSkeleton(clauseSpanInfos, augmentedObservations), [clauseSpanInfos, augmentedObservations]);
  const outline = useMemo(() => deriveOutline(clauseSpanInfos, augmentedObservations), [clauseSpanInfos, augmentedObservations]);
  const telos = useMemo(() => deriveTelos(clauseSpanInfos, augmentedObservations), [clauseSpanInfos, augmentedObservations]);

  // Grammatical-marker anchor lines (cgv-product-suite-spec.md, "Auto-suggested
  // anchor points"; format in manual-markdown-format-spec.md) — mechanical,
  // reusing the same relation/frameType resolution and leading-token data
  // already computed above. Never its own tree row, never merged onto the
  // clause's own line — see renderSkeletonNode and the Sequence view render.
  const clauseMarkers = useMemo(() => {
    const beginningTokensById = new Map(clauseSignalInputs.map(input => [input.finiteVerbId, input.beginningTokens]));
    const map = new Map<string, ClauseMarker>();
    for (const clause of clauseSpanInfos) {
      const beginningTokens = beginningTokensById.get(clause.finiteVerbId) ?? [];
      const resolved = resolveClause(clause, augmentedObservations[clause.finiteVerbId], clauseSpanInfos);
      const marker = detectClauseMarker(beginningTokens, resolved.relation, resolved.frameType);
      if (marker) map.set(clause.finiteVerbId, marker);
    }
    return map;
  }, [augmentedObservations, clauseSignalInputs, clauseSpanInfos]);

  // A different layer entirely from the skeleton: verses with no finite verb
  // at all (Titus 1:1's long verbless run) never enter Brick 1, so they'd
  // otherwise be silently absent everywhere. Shown, not solved — per spec,
  // deciding their grammatical role now would force the structure to fit a
  // premature decision.
  const verblessVerses = useMemo(() => {
    const verbless = getVersesWithoutFiniteVerb();
    return verses
      .filter(verse => verbless.has(`${verse.chapter}:${verse.verse}`))
      .map(verse => ({ reference: `Tito ${verse.chapter}:${verse.verse}`, text: verse.text }));
  }, [verses]);

  const activeSignal = useMemo<ClauseSignal | null>(() => {
    const finiteVerbId = activeBeginningRow?.finiteVerb.finiteVerbId;
    if (!finiteVerbId) return null;
    const input = clauseSignalInputs.find(candidate => candidate.finiteVerbId === finiteVerbId);
    if (!input) return null;
    return detectClauseSignal(input, clauseSignalInputs);
  }, [activeBeginningRow, clauseSignalInputs]);

  const activeFrameType = useMemo<FrameType | undefined>(() => {
    if (!activeBeginningRow) return undefined;
    return detectLeadingFrameType(activeBeginningRow.beginningTokens);
  }, [activeBeginningRow]);

  // What the parent-picker header should actually show while it's open: the
  // raw draft frameType (activeObservation.frameType) can be temporarily
  // undefined or plain wrong for a coordinate-continuation clause (e.g. one
  // opening with bare καί) whose real type only comes from inheriting its
  // predecessor's — reading the augmented/resolved value instead means the
  // header never displays a guessed type that a later save would overwrite.
  const activeEffectiveFrameType = activeBeginningVerbId
    ? augmentedObservations[activeBeginningVerbId]?.frameType
    : undefined;

  const isActiveClauseRoot =
    activeObservation.describesNoun === "no" &&
    activeObservation.isWhatWasExpressed === "no" &&
    activeObservation.tellsWhenOrIf === "no";

  const activeObservationContextVerses = useMemo(() => {
    if (!activeBeginningRow) return [];
    return verses.filter(verse => {
      if (verse.chapter !== activeBeginningRow.finiteVerb.chapter) return false;
      return Math.abs(verse.verse - activeBeginningRow.finiteVerb.verse) <= 1;
    });
  }, [activeBeginningRow, verses]);

  const describedNounText = useMemo(() => {
    const span = activeObservation.describedNounSpan ?? [];
    if (!span.length) return "";
    const firstWord = wordById.get(span[0]);
    if (!firstWord) return "";
    const verseWords = wordsByVerse.get(`${firstWord.chapter}:${firstWord.verse}`) ?? [];
    const verseText = verseTextByKey.get(`${firstWord.chapter}:${firstWord.verse}`) ?? "";
    return formatClauseSpan(span, verseWords, verseText);
  }, [activeObservation.describedNounSpan, verseTextByKey, wordById, wordsByVerse]);

  // Participle layer — separate from the clause Q1/Q2/Q3 flow above, scoped
  // to whichever clause is currently active. Never touches skeleton state.
  const wordByParticipleId = useMemo(() => {
    const index = new Map<string, SpanishWord>();
    for (const verse of verses) {
      for (const word of verse.words) if (word.participleId) index.set(word.participleId, word);
    }
    return index;
  }, [verses]);

  const finiteVerbIdToRow = useMemo(() => {
    const index = new Map<string, ClauseOutputRow>();
    for (const row of reviewClauseRows) {
      if (row.finiteVerb.finiteVerbId) index.set(row.finiteVerb.finiteVerbId, row);
    }
    return index;
  }, [reviewClauseRows]);

  // Read-only audit, same philosophy as the Greek span audit above: a clause
  // currently classified "describes" (Q1) whose own relative pronoun turns
  // out to agree with a noun inside its OWN clause, not an external one, is a
  // "relative of connection" idiom (see clause-signals.ts) — the classified
  // answer is objectively wrong regardless of which describedNounSpan was
  // picked, since there's no real external antecedent for it to be. Flags
  // rather than auto-corrects; what the clause actually is instead is a
  // human judgment call. Found via 1:13:9 (δι' ἣν αἰτίαν, "for which cause").
  const relativeOfConnectionFlags = useMemo(() => {
    const flags: { finiteVerbId: string; reference: string; relativeWord: string; antecedentWord: string }[] = [];
    for (const input of clauseSignalInputs) {
      if (!input.finiteVerbId) continue;
      if (augmentedObservations[input.finiteVerbId]?.describesNoun !== "yes") continue;
      const connection = detectRelativeOfConnection(input.beginningTokens);
      if (!connection) continue;
      const row = finiteVerbIdToRow.get(input.finiteVerbId);
      flags.push({
        finiteVerbId: input.finiteVerbId,
        reference: row?.reference ?? input.finiteVerbId,
        relativeWord: connection.relative.greek,
        antecedentWord: connection.antecedent.greek
      });
    }
    return flags;
  }, [augmentedObservations, clauseSignalInputs, finiteVerbIdToRow]);

  // This view's own checkmark tracks a different completion than Brick 4's:
  // not "found every participle" (that's Brick 4's job, in Greek) but "sorted
  // every participle Brick 4 found" — every marked id has a resolved
  // attributive/substantival/circumstantial classification.
  const sortedParticipleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [participleId, observation] of Object.entries(participleObservations)) {
      if (resolveParticipleClassification(observation)) ids.add(participleId);
    }
    return ids;
  }, [participleObservations]);

  const participlesConfirmed = marksConfirmed(sortedParticipleIds, participleMarkedAlignmentIds);

  // Participle Mega-Views — book-level aggregates over what's already been
  // classified. Counts and locations only; no view here ever names a
  // "theme" or a "main point" — that reading stays the student's call.

  // Emphasis: attributive participles grouped by the noun they were resolved
  // to describe, keyed by that noun's Greek LEMMA — not its Spanish gloss,
  // and not the raw word-span either. The Interlinear view (see
  // interlinear-view-spec.md) proved lemma data is available for every
  // Greek token, not just participles/finite-verbs/dependent-introducers —
  // this is the fix that unblocked, per participle-data-and-view-fixes.md.
  // Falls back to the resolved word-span as the grouping key only if the
  // lemma genuinely can't be resolved (an alignment gap), so a lookup
  // failure still lands as its own row rather than silently merging into
  // an unrelated one.
  const verseTokenWordMapCache = useMemo(() => new Map<string, Map<number, number>>(), []);

  const resolveNounLemma = useCallback(
    (chapter: number, verse: number, describedNounSpan: string[]): string | null => {
      const key = `${chapter}:${verse}`;
      const verseWords = wordsByVerse.get(key) ?? [];
      let tokenToWord = verseTokenWordMapCache.get(key);
      if (!tokenToWord) {
        tokenToWord = buildVerseTokenWordMap(chapter, verse, verseWords);
        verseTokenWordMapCache.set(key, tokenToWord);
      }

      const spanWordIndexes = new Set(
        describedNounSpan
          .map(id => verseWords.find(word => word.id === id)?.index)
          .filter((index): index is number => index !== undefined)
      );
      if (!spanWordIndexes.size) return null;

      const interlinear = getVerseInterlinear(chapter, verse);
      const candidates = Array.from(tokenToWord.entries())
        .filter(([, wordIndex]) => spanWordIndexes.has(wordIndex))
        .map(([tokenNumber]) => interlinear[tokenNumber - 1])
        .filter((token): token is NonNullable<typeof token> => Boolean(token));

      // Prefer the actual noun (morph "N-...") over an accompanying article
      // or adjective also inside the span, so the grouping key is the head
      // word, not whichever token happens to resolve first.
      const noun = candidates.find(token => token.morph.startsWith("N-"));
      return (noun ?? candidates[0])?.lemma ?? null;
    },
    [verseTokenWordMapCache, wordsByVerse]
  );


  const emphasisGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        nounText: string;
        nounLemma: string | null;
        count: number;
        entries: { participleId: string; participleSurface: string; reference: string; nounReference: string }[];
      }
    >();

    for (const [participleId, obs] of Object.entries(participleObservations)) {
      if (obs.agreesWithNoun !== "yes" || !obs.describedNounSpan?.length) continue;
      const firstWord = wordById.get(obs.describedNounSpan[0]);
      if (!firstWord) continue;
      const verseWords = wordsByVerse.get(`${firstWord.chapter}:${firstWord.verse}`) ?? [];
      const verseText = verseTextByKey.get(`${firstWord.chapter}:${firstWord.verse}`) ?? "";
      const nounText = formatClauseSpan(obs.describedNounSpan, verseWords, verseText);
      if (!nounText) continue;

      const nounLemma = resolveNounLemma(firstWord.chapter, firstWord.verse, obs.describedNounSpan);
      // Fallback key (word-span) only fires on a genuine lemma-lookup gap —
      // still exact/unambiguous, just not lemma-grouped for that one row.
      const key = nounLemma ?? `span:${obs.describedNounSpan.join(",")}`;

      const participleWord = wordByParticipleId.get(participleId);
      const entry = {
        participleId,
        participleSurface: participleWord?.participleSurface ?? participleWord?.text ?? "",
        reference: participleWord ? `Tito ${participleWord.chapter}:${participleWord.verse}` : "",
        nounReference: `Tito ${firstWord.chapter}:${firstWord.verse}`
      };

      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.entries.push(entry);
      } else {
        groups.set(key, { nounText, nounLemma, count: 1, entries: [entry] });
      }
    }

    const results = Array.from(groups.values()).sort((a, b) => b.count - a.count);

    // Flag rows whose Spanish gloss matches another row's exactly but whose
    // Greek lemma doesn't — two different Greek words translating the same
    // way, kept as separate rows on purpose (lemma is the grouping key now,
    // gloss never is).
    const textCounts = new Map<string, number>();
    for (const group of results) {
      const normalized = group.nounText.trim().toLowerCase();
      textCounts.set(normalized, (textCounts.get(normalized) ?? 0) + 1);
    }

    return results.map(group => ({
      ...group,
      sharesGlossWithOther: (textCounts.get(group.nounText.trim().toLowerCase()) ?? 0) > 1
    }));
  }, [participleObservations, resolveNounLemma, verseTextByKey, wordById, wordByParticipleId, wordsByVerse]);

  // Cast: substantival participles grouped by lemma (available — every
  // participle carries its own Greek lemma from morphology), split by
  // whether the same category recurs or appears once.
  const castGroups = useMemo(() => {
    const groups = new Map<
      string,
      { lemma: string; textSample: string; count: number; entries: { participleId: string; text: string; reference: string }[] }
    >();

    for (const [participleId, obs] of Object.entries(participleObservations)) {
      if (obs.standsAlone !== "yes") continue;
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      const lemma = word.participleLemma || word.participleSurface || participleId;
      const text = word.participleSurface ?? word.text;
      const entry = { participleId, text, reference: `Tito ${word.chapter}:${word.verse}` };

      const existing = groups.get(lemma);
      if (existing) {
        existing.count += 1;
        existing.entries.push(entry);
      } else {
        groups.set(lemma, { lemma, textSample: text, count: 1, entries: [entry] });
      }
    }

    const all = Array.from(groups.values());
    return {
      recurring: all.filter(group => group.count > 1).sort((a, b) => b.count - a.count),
      single: all.filter(group => group.count === 1)
    };
  }, [participleObservations, wordByParticipleId]);

  // Flow: circumstantial participles tallied against the root clause whose
  // stretch of text they fall within — walking up from wherever they ride,
  // not just direct attachment, so a dependent clause several levels down
  // still counts toward its root's total.
  const flowTallies = useMemo(() => {
    const tallies = new Map<
      string,
      { count: number; entries: { participleId: string; text: string; reference: string; ridingClauseId: string }[] }
    >();

    for (const [participleId, obs] of Object.entries(participleObservations)) {
      if (obs.ridesFiniteVerb !== "yes" || !obs.ridingClauseId) continue;
      const rootId = findRootAncestor(obs.ridingClauseId, clauseSpanInfos, augmentedObservations);
      if (!rootId) continue;

      const word = wordByParticipleId.get(participleId);
      const entry = {
        participleId,
        text: word?.participleSurface ?? word?.text ?? "",
        reference: word ? `Tito ${word.chapter}:${word.verse}` : "",
        ridingClauseId: obs.ridingClauseId
      };

      const existing = tallies.get(rootId);
      if (existing) {
        existing.count += 1;
        existing.entries.push(entry);
      } else {
        tallies.set(rootId, { count: 1, entries: [entry] });
      }
    }

    return tallies;
  }, [augmentedObservations, clauseSpanInfos, participleObservations, wordByParticipleId]);

  const maxFlowCount = useMemo(
    () => Math.max(1, ...Array.from(flowTallies.values()).map(tally => tally.count)),
    [flowTallies]
  );

  const wordIdToClauseId = useMemo(() => {
    const index = new Map<string, string>();
    for (const row of reviewClauseRows) {
      if (!row.finiteVerb.finiteVerbId) continue;
      for (const word of row.selectedWords) {
        if (!index.has(word.id)) index.set(word.id, row.finiteVerb.finiteVerbId);
      }
    }
    return index;
  }, [reviewClauseRows]);

  // Not every marked participle's own word lands inside the clause span a
  // student selected — spans mark what was judged core to the clause, and a
  // participle riding alongside it (or describing a noun elsewhere in the
  // verse) often sits just outside that boundary. Rather than losing those
  // participles, attach each one to whichever clause row in its own verse is
  // positionally closest. A verse with no finite verb at all has no clause to
  // attach to (null) — those are sorted from their own standalone list.
  const participleClauseAssignment = useMemo(() => {
    const assignment = new Map<string, string | null>();
    const rowsByVerse = new Map<string, ClauseOutputRow[]>();
    for (const row of reviewClauseRows) {
      if (!row.finiteVerb.finiteVerbId) continue;
      const verseKey = `${row.finiteVerb.chapter}:${row.finiteVerb.verse}`;
      const list = rowsByVerse.get(verseKey) ?? [];
      list.push(row);
      rowsByVerse.set(verseKey, list);
    }

    for (const participleId of participleMarkedAlignmentIds) {
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;

      const exactClauseId = wordIdToClauseId.get(word.id);
      if (exactClauseId) {
        assignment.set(participleId, exactClauseId);
        continue;
      }

      const candidates = rowsByVerse.get(`${word.chapter}:${word.verse}`) ?? [];
      let nearestId: string | null = null;
      let nearestDistance = Infinity;
      for (const row of candidates) {
        for (const selected of row.selectedWords) {
          if (selected.chapter !== word.chapter || selected.verse !== word.verse) continue;
          const distance = Math.abs(selected.index - word.index);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestId = row.finiteVerb.finiteVerbId ?? null;
          }
        }
      }
      assignment.set(participleId, nearestId);
    }

    return assignment;
  }, [participleMarkedAlignmentIds, reviewClauseRows, wordByParticipleId, wordIdToClauseId]);

  // A ground-truth Brick 4 mark that never resolves to any Spanish word is a
  // data bug (an alignment gap), not an unsorted candidate — it would
  // otherwise vanish silently everywhere, with the count just quietly one
  // short and nothing to click on. Surfaced loudly instead.
  const unresolvedParticipleIds = useMemo(() => {
    const ids: string[] = [];
    for (const participleId of participleMarkedAlignmentIds) {
      if (!wordByParticipleId.get(participleId)) ids.push(participleId);
    }
    return ids.sort();
  }, [participleMarkedAlignmentIds, wordByParticipleId]);

  const standaloneParticipleGroups = useMemo(() => {
    const groups = new Map<string, { reference: string; chapter: number; verse: number; entries: SpanishWord[] }>();
    for (const participleId of participleMarkedAlignmentIds) {
      if (participleClauseAssignment.get(participleId) !== null) continue;
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      const verseKey = `${word.chapter}:${word.verse}`;
      const existing = groups.get(verseKey);
      if (existing) {
        existing.entries.push(word);
      } else {
        groups.set(verseKey, { reference: `Tito ${word.chapter}:${word.verse}`, chapter: word.chapter, verse: word.verse, entries: [word] });
      }
    }
    return Array.from(groups.values())
      .sort((a, b) => a.chapter * 1000 + a.verse - (b.chapter * 1000 + b.verse))
      .map(group => ({ ...group, entries: group.entries.sort((a, b) => a.index - b.index) }));
  }, [participleClauseAssignment, participleMarkedAlignmentIds, wordByParticipleId]);

  // Every marked participle still missing a classification, book order,
  // wherever it happens to live — clause-attached participles only ever
  // surface inside that one clause's own panel otherwise, so with marks
  // scattered across dozens of clauses there's no other way to see the
  // whole to-do list at a glance.
  const unsortedParticiples = useMemo(() => {
    const entries: { participleId: string; word: SpanishWord; clauseId: string | null }[] = [];
    for (const participleId of participleMarkedAlignmentIds) {
      if (resolveParticipleClassification(participleObservations[participleId])) continue;
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      entries.push({ participleId, word, clauseId: participleClauseAssignment.get(participleId) ?? null });
    }
    return entries.sort((a, b) => a.word.chapter * 100000 + a.word.verse * 1000 + a.word.index - (b.word.chapter * 100000 + b.word.verse * 1000 + b.word.index));
  }, [participleClauseAssignment, participleMarkedAlignmentIds, participleObservations, wordByParticipleId]);

  const jumpToUnsortedParticiple = useCallback((entry: { participleId: string; clauseId: string | null }) => {
    setView("clauses");
    if (entry.clauseId) {
      setActiveBeginningVerbId(entry.clauseId);
      setActiveParticipleId(entry.participleId);
    } else {
      setActiveStandaloneParticipleId(entry.participleId);
    }
  }, []);

  const jumpToParticipleClause = useCallback(
    (participleId: string) => {
      const clauseId = participleClauseAssignment.get(participleId);
      if (!clauseId) return;
      setView("clauses");
      setActiveBeginningVerbId(clauseId);
    },
    [participleClauseAssignment]
  );

  // Only participles Brick 4 actually found (and confirmed via morphology)
  // show up here to sort — this view trusts Brick 4's marks as given. Uses
  // participleClauseAssignment rather than this clause's own selected span,
  // since a marked participle's word often sits just outside that span.
  const activeParticiples = useMemo(() => {
    const clauseId = activeBeginningRow?.finiteVerb.finiteVerbId;
    if (!clauseId) return [];
    const words: SpanishWord[] = [];
    for (const participleId of participleMarkedAlignmentIds) {
      if (participleClauseAssignment.get(participleId) !== clauseId) continue;
      const word = wordByParticipleId.get(participleId);
      if (word) words.push(word);
    }
    return words.sort((a, b) => a.index - b.index);
  }, [activeBeginningRow, participleClauseAssignment, participleMarkedAlignmentIds, wordByParticipleId]);

  const activeParticipleWord = activeParticipleId ? wordByParticipleId.get(activeParticipleId) ?? null : null;
  const activeParticipleObservation = activeParticipleId ? participleObservations[activeParticipleId] ?? {} : {};

  const updateParticipleObservation = useCallback((participleId: string, patch: ParticipleObservation) => {
    setParticipleObservations(current => {
      const next = {
        ...current,
        [participleId]: {
          ...(current[participleId] ?? {}),
          ...patch
        }
      };
      writeParticipleObservations(next);
      return next;
    });
  }, []);

  const updateActiveParticipleObservation = useCallback(
    (patch: ParticipleObservation) => {
      if (!activeParticipleId) return;
      updateParticipleObservation(activeParticipleId, patch);
    },
    [activeParticipleId, updateParticipleObservation]
  );

  const participleDescribedNounText = useMemo(() => {
    const span = activeParticipleObservation.describedNounSpan ?? [];
    if (!span.length) return "";
    const firstWord = wordById.get(span[0]);
    if (!firstWord) return "";
    const verseWords = wordsByVerse.get(`${firstWord.chapter}:${firstWord.verse}`) ?? [];
    const verseText = verseTextByKey.get(`${firstWord.chapter}:${firstWord.verse}`) ?? "";
    return formatClauseSpan(span, verseWords, verseText);
  }, [activeParticipleObservation.describedNounSpan, verseTextByKey, wordById, wordsByVerse]);

  const selectParticipleNounWord = useCallback(
    (word: SpanishWord, event: MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && participleNounAnchorId) {
        const anchor = wordById.get(participleNounAnchorId);
        if (anchor) {
          const span = spanFromRange(anchor, word);
          if (span) updateActiveParticipleObservation({ describedNounSpan: span });
          return;
        }
      }
      setParticipleNounAnchorId(word.id);
      updateActiveParticipleObservation({ describedNounSpan: [word.id] });
    },
    [participleNounAnchorId, updateActiveParticipleObservation, wordById]
  );

  const chooseParticipleAttributive = useCallback(() => {
    updateActiveParticipleObservation({ agreesWithNoun: "yes" });
  }, [updateActiveParticipleObservation]);

  const chooseParticipleSubstantival = useCallback(() => {
    updateActiveParticipleObservation({ agreesWithNoun: "no", standsAlone: "yes" });
  }, [updateActiveParticipleObservation]);

  const chooseParticipleCircumstantial = useCallback(() => {
    if (!activeBeginningRow?.finiteVerb.finiteVerbId) return;
    updateActiveParticipleObservation({
      agreesWithNoun: "no",
      standsAlone: "no",
      ridesFiniteVerb: "yes",
      ridingClauseId: activeBeginningRow.finiteVerb.finiteVerbId
    });
  }, [activeBeginningRow, updateActiveParticipleObservation]);

  const resetParticipleObservation = useCallback(() => {
    updateActiveParticipleObservation({
      agreesWithNoun: undefined,
      describedNounSpan: [],
      standsAlone: undefined,
      ridesFiniteVerb: undefined,
      ridingClauseId: undefined
    });
    setParticipleNounAnchorId(null);
  }, [updateActiveParticipleObservation]);

  // Standalone participles — those whose verse has no finite verb at all, so
  // there's no clause context for a "rides this clause's finite verb" answer.
  // Attributive/substantival still apply (a participle can describe a nearby
  // noun, or stand alone naming someone, independent of any clause); only
  // circumstantial is withheld here since there's no finite verb to ride.
  const activeStandaloneWord = activeStandaloneParticipleId ? wordByParticipleId.get(activeStandaloneParticipleId) ?? null : null;
  const activeStandaloneObservation = activeStandaloneParticipleId ? participleObservations[activeStandaloneParticipleId] ?? {} : {};

  const standaloneDescribedNounText = useMemo(() => {
    const span = activeStandaloneObservation.describedNounSpan ?? [];
    if (!span.length) return "";
    const firstWord = wordById.get(span[0]);
    if (!firstWord) return "";
    const verseWords = wordsByVerse.get(`${firstWord.chapter}:${firstWord.verse}`) ?? [];
    const verseText = verseTextByKey.get(`${firstWord.chapter}:${firstWord.verse}`) ?? "";
    return formatClauseSpan(span, verseWords, verseText);
  }, [activeStandaloneObservation.describedNounSpan, verseTextByKey, wordById, wordsByVerse]);

  const standaloneContextVerses = useMemo(() => {
    if (!activeStandaloneWord) return [];
    return verses.filter(verse => {
      if (verse.chapter !== activeStandaloneWord.chapter) return false;
      return Math.abs(verse.verse - activeStandaloneWord.verse) <= 1;
    });
  }, [activeStandaloneWord, verses]);

  const selectStandaloneNounWord = useCallback(
    (word: SpanishWord, event: MouseEvent<HTMLButtonElement>) => {
      if (!activeStandaloneParticipleId) return;
      if (event.shiftKey && participleNounAnchorId) {
        const anchor = wordById.get(participleNounAnchorId);
        if (anchor) {
          const span = spanFromRange(anchor, word);
          if (span) updateParticipleObservation(activeStandaloneParticipleId, { describedNounSpan: span });
          return;
        }
      }
      setParticipleNounAnchorId(word.id);
      updateParticipleObservation(activeStandaloneParticipleId, { describedNounSpan: [word.id] });
    },
    [activeStandaloneParticipleId, participleNounAnchorId, updateParticipleObservation, wordById]
  );

  const chooseStandaloneAttributive = useCallback(() => {
    if (!activeStandaloneParticipleId) return;
    updateParticipleObservation(activeStandaloneParticipleId, { agreesWithNoun: "yes" });
  }, [activeStandaloneParticipleId, updateParticipleObservation]);

  const chooseStandaloneSubstantival = useCallback(() => {
    if (!activeStandaloneParticipleId) return;
    updateParticipleObservation(activeStandaloneParticipleId, { agreesWithNoun: "no", standsAlone: "yes" });
  }, [activeStandaloneParticipleId, updateParticipleObservation]);

  const resetStandaloneParticipleObservation = useCallback(() => {
    if (!activeStandaloneParticipleId) return;
    updateParticipleObservation(activeStandaloneParticipleId, {
      agreesWithNoun: undefined,
      describedNounSpan: [],
      standsAlone: undefined,
      ridesFiniteVerb: undefined,
      ridingClauseId: undefined
    });
    setParticipleNounAnchorId(null);
  }, [activeStandaloneParticipleId, updateParticipleObservation]);

  // Genitive case + not the object of a preposition (checked in Greek word
  // order at data-build time — see clause-data.ts, since Spanish word order
  // doesn't preserve this) is the surface pattern for a genitive absolute —
  // flagged for the student to evaluate, never auto-classified as one.
  function isPossibleGenitiveAbsolute(word: SpanishWord): boolean {
    return word.participleCase === "G" && !word.participlePrecededByPreposition;
  }

  // Sequence — Reason / Statement / Imperative / Purpose / Recipient, one entry per root
  // clause, book order. Everything here is computed from data already
  // collected elsewhere (frameType, mood brick marks, participle
  // classifications); nothing new is detected or tagged.
  const statementMarkedIds = useMemo(() => readMarkedAlignmentIds(STATEMENT_MARKS_KEY), []);
  const imperativeMarkedIds = useMemo(() => readMarkedAlignmentIds(COMMAND_MARKS_KEY), []);

  // A reason clause can sit several levels under the root it justifies, not
  // just directly attached to it — same reasoning as Flow's circumstantial-
  // participle tallying, so it walks the full ancestor chain rather than
  // stopping at one hop.
  const rootReasonIds = useMemo(() => {
    const ids = new Set<string>();
    for (const clause of clauseSpanInfos) {
      const resolved = resolveClause(clause, augmentedObservations[clause.finiteVerbId], clauseSpanInfos);
      if (resolved.relation !== "frame" || resolved.frameType !== "reason") continue;
      const rootId = findRootAncestor(clause.finiteVerbId, clauseSpanInfos, augmentedObservations);
      if (rootId) ids.add(rootId);
    }
    return ids;
  }, [augmentedObservations, clauseSpanInfos]);

  // Purpose stays a single direct hop — the same "directly-attached child"
  // shape deriveTelos already uses, generalized here to every qualifying
  // root instead of just the book's first one.
  const rootPurposeIds = useMemo(() => {
    const ids = new Set<string>();
    const byId = new Map(clauseSpanInfos.map(clause => [clause.finiteVerbId, clause]));
    for (const clause of clauseSpanInfos) {
      const resolved = resolveClause(clause, augmentedObservations[clause.finiteVerbId], clauseSpanInfos);
      if (resolved.relation !== "frame" || resolved.frameType !== "purpose" || !resolved.parentClauseId) continue;
      const parentClause = byId.get(resolved.parentClauseId);
      if (!parentClause) continue;
      const parentResolved = resolveClause(parentClause, augmentedObservations[parentClause.finiteVerbId], clauseSpanInfos);
      if (parentResolved.relation === "root") ids.add(resolved.parentClauseId);
    }
    return ids;
  }, [augmentedObservations, clauseSpanInfos]);

  // Statement by elimination: statement mood, and not already carrying a
  // reason (a root can't be both the thing being justified and the
  // justification itself) — the one place these four categories are
  // inherently exclusive rather than freely combinable.
  const statementRootIds = useMemo(() => {
    const ids = new Set<string>();
    for (const clause of outline) {
      if (statementMarkedIds.has(clause.finiteVerbId) && !rootReasonIds.has(clause.finiteVerbId)) {
        ids.add(clause.finiteVerbId);
      }
    }
    return ids;
  }, [outline, rootReasonIds, statementMarkedIds]);

  const imperativeRootIds = useMemo(() => {
    const ids = new Set<string>();
    for (const clause of outline) {
      if (imperativeMarkedIds.has(clause.finiteVerbId)) ids.add(clause.finiteVerbId);
    }
    return ids;
  }, [imperativeMarkedIds, outline]);

  // A genitive absolute is a real transition marker — it introduces a
  // subject different from its clause's own — surfaced here regardless of
  // how the participle itself got sorted (attributive/substantival/
  // circumstantial is the student's separate judgment call).
  const rootGenitiveAbsoluteParticiples = useMemo(() => {
    const map = new Map<string, { participleId: string; label: string; reference: string }[]>();
    for (const participleId of participleMarkedAlignmentIds) {
      const word = wordByParticipleId.get(participleId);
      if (!word || !isPossibleGenitiveAbsolute(word)) continue;
      const clauseId = participleClauseAssignment.get(participleId);
      if (!clauseId) continue;
      const rootId = findRootAncestor(clauseId, clauseSpanInfos, augmentedObservations);
      if (!rootId) continue;
      const entry = { participleId, label: participleChipLabel(word), reference: `Tito ${word.chapter}:${word.verse}` };
      const list = map.get(rootId) ?? [];
      list.push(entry);
      map.set(rootId, list);
    }
    return map;
  }, [augmentedObservations, clauseSpanInfos, participleClauseAssignment, participleMarkedAlignmentIds, wordByParticipleId]);

  // Subject-agreement note: a nominative circumstantial participle riding a
  // clause typically agrees with that clause's own subject — reuses
  // flowTallies (already root-mapped) rather than recomputing the walk.
  const rootSubjectAgreementNotes = useMemo(() => {
    const map = new Map<string, { participleId: string; text: string; reference: string }[]>();
    for (const [rootId, tally] of flowTallies) {
      const nominativeEntries = tally.entries.filter(entry => wordByParticipleId.get(entry.participleId)?.participleCase === "N");
      if (nominativeEntries.length) map.set(rootId, nominativeEntries);
    }
    return map;
  }, [flowTallies, wordByParticipleId]);

  // Brick 2B keeps its original purpose — who an imperative is addressed to —
  // read-only here, same as every other Sequence category.
  const recipientAssignments = useMemo(() => readCommandRecipientAssignments(), []);

  const sequenceEntries = useMemo(() => {
    const base = outline.map(clause => ({
      finiteVerbId: clause.finiteVerbId,
      reference: clause.reference,
      spanText: clause.spanText,
      isReason: rootReasonIds.has(clause.finiteVerbId),
      isStatement: statementRootIds.has(clause.finiteVerbId),
      isImperative: imperativeRootIds.has(clause.finiteVerbId),
      isPurpose: rootPurposeIds.has(clause.finiteVerbId),
      recipient: recipientAssignments.get(clause.finiteVerbId) ?? null,
      subjectAgreementNotes: rootSubjectAgreementNotes.get(clause.finiteVerbId) ?? [],
      genitiveAbsoluteParticiples: rootGenitiveAbsoluteParticiples.get(clause.finiteVerbId) ?? []
    }));

    // A run of consecutive same-recipient imperatives (Titus 2's older
    // men/older women/young women/... sequence) is itself an observable
    // pattern — flagged so the render can group it visually without
    // collapsing any entry out of the list. Start/end are tracked
    // separately from mid-run membership so the accent can read as one
    // bracket that opens at the first shared recipient and closes at the
    // last, instead of every member looking independently indented.
    return base.map((entry, index) => {
      const matchesPrev = Boolean(entry.recipient) && entry.recipient === base[index - 1]?.recipient;
      const matchesNext = Boolean(entry.recipient) && entry.recipient === base[index + 1]?.recipient;
      return {
        ...entry,
        isRecipientRunMember: matchesPrev || matchesNext,
        isRecipientRunStart: matchesNext && !matchesPrev,
        isRecipientRunEnd: matchesPrev && !matchesNext
      };
    });
  }, [
    imperativeRootIds,
    outline,
    recipientAssignments,
    rootGenitiveAbsoluteParticiples,
    rootPurposeIds,
    rootReasonIds,
    rootSubjectAgreementNotes,
    statementRootIds
  ]);

  // Sequence-view-spec.md's own words: "not a separate screen from the
  // Skeleton either, it's the Skeleton's rows carrying more information."
  // Looked up by renderSkeletonNode for root nodes only — sequenceEntries is
  // built from `outline` (root clauses only), so a non-root node simply has
  // no entry here.
  const sequenceEntryByFiniteVerbId = useMemo(
    () => new Map(sequenceEntries.map(entry => [entry.finiteVerbId, entry])),
    [sequenceEntries]
  );

  useEffect(() => {
    if (view !== "clauses" || activeBeginningVerbId || !reviewClauseRows.length) return;
    const firstOpenRow =
      reviewClauseRows.find(row => getClauseReviewState(row) === "Unreviewed") ?? reviewClauseRows[0];
    setActiveBeginningVerbId(firstOpenRow.finiteVerb.finiteVerbId ?? null);
  }, [activeBeginningVerbId, getClauseReviewState, reviewClauseRows, view]);

  useEffect(() => {
    setForceChoices(false);
    setShowGreekBeginning(false);
    setNounAnchorId(null);
    setAutoAdvancedNoticeId(autoAdvanceRef.current ? activeBeginningVerbId : null);
    autoAdvanceRef.current = false;
  }, [activeBeginningVerbId]);

  const selectVerb = useCallback(
    (verb: SpanishWord) => {
      if (!verb.finiteVerbId) return;
      setActiveVerbId(verb.finiteVerbId);

      const verbToken = parseGreekTokenId(verb.finiteVerbId);
      const existing = assignments[verb.finiteVerbId];
      const existingRange =
        existing?.greekStartTokenId && existing.greekEndTokenId
          ? { start: parseGreekTokenId(existing.greekStartTokenId), end: parseGreekTokenId(existing.greekEndTokenId) }
          : null;

      if (existingRange?.start && existingRange.end) {
        setDraftGreekRange({ start: existingRange.start.token, end: existingRange.end.token });
        setGreekRangeAnchorToken(existingRange.start.token);
      } else if (verbToken) {
        setDraftGreekRange({ start: verbToken.token, end: verbToken.token });
        setGreekRangeAnchorToken(verbToken.token);
      } else {
        setDraftGreekRange(null);
        setGreekRangeAnchorToken(null);
      }

      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-clause-word-id="${verb.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }, 20);
    },
    [assignments]
  );

  // Greek tokens are already sequential per verse, so extending a range is
  // just a numeric min/max — no per-word lookup needed the way the old
  // Spanish spanFromRange required.
  const applyGreekRange = useCallback(
    (chapter: number, verse: number, startToken: number, endToken: number) => {
      if (!activeVerb) return;
      if (chapter !== activeVerb.chapter || verse !== activeVerb.verse) return;
      setDraftGreekRange({ start: Math.min(startToken, endToken), end: Math.max(startToken, endToken) });
    },
    [activeVerb]
  );

  const handleGreekTokenClick = useCallback(
    (chapter: number, verse: number, token: number, event: MouseEvent<HTMLButtonElement>) => {
      const isInActiveVerse = activeVerb && chapter === activeVerb.chapter && verse === activeVerb.verse;

      if (event.shiftKey && isInActiveVerse) {
        const anchor = greekRangeAnchorToken ?? parseGreekTokenId(activeVerb.finiteVerbId ?? "")?.token;
        if (anchor !== undefined) applyGreekRange(chapter, verse, anchor, token);
        return;
      }

      const candidateVerb = finiteVerbByAlignmentId.get(`${chapter}:${verse}:${token}`);
      if (candidateVerb) {
        selectVerb(candidateVerb);
        return;
      }

      if (!isInActiveVerse) return;
      applyGreekRange(chapter, verse, token, token);
      setGreekRangeAnchorToken(token);
    },
    [activeVerb, applyGreekRange, finiteVerbByAlignmentId, greekRangeAnchorToken, selectVerb]
  );

  const clearDraft = useCallback(() => {
    setDraftGreekRange(null);
    setGreekRangeAnchorToken(null);
  }, []);

  const saveActive = useCallback(() => {
    if (!activeVerbId || !activeVerb || !draftGreekRange) return;
    const greekStartTokenId = `${activeVerb.chapter}:${activeVerb.verse}:${draftGreekRange.start}`;
    const greekEndTokenId = `${activeVerb.chapter}:${activeVerb.verse}:${draftGreekRange.end}`;

    setAssignments(current => {
      const next = {
        ...current,
        [activeVerbId]: {
          finiteVerbId: activeVerbId,
          selectedSpan: draftSpan,
          greekStartTokenId,
          greekEndTokenId,
          // A real human just went through the Greek-token interaction to
          // produce this save — genuinely re-confirmed, not just carrying
          // pre-migration data. See ClauseAssignment.greekConfirmedAt.
          greekConfirmedAt: new Date().toISOString()
        }
      };
      writeClauseAssignments(next);
      return next;
    });
    setActiveVerbId(null);
    setDraftGreekRange(null);
    setGreekRangeAnchorToken(null);
  }, [activeVerb, activeVerbId, draftGreekRange, draftSpan]);

  useEffect(() => {
    if (!activeVerbId) return;
    const existing = assignments[activeVerbId];
    if (existing?.greekStartTokenId && existing.greekEndTokenId) {
      const start = parseGreekTokenId(existing.greekStartTokenId);
      const end = parseGreekTokenId(existing.greekEndTokenId);
      if (start && end) {
        setDraftGreekRange({ start: start.token, end: end.token });
        return;
      }
    }
    setDraftGreekRange(null);
  }, [activeVerbId, assignments]);

  const inspectClauseBeginning = useCallback((row: ClauseOutputRow) => {
    if (!row.finiteVerb.finiteVerbId) return;
    setActiveBeginningVerbId(row.finiteVerb.finiteVerbId);
  }, []);

  const updateActiveObservation = useCallback(
    (patch: ClauseObservation) => {
      if (!activeBeginningVerbId) return;
      setObservations(current => {
        const next = {
          ...current,
          [activeBeginningVerbId]: {
            ...(current[activeBeginningVerbId] ?? {}),
            ...patch
          }
        };
        writeClauseObservations(next);
        return next;
      });
    },
    [activeBeginningVerbId]
  );

  // Confirming a clause moves focus to the next one automatically — a real
  // navigation, not a no-op, even though nothing on screen used to say so
  // (clause-review-focus-bug-and-interaction-model.md item 1: this was
  // indistinguishable from staying put, or worse, from the NEW clause itself
  // asking a question). autoAdvanceRef flags the change as auto-triggered so
  // the activeBeginningVerbId effect below can show an explicit notice —
  // manual navigation (clicking a row/node directly) never sets this ref, so
  // it never gets a notice.
  const autoAdvanceRef = useRef(false);

  const moveToNextClause = useCallback(() => {
    if (!activeBeginningRow) return;
    const currentIndex = reviewClauseRows.findIndex(
      row => row.finiteVerb.finiteVerbId === activeBeginningRow.finiteVerb.finiteVerbId
    );
    const nextOpenRow =
      reviewClauseRows
        .slice(currentIndex + 1)
        .find(row => getClauseReviewState(row) === "Unreviewed") ??
      reviewClauseRows.find(row => getClauseReviewState(row) === "Unreviewed") ??
      reviewClauseRows[currentIndex + 1] ??
      reviewClauseRows[0];
    const nextId = nextOpenRow?.finiteVerb.finiteVerbId ?? null;
    autoAdvanceRef.current = Boolean(nextId) && nextId !== activeBeginningRow.finiteVerb.finiteVerbId;
    setActiveBeginningVerbId(nextId);
  }, [activeBeginningRow, getClauseReviewState, reviewClauseRows]);

  // Single-choice classification: pick one shape, first-yes-wins, no separate
  // question for the other two. Choosing "describes"/"content"/"frame" only sets
  // that field to "yes" — the other two stay unset, which is what lets the tree
  // treat a clause as resolved via any one relation rather than requiring all
  // three answered like the old fixed-order flow did.
  const chooseRoot = useCallback(() => {
    setForceChoices(false);
    updateActiveObservation({ describesNoun: "no", isWhatWasExpressed: "no", tellsWhenOrIf: "no" });
    moveToNextClause();
  }, [moveToNextClause, updateActiveObservation]);

  const chooseDescribes = useCallback(() => {
    setForceChoices(false);
    updateActiveObservation({ describesNoun: "yes" });
  }, [updateActiveObservation]);

  const chooseContent = useCallback(() => {
    setForceChoices(false);
    updateActiveObservation({ isWhatWasExpressed: "yes" });
  }, [updateActiveObservation]);

  const chooseFrame = useCallback(() => {
    setForceChoices(false);
    updateActiveObservation({ tellsWhenOrIf: "yes" });
  }, [updateActiveObservation]);

  const acceptSignal = useCallback(
    (signal: ClauseSignal) => {
      if (signal.kind !== "confident") return;
      if (signal.choice === "describes") {
        updateActiveObservation({ describesNoun: "yes" });
      } else if (signal.choice === "content") {
        updateActiveObservation({ isWhatWasExpressed: "yes", expressedParentClauseId: signal.target });
        moveToNextClause();
      } else if (signal.choice === "frame") {
        updateActiveObservation({
          tellsWhenOrIf: "yes",
          whenIfParentClauseId: signal.target,
          frameType: signal.frameType
        });
        moveToNextClause();
      }
    },
    [moveToNextClause, updateActiveObservation]
  );

  const selectExpressedParent = useCallback(
    (parentClauseId: string) => {
      updateActiveObservation({ expressedParentClauseId: parentClauseId });
    },
    [updateActiveObservation]
  );

  const selectWhenIfParent = useCallback(
    (parentClauseId: string) => {
      // No guessed default when the leading window has no recognized frame
      // particle (e.g. a bare coordinator riding on a coordinate-inherited
      // clause) — frameType stays undefined here and gets filled in, if at
      // all, by applyCoordinateInheritance downstream. A hardcoded fallback
      // (this used to default to "reason") would otherwise persist a wrong
      // label into saved data for exactly the clauses inheritance can't reach.
      updateActiveObservation({ whenIfParentClauseId: parentClauseId, frameType: activeFrameType });
    },
    [activeFrameType, updateActiveObservation]
  );

  const selectNounWord = useCallback(
    (word: SpanishWord, event: MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && nounAnchorId) {
        const anchor = wordById.get(nounAnchorId);
        if (anchor) {
          const span = spanFromRange(anchor, word);
          if (span) updateActiveObservation({ describedNounSpan: span });
          return;
        }
      }

      setNounAnchorId(word.id);
      updateActiveObservation({ describedNounSpan: [word.id] });
    },
    [activeBeginningRow, nounAnchorId, updateActiveObservation, wordById]
  );

  // Shared by renderClauseLine and renderSkeletonNode — the underline-in-place
  // participle layer (technique A, always visible) plus the toggleable
  // highlight (technique B) live on the same per-word render so a clause's
  // text looks identical everywhere it's shown. Never adds a row or indent.
  // Read-only here — identification happens in Brick 4 (Greek O-Prototype);
  // this only renders what Brick 4 already confirmed, and lets the student
  // click a confirmed participle to see its sort status / morphology.
  const renderClauseWords = useCallback(
    (words: SpanishWord[], ownFiniteVerbId: string) => {
      return words.map((word, index) => {
        const classes = ["clause-line-token"];
        if (word.finiteVerbId === ownFiniteVerbId) classes.push("clause-line-token--finite");
        if (word.dependentIntroducerId) classes.push("clause-line-token--dependent");

        const isConfirmedParticiple = Boolean(word.participleId) && participleMarkedAlignmentIds.has(word.participleId as string);

        const content = (
          <>
            {index > 0 ? " " : null}
            {word.text}
          </>
        );

        if (!isConfirmedParticiple) {
          return (
            <span className={classes.join(" ")} key={word.id}>
              {content}
            </span>
          );
        }

        const participleId = word.participleId as string;
        const classification = resolveParticipleClassification(participleObservations[participleId]);
        classes.push("clause-line-token--participle");
        classes.push(classification ? `clause-line-token--participle-${classification}` : "clause-line-token--participle-unsorted");
        if (showParticiples) classes.push("clause-line-token--participle-flow");
        const ridingClauseId = participleObservations[participleId]?.ridingClauseId;
        const ridingRow = ridingClauseId ? finiteVerbIdToRow.get(ridingClauseId) : undefined;

        // A plain span, not a button — this can render inside other buttons
        // (clause-only-item, clause-tree-node both wrap their whole line in
        // one), and nested <button> inside <button> is invalid HTML.
        return (
          <span className="clause-line-token-wrap" key={word.id}>
            {index > 0 ? " " : null}
            <span
              role="button"
              tabIndex={0}
              className={classes.filter(c => c !== "clause-line-token").join(" ")}
              onClick={event => {
                event.stopPropagation();
                setOpenParticiplePopoverId(current => (current === participleId ? null : participleId));
              }}
              onKeyDown={event => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                setOpenParticiplePopoverId(current => (current === participleId ? null : participleId));
              }}
            >
              {word.text}
            </span>
            {showParticiples && classification === "circumstantial" && ridingRow ? (
              <span className="clause-line-token-flow-tag">→ {ridingRow.reference}</span>
            ) : null}
            {openParticiplePopoverId === participleId ? (
              <span className="clause-participle-popover" role="tooltip">
                <strong>{classification ? capitalize(classification) : "Not yet sorted"}</strong>
                {classification === "circumstantial" && ridingRow ? <span> — rides {ridingRow.reference}</span> : null}
                {describeParticipleMorph(word) ? <span className="clause-participle-popover-morph">{describeParticipleMorph(word)}</span> : null}
              </span>
            ) : null}
          </span>
        );
      });
    },
    [finiteVerbIdToRow, openParticiplePopoverId, participleMarkedAlignmentIds, participleObservations, showParticiples]
  );

  const renderClauseLine = useCallback(
    (row: ClauseOutputRow) => renderClauseWords(row.selectedWords, row.finiteVerb.finiteVerbId ?? ""),
    [renderClauseWords]
  );

  const renderSkeletonNode = useCallback(
    (node: SkeletonNode) => {
      const tagLabel =
        node.relation === "describes"
          ? "Relative clause"
          : node.relation === "content"
            ? "Content clause"
            : node.relation === "frame"
              ? node.frameType
                ? `${capitalize(node.frameType)} clause`
                : "Adverbial clause"
              : node.relation === null
                ? "Not yet classified"
                : null;
      const row = finiteVerbIdToRow.get(node.finiteVerbId);
      const marker = clauseMarkers.get(node.finiteVerbId);
      // Sequence-view-spec.md: these tags/notes are the Skeleton's own root
      // rows carrying more information, not a separate screen — only ever
      // looked up for root nodes (sequenceEntryByFiniteVerbId is built from
      // root-only `outline`, so a dependent node simply won't match).
      const sequenceEntry = sequenceEntryByFiniteVerbId.get(node.finiteVerbId);
      return (
        <div
          className={[
            "clause-tree-node-wrap",
            sequenceEntry?.isRecipientRunMember ? "clause-tree-node-wrap--recipient-run" : "",
            sequenceEntry?.isRecipientRunStart ? "clause-tree-node-wrap--recipient-run-start" : "",
            sequenceEntry?.isRecipientRunEnd ? "clause-tree-node-wrap--recipient-run-end" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          key={node.finiteVerbId}
        >
          <button
            type="button"
            className={[
              "clause-tree-node",
              node.relation === null ? "clause-tree-node--placeholder" : "",
              node.finiteVerbId === activeBeginningVerbId ? "clause-tree-node--active" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setActiveBeginningVerbId(node.finiteVerbId)}
          >
            {tagLabel ? <span className="clause-tree-tag">{tagLabel}</span> : null}
            {sequenceEntry ? (
              <span className="sequence-item-tags">
                {sequenceEntry.isReason ? <span className="sequence-tag sequence-tag--reason">Reason</span> : null}
                {sequenceEntry.isStatement ? <span className="sequence-tag sequence-tag--statement">Statement</span> : null}
                {sequenceEntry.isImperative ? <span className="sequence-tag sequence-tag--imperative">Imperative</span> : null}
                {sequenceEntry.isImperative && sequenceEntry.recipient ? (
                  <span className="sequence-tag sequence-tag--recipient">{sequenceEntry.recipient}</span>
                ) : null}
                {sequenceEntry.isPurpose ? <span className="sequence-tag sequence-tag--purpose">Purpose</span> : null}
              </span>
            ) : null}
            <span className="clause-tree-text">
              {row ? renderClauseWords(row.selectedWords, node.finiteVerbId) : node.spanText || node.reference}
            </span>
            {marker ? (
              <span className="clause-marker-line">
                “{marker.word}” — {marker.type === "relational" ? "conector relacional" : "marcador subordinante"} ·{" "}
                {marker.subtype}
              </span>
            ) : null}
          </button>
          {sequenceEntry?.genitiveAbsoluteParticiples.length ? (
            <p className="sequence-genitive-flag">
              Genitive absolute here — introduces its own subject, different from this clause's:{" "}
              {sequenceEntry.genitiveAbsoluteParticiples.map((participle, index) => (
                <span key={participle.participleId}>
                  {index > 0 ? ", " : ""}
                  <button
                    type="button"
                    className="participle-view-ref"
                    onClick={() => jumpToParticipleClause(participle.participleId)}
                  >
                    {participle.label} — {participle.reference}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
          {sequenceEntry?.subjectAgreementNotes.length ? (
            <p className="sequence-subject-note">
              Nominative participle riding here — likely agrees with this clause's subject:{" "}
              {sequenceEntry.subjectAgreementNotes.map((note, index) => (
                <span key={note.participleId}>
                  {index > 0 ? ", " : ""}
                  <button
                    type="button"
                    className="participle-view-ref"
                    onClick={() => jumpToParticipleClause(note.participleId)}
                  >
                    {note.text} — {note.reference}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
          {node.children.length ? (
            <div className="clause-tree-children">{node.children.map(renderSkeletonNode)}</div>
          ) : null}
        </div>
      );
    },
    [activeBeginningVerbId, clauseMarkers, finiteVerbIdToRow, jumpToParticipleClause, renderClauseWords, sequenceEntryByFiniteVerbId]
  );

  return (
    <main className="clause-builder">
      <header className="clause-builder-header">
        <p className="reader-kicker">Prototype</p>
        <h1>Tito</h1>
        <p className="clause-builder-scope">Titus · LBF</p>
      </header>

      <div className="clause-view-switch" aria-label="Clause workspace view">
        <button
          type="button"
          className={view === "passage" ? "clause-view-option clause-view-option--active" : "clause-view-option"}
          onClick={() => setView("passage")}
        >
          Passage
        </button>
        <button
          type="button"
          className={view === "clauses" ? "clause-view-option clause-view-option--active" : "clause-view-option"}
          onClick={() => setView("clauses")}
          disabled={!savedClauseRows.length}
        >
          Clause Workspace
        </button>
        <button
          type="button"
          className={view === "participle-views" ? "clause-view-option clause-view-option--active" : "clause-view-option"}
          onClick={() => setView("participle-views")}
          disabled={!savedClauseRows.length}
        >
          Participle Views
        </button>
      </div>

      {view === "passage" ? (
        <div className="clause-workspace">
        <section className="clause-builder-body" aria-label="Greek text of Titus, Spanish alongside">
          {verses.map(verse => {
            const verseTokens = getVerseInterlinear(verse.chapter, verse.verse);
            const isActiveVerse = Boolean(activeVerb && activeVerb.chapter === verse.chapter && activeVerb.verse === verse.verse);

            return (
              <article className="clause-verse" key={`${verse.chapter}:${verse.verse}`}>
                <p className="clause-verse-label">{verse.verse}</p>

                {/* Greek is the tap target and the authoritative span now
                    (clause-selection-greek-spec.md) — Spanish below is a
                    comprehension aid, not something a click defines. */}
                <p className="clause-greek-row">
                  {verseTokens.map((token, index) => {
                    const tokenNumber = index + 1;
                    const tokenId = `${verse.chapter}:${verse.verse}:${tokenNumber}`;
                    const isVerbToken = finiteVerbByAlignmentId.has(tokenId);
                    const isActiveToken = activeVerbId === tokenId;
                    const inDraft =
                      isActiveVerse &&
                      Boolean(draftGreekRange) &&
                      tokenNumber >= (draftGreekRange?.start ?? Infinity) &&
                      tokenNumber <= (draftGreekRange?.end ?? -Infinity);
                    const inSaved = savedGreekTokenIds.has(tokenId);
                    const overlaps = overlapGreekTokenIds.has(tokenId);

                    let className = "clause-greek-token";
                    if (isVerbToken) className += " clause-greek-token--verb";
                    if (isActiveToken) className += " clause-greek-token--active-verb";
                    if (inDraft) className += " clause-greek-token--belonging";
                    if (inSaved && !inDraft && !isActiveToken) className += " clause-greek-token--saved";
                    if (overlaps) className += " clause-greek-token--overlap";

                    return (
                      <button
                        type="button"
                        key={tokenId}
                        className={className}
                        onClick={event => handleGreekTokenClick(verse.chapter, verse.verse, tokenNumber, event)}
                        aria-pressed={isActiveToken || inDraft}
                        data-token-id={tokenId}
                        disabled={!isVerbToken && !isActiveVerse}
                      >
                        <span className="clause-greek-token-surface">{token.surface.replace(/[⸀⸁⸂⸃,.;·]/g, "")}</span>
                        <span className="clause-greek-token-gloss">{token.gloss}</span>
                        <span className="token-detail-popover" role="tooltip">
                          <span className="token-detail-entry">
                            {token.lemma !== token.surface ? (
                              <span className="token-detail-lemma">{token.lemma}</span>
                            ) : null}
                            <span className="token-detail-strongs">{token.strongs}</span>
                            <span className="token-detail-morph-desc">{describeRmac(token.morph)}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </p>

                <p className="clause-verse-text clause-verse-text--reference">
                  {verse.words.map((word, position) => {
                    const isActiveVerb = Boolean(activeVerbId && word.finiteVerbId === activeVerbId);
                    const inDraft = wordInSpan(word, draftSpan);
                    const isSavedVerb = Boolean(word.finiteVerbId && assignments[word.finiteVerbId]?.selectedSpan.length);
                    const inSaved = savedWordIds.has(word.id);
                    const overlaps = overlapWordIds.has(word.id);

                    let className = "clause-word clause-word--reference";
                    if (word.finiteVerbId) className += " clause-word--verb";
                    if (isSavedVerb) className += " clause-word--verb-saved";
                    if (isActiveVerb) className += " clause-word--active-verb";
                    if (inDraft) className += " clause-word--belonging";
                    if (inSaved && !inDraft && !isActiveVerb) className += " clause-word--saved";
                    if (overlaps) className += " clause-word--overlap";

                    return (
                      <span className={className} key={word.id}>
                        {position > 0 ? " " : null}
                        {word.text}
                      </span>
                    );
                  })}
                </p>
              </article>
            );
          })}
        </section>

        <aside className="clause-output" aria-label="Clause output">
          <section className="clause-output-section" aria-labelledby="clause-register-heading">
            <h2 id="clause-register-heading">Clause Register</h2>
            <div className="clause-register-list">
              {clauseRows.length ? (
                clauseRows.map(row => (
                  <button
                    type="button"
                    className={`clause-register-item${row.finiteVerb.finiteVerbId === activeVerbId ? " clause-register-item--active" : ""}`}
                    key={row.finiteVerb.finiteVerbId}
                    onClick={() => selectVerb(row.finiteVerb)}
                  >
                    <span className="clause-output-meta">
                      {row.reference} · {row.finiteVerb.text}
                    </span>
                    <span className={row.spanText ? "clause-register-span" : "clause-register-span clause-register-span--empty"}>
                      {row.spanText || "Unsaved"}
                    </span>
                  </button>
                ))
              ) : (
                <p className="clause-output-empty">No Brick 1 finite verbs marked yet.</p>
              )}
            </div>
          </section>

          <section className="clause-output-section" aria-labelledby="clause-reader-heading">
            <h2 id="clause-reader-heading">Clause Reader</h2>
            <div className="clause-chain">
              {savedClauseRows.length ? (
                savedClauseRows.map(row => (
                  <p
                    className="clause-chain-line"
                    key={row.finiteVerb.finiteVerbId}
                  >
                    <span className="clause-output-meta">
                      {row.reference} · {row.finiteVerb.text}
                    </span>
                    <span>{row.spanText}</span>
                  </p>
                ))
              ) : (
                <p className="clause-output-empty">No saved spans yet.</p>
              )}
            </div>
          </section>
        </aside>
        </div>
      ) : view === "clauses" ? (
        <section className="clause-only-view" aria-labelledby="clause-only-heading">
          <div className="clause-only-header">
            <div>
              <h2 id="clause-only-heading">Clause Workspace</h2>
              <p>{reviewedCount} of {reviewClauseRows.length} mood-tagged clauses reviewed</p>
            </div>
            <label className="clause-dependent-toggle">
              <input
                type="checkbox"
                checked={showDependentLines}
                onChange={event => setShowDependentLines(event.currentTarget.checked)}
              />
              <span>Show attached clauses</span>
            </label>
            <button type="button" className="clause-print-btn" onClick={() => window.print()}>
              Print skeleton
            </button>
            <button type="button" className="clause-clear" onClick={() => setView("passage")}>
              Back to Passage
            </button>
          </div>

          {greekSpanMismatches.length ? (
            <section className="clause-unresolved-participles" aria-label="Greek span audit">
              <h3>
                Greek span audit — {greekSpanMismatches.length} of {greekSpanAudit.length} clause{greekSpanAudit.length === 1 ? "" : "s"} drifted
              </h3>
              <p className="clause-section-note">
                Per clause-selection-greek-spec.md: each clause's stored Greek range, re-derived fresh from its
                current Spanish span, no longer matches what's actually saved — likely edited after the range was
                first computed, since it's never recomputed automatically. Not auto-corrected; each one needs
                re-selecting directly in Greek once that interaction ships.
              </p>
              {Object.entries(
                greekSpanMismatches.reduce<Record<number, typeof greekSpanMismatches>>((byChapter, entry) => {
                  (byChapter[entry.chapter] ??= []).push(entry);
                  return byChapter;
                }, {})
              ).map(([chapter, entries]) => (
                <div className="clause-audit-chapter" key={chapter}>
                  <h4>
                    Chapter {chapter} — {entries.length} of{" "}
                    {greekSpanAudit.filter(entry => String(entry.chapter) === chapter).length}
                  </h4>
                  <ul className="clause-audit-list">
                    {entries.map(entry => (
                      <li key={entry.finiteVerbId}>
                        <span className="clause-audit-ref">Tito {entry.chapter}:{entry.verse} ({entry.finiteVerbId})</span>
                        <span className="clause-audit-range">
                          stored {entry.storedRange ? `${entry.storedRange.greekStartTokenId}–${entry.storedRange.greekEndTokenId}` : "none"}
                          {" → "}
                          derived {entry.derivedRange ? `${entry.derivedRange.greekStartTokenId}–${entry.derivedRange.greekEndTokenId}` : "none"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}

          <section className="clause-unresolved-participles" aria-label="Greek re-confirmation progress">
            <h3>
              Greek re-confirmation — {greekReconfirmationProgress.confirmedCount} of {greekReconfirmationProgress.total} clauses confirmed
            </h3>
            <p className="clause-section-note">
              Per clause-selection-greek-spec.md: passing the span-consistency audit above only means a clause's
              stored range matches itself — it does not mean a human has re-walked the boundary directly in Greek
              since the migration. This count only rises when a clause is re-saved through the Greek-token
              interaction. The clauses below are still carrying pre-migration confirmation.
            </p>
            {greekReconfirmationProgress.unconfirmed.length ? (
              <ul className="clause-audit-list">
                {greekReconfirmationProgress.unconfirmed.map(({ assignment, row }) => (
                  <li key={assignment.finiteVerbId}>
                    {row ? (
                      <button
                        type="button"
                        className="clause-audit-ref clause-audit-ref--link"
                        onClick={() => {
                          selectVerb(row.finiteVerb);
                          setView("passage");
                        }}
                      >
                        {row.reference} ({assignment.finiteVerbId})
                      </button>
                    ) : (
                      <span className="clause-audit-ref">{assignment.finiteVerbId}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="clause-section-note">All clauses confirmed under Greek selection.</p>
            )}
          </section>

          {relativeOfConnectionFlags.length ? (
            <section className="clause-unresolved-participles" aria-label="Relative-of-connection check">
              <h3>
                Relative-of-connection check — {relativeOfConnectionFlags.length} clause{relativeOfConnectionFlags.length === 1 ? "" : "s"} likely misclassified
              </h3>
              <p className="clause-section-note">
                Classified as a relative clause describing a nearby noun, but the noun its relative pronoun actually
                agrees with sits inside this same clause — a "relative of connection" idiom (e.g. δι' ἣν αἰτίαν, "for
                which cause" = "therefore"), not a description of something external. There's no real antecedent for
                the currently-selected noun to be; what the clause actually is instead is a genuine judgment call, not
                something to auto-fix here.
              </p>
              <ul className="clause-audit-list">
                {relativeOfConnectionFlags.map(flag => (
                  <li key={flag.finiteVerbId}>
                    <button
                      type="button"
                      className="clause-audit-ref clause-audit-ref--link"
                      onClick={() => setActiveBeginningVerbId(flag.finiteVerbId)}
                    >
                      {flag.reference} ({flag.finiteVerbId})
                    </button>
                    <span className="clause-audit-range">
                      “{flag.relativeWord}” agrees with “{flag.antecedentWord}” in its own clause
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {unresolvedParticipleIds.length ? (
            <section className="clause-unresolved-participles" aria-label="Unresolved participles">
              <h3>
                Data problem — {unresolvedParticipleIds.length} candidate{unresolvedParticipleIds.length === 1 ? "" : "s"} couldn't be matched
              </h3>
              <p className="clause-section-note">
                Marked in Brick 4, but the alignment data couldn't match {unresolvedParticipleIds.length === 1 ? "it" : "them"} to any
                Spanish word — this is a data bug, not something to sort. Reference id{unresolvedParticipleIds.length === 1 ? "" : "s"}:{" "}
                {unresolvedParticipleIds.join(", ")}
              </p>
            </section>
          ) : null}

          {unsortedParticiples.length ? (
            <section className="clause-unsorted-participles" aria-label="Unsorted participles">
              <h3>
                Unsorted participles
                <span className="clause-unsorted-count">{unsortedParticiples.length}</span>
              </h3>
              <p className="clause-section-note">
                Every marked participle still missing a classification, book order. Click one to jump straight to it.
              </p>
              <div className="clause-participle-chip-row">
                {unsortedParticiples.map(entry => (
                  <button
                    type="button"
                    key={entry.participleId}
                    className="clause-participle-chip"
                    onClick={() => jumpToUnsortedParticiple(entry)}
                  >
                    <span className="clause-unsorted-reference">
                      Tito {entry.word.chapter}:{entry.word.verse}
                    </span>
                    {participleChipLabel(entry.word)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="clause-only-workspace">
          <div className="clause-only-main">
            {activeBeginningRow ? (
              <section className="clause-review-panel" aria-label="Clause observation">
                <div className="clause-review-progress">
                  <span>{reviewedCount} of {reviewClauseRows.length} mood-tagged clauses reviewed</span>
                </div>

                {autoAdvancedNoticeId && autoAdvancedNoticeId === activeBeginningVerbId ? (
                  <p className="clause-auto-advance-notice" role="status">
                    Moved to next clause: {activeBeginningRow.reference} · {renderClauseLine(activeBeginningRow)}
                  </p>
                ) : null}

                <article className="clause-active-card">
                  <div className="clause-active-card-header">
                    <span>{activeBeginningRow.reference}</span>
                    <button
                      type="button"
                      className="clause-greek-toggle"
                      onClick={() => setShowGreekBeginning(current => !current)}
                    >
                      {showGreekBeginning ? "Hide Greek" : "View Greek"}
                    </button>
                  </div>
                  <p className="clause-active-span">{renderClauseLine(activeBeginningRow)}</p>
                </article>

                {activeParticiples.length ? (
                  <section className="clause-participles-panel" aria-label="Participles in this clause">
                    <div className="clause-participles-header">
                      <h3>
                        Participles found here
                        <ParticipleCheck confirmed={participlesConfirmed} />
                      </h3>
                      <label className="clause-dependent-toggle">
                        <input
                          type="checkbox"
                          checked={showParticiples}
                          onChange={event => setShowParticiples(event.currentTarget.checked)}
                        />
                        <span>Show participle flow</span>
                      </label>
                    </div>
                    <p className="clause-section-note">
                      Found in Brick 4 (Greek). Sort each one below — the checkmark tracks sorting across the whole book.
                    </p>
                    <div className="clause-participle-chip-row">
                      {activeParticiples.map(word => {
                        const classification = word.participleId ? resolveParticipleClassification(participleObservations[word.participleId]) : null;
                        return (
                          <button
                            type="button"
                            key={word.participleId}
                            className={[
                              "clause-participle-chip",
                              activeParticipleId === word.participleId ? "clause-participle-chip--active" : "",
                              classification ? `clause-participle-chip--${classification}` : ""
                            ].filter(Boolean).join(" ")}
                            onClick={() => setActiveParticipleId(current => (current === word.participleId ? null : word.participleId ?? null))}
                          >
                            {participleChipLabel(word)}
                            <span className="clause-participle-chip-state">{classification ?? "unsorted"}</span>
                          </button>
                        );
                      })}
                    </div>

                    {activeParticipleWord ? (
                      <div className="clause-participle-detail">
                        <p className="clause-participle-morph">
                          {participleChipLabel(activeParticipleWord)} — {describeParticipleMorph(activeParticipleWord)}
                          {activeParticipleWord.participleCase === "N" ? (
                            <span className="clause-participle-fact"> · nominative is the case a subject takes</span>
                          ) : null}
                          {isPossibleGenitiveAbsolute(activeParticipleWord) ? (
                            <span className="clause-participle-flag"> · possible genitive absolute — worth a second look</span>
                          ) : null}
                        </p>

                        {activeParticipleObservation.agreesWithNoun === "yes" ? (
                          <div className="clause-noun-picker">
                            <p className="clause-observation-term">Attributive</p>
                            <p>Select the noun this participle describes, in the text above.</p>
                            {participleDescribedNounText ? <p className="clause-noun-selection">{participleDescribedNounText}</p> : null}
                            <div className="clause-step-actions">
                              <button
                                type="button"
                                className="clause-reconsider"
                                onClick={resetParticipleObservation}
                              >
                                Not this — reconsider
                              </button>
                            </div>
                            <div className="clause-context-panel clause-context-panel--compact" aria-label="Select the described noun">
                              {activeObservationContextVerses.map(verse => (
                                <p className="clause-noun-verse" key={`p-${verse.chapter}:${verse.verse}`}>
                                  <span className="clause-noun-verse-label">{verse.verse}</span>
                                  <span>
                                    {verse.words.map((word, position) => {
                                      const isSelected = Boolean(activeParticipleObservation.describedNounSpan?.includes(word.id));
                                      return (
                                        <span key={word.id}>
                                          {position > 0 ? " " : null}
                                          <button
                                            type="button"
                                            className={isSelected ? "clause-noun-word clause-noun-word--selected" : "clause-noun-word"}
                                            onClick={event => selectParticipleNounWord(word, event)}
                                          >
                                            {word.text}
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </span>
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="clause-choice-grid clause-choice-grid--participle">
                            <button type="button" className="clause-choice-btn" onClick={chooseParticipleAttributive}>
                              <span className="clause-choice-term">Attributive</span>
                              Agrees with and describes a nearby noun
                            </button>
                            <button type="button" className="clause-choice-btn" onClick={chooseParticipleSubstantival}>
                              <span className="clause-choice-term">Substantival</span>
                              Stands alone, naming a person or thing
                            </button>
                            <button type="button" className="clause-choice-btn" onClick={chooseParticipleCircumstantial}>
                              <span className="clause-choice-term">Circumstantial</span>
                              Rides on this clause's finite verb
                            </button>
                          </div>
                        )}

                        {resolveParticipleClassification(activeParticipleObservation) && activeParticipleObservation.agreesWithNoun !== "yes" ? (
                          <button type="button" className="clause-reconsider" onClick={resetParticipleObservation}>
                            Not this — reconsider
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {showGreekBeginning && activeBeginningRow.beginningTokens.length ? (
                  <div
                    className="clause-beginning-grid clause-beginning-grid--inline"
                    style={{ gridTemplateColumns: `auto repeat(${activeBeginningRow.beginningTokens.length}, max-content)` }}
                  >
                    <span className="clause-beginning-label">Greek</span>
                    {activeBeginningRow.beginningTokens.map((token, index) => (
                      <span
                        className={index === 0 ? "clause-beginning-token clause-beginning-token--first" : "clause-beginning-token"}
                        key={`greek-${token.id}`}
                      >
                        {token.greek}
                      </span>
                    ))}
                    <span className="clause-beginning-label">BLE</span>
                    {activeBeginningRow.beginningTokens.map(token => (
                      <span className="clause-beginning-token clause-beginning-token--ble" key={`ble-${token.id}`}>
                        {token.ble}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="clause-context-panel" aria-label="Surrounding Spanish context">
                  {activeObservationContextVerses.map(verse => (
                    <p className="clause-noun-verse" key={`${verse.chapter}:${verse.verse}`}>
                      <span className="clause-noun-verse-label">{verse.verse}</span>
                      <span>
                        {verse.words.map((word, position) => {
                          const canSelectNoun = activeObservation.describesNoun === "yes";
                          const isSelected = Boolean(activeObservation.describedNounSpan?.includes(word.id));
                          return (
                            <span key={word.id}>
                              {position > 0 ? " " : null}
                              {canSelectNoun ? (
                                <button
                                  type="button"
                                  className={isSelected ? "clause-noun-word clause-noun-word--selected" : "clause-noun-word"}
                                  onClick={event => selectNounWord(word, event)}
                                >
                                  {word.text}
                                </button>
                              ) : (
                                <span className={activeBeginningRow.selectedWords.some(selected => selected.id === word.id) ? "clause-context-word clause-context-word--active" : "clause-context-word"}>
                                  {word.text}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </span>
                    </p>
                  ))}
                </div>

                <section className="clause-observation" aria-label="Current observation">
                  {activeObservation.describesNoun === "yes" ? (
                    <div className="clause-noun-picker">
                      <p className="clause-observation-term">Relative clause</p>
                      <p>Select the noun this clause describes, in the text above.</p>
                      {describedNounText ? <p className="clause-noun-selection">{describedNounText}</p> : null}
                      <div className="clause-step-actions">
                        <button
                          type="button"
                          className="clause-step-save"
                          disabled={!activeObservation.describedNounSpan?.length}
                          onClick={moveToNextClause}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="clause-reconsider"
                          onClick={() => {
                            setNounAnchorId(null);
                            updateActiveObservation({ describesNoun: undefined, describedNounSpan: [] });
                          }}
                        >
                          Not this — reconsider
                        </button>
                      </div>
                    </div>
                  ) : activeObservation.isWhatWasExpressed === "yes" ? (
                    <div className="clause-parent-picker">
                      <p className="clause-observation-term">Content clause</p>
                      <p>Select the clause this is the content of.</p>
                      <div className="clause-parent-list">
                        {nearbyParentClauseRows.map(row => (
                          <button
                            type="button"
                            className={[
                              "clause-parent-option",
                              activeObservation.expressedParentClauseId === row.finiteVerb.finiteVerbId
                                ? "clause-parent-option--selected"
                                : "",
                              isLikelyContentParent({ finiteVerbLemma: row.finiteVerb.greekLemma })
                                ? "clause-parent-option--likely"
                                : ""
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={row.finiteVerb.finiteVerbId}
                            onClick={() => row.finiteVerb.finiteVerbId && selectExpressedParent(row.finiteVerb.finiteVerbId)}
                          >
                            <span>{row.reference}</span>
                            {row.spanText}
                          </button>
                        ))}
                      </div>
                      <div className="clause-step-actions">
                        <button
                          type="button"
                          className="clause-step-save"
                          disabled={!activeObservation.expressedParentClauseId}
                          onClick={moveToNextClause}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="clause-reconsider"
                          onClick={() => updateActiveObservation({ isWhatWasExpressed: undefined, expressedParentClauseId: "" })}
                        >
                          Not this — reconsider
                        </button>
                      </div>
                    </div>
                  ) : activeObservation.tellsWhenOrIf === "yes" ? (
                    <div className="clause-parent-picker">
                      <p className="clause-observation-term">
                        {activeEffectiveFrameType ? `${capitalize(activeEffectiveFrameType)} clause` : "Adverbial clause"}
                      </p>
                      <p>Select the clause this explains — its time, reason, condition, or purpose.</p>
                      <div className="clause-parent-list">
                        {nearbyParentClauseRows.map(row => (
                          <button
                            type="button"
                            className={activeObservation.whenIfParentClauseId === row.finiteVerb.finiteVerbId ? "clause-parent-option clause-parent-option--selected" : "clause-parent-option"}
                            key={row.finiteVerb.finiteVerbId}
                            onClick={() => row.finiteVerb.finiteVerbId && selectWhenIfParent(row.finiteVerb.finiteVerbId)}
                          >
                            <span>{row.reference}</span>
                            {row.spanText}
                          </button>
                        ))}
                      </div>
                      <div className="clause-step-actions">
                        <button
                          type="button"
                          className="clause-step-save"
                          disabled={!activeObservation.whenIfParentClauseId}
                          onClick={moveToNextClause}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="clause-reconsider"
                          onClick={() => updateActiveObservation({ tellsWhenOrIf: undefined, whenIfParentClauseId: "", frameType: undefined })}
                        >
                          Not this — reconsider
                        </button>
                      </div>
                    </div>
                  ) : isActiveClauseRoot && !forceChoices ? (
                    // Root is the default outcome of Q1/Q2/Q3 (all three "no"), not the
                    // absence of an answer — it needs the same reviewed/revisable
                    // treatment as describes/content/frame above, not just a note with
                    // no way back (root-clause-redo-fix.md). Reuses forceChoices, the
                    // same toggle that already reopens the grid after a signal proposal.
                    <div className="clause-parent-picker">
                      <p className="clause-observation-term">Independent clause</p>
                      <p className="clause-tutor-note">Currently: stands on its own.</p>
                      <div className="clause-step-actions">
                        <button type="button" className="clause-reconsider" onClick={() => setForceChoices(true)}>
                          Not this — reconsider
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!forceChoices && !isActiveClauseRoot && activeSignal && activeSignal.kind === "confident" ? (
                        <div className="clause-proposal">
                          <p className="clause-proposal-label">
                            {activeSignal.choice === "describes"
                              ? "Relative clause"
                              : activeSignal.choice === "content"
                                ? "Content clause"
                                : `${capitalize(activeSignal.frameType)} clause`}
                          </p>
                          <p className="clause-proposal-reason">{activeSignal.reason}</p>
                          <div className="clause-step-actions">
                            <button type="button" className="clause-step-save" onClick={() => acceptSignal(activeSignal)}>
                              Yes, that's it
                            </button>
                            <button type="button" className="clause-reconsider" onClick={() => setForceChoices(true)}>
                              Not quite — show me the options
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {!forceChoices && !isActiveClauseRoot && activeSignal?.kind === "uncertain" ? (
                            <p className="clause-uncertain-note">{activeSignal.reason}</p>
                          ) : null}
                          {!forceChoices && !isActiveClauseRoot && activeSignal?.kind === "none" ? (
                            <p className="clause-tutor-note">{activeSignal.reason}</p>
                          ) : null}
                          {forceChoices ? (
                            <p className="clause-tutor-note">No problem — pick the shape that actually fits.</p>
                          ) : null}

                          <div className="clause-choice-grid">
                            <button type="button" className="clause-choice-btn" onClick={chooseDescribes}>
                              <span className="clause-choice-term">Relative clause</span>
                              Describes something nearby
                            </button>
                            <button type="button" className="clause-choice-btn" onClick={chooseContent}>
                              <span className="clause-choice-term">Content clause</span>
                              Reports what was said or thought
                            </button>
                            <button type="button" className="clause-choice-btn" onClick={chooseFrame}>
                              <span className="clause-choice-term">Adverbial clause</span>
                              Gives a when, why, if, or so-that
                            </button>
                            <button type="button" className="clause-choice-btn" onClick={chooseRoot}>
                              <span className="clause-choice-term">Independent clause</span>
                              Stands on its own
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </section>
              </section>
            ) : (
              <p className="clause-output-empty">No mood-tagged clauses ready for review.</p>
            )}

            {workspaceClauseRows.length ? (
              <div className="clause-only-list" aria-label="Saved clause spans">
                {workspaceClauseRows.map(row => {
                  const reviewState = getClauseReviewState(row);
                  return (
                    <button
                      type="button"
                      className={[
                        "clause-only-item",
                        row.finiteVerb.finiteVerbId === activeBeginningVerbId ? "clause-only-item--inspecting" : ""
                      ].filter(Boolean).join(" ")}
                      key={row.finiteVerb.finiteVerbId}
                      onClick={() => inspectClauseBeginning(row)}
                    >
                      <span className="clause-line-reference">{row.reference}</span>
                      <span className="clause-only-text">{renderClauseLine(row)}</span>
                      <span className={`clause-review-state clause-review-state--${reviewState.toLowerCase().replace(/\s/g, "-")}`}>
                        {reviewState}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="clause-output-empty">No visible mood-tagged clauses.</p>
            )}
          </div>

          <aside className="clause-skeleton-panel" aria-label="Skeleton">
            <div className="clause-skeleton-header">
              <h2>Skeleton</h2>
              {skeleton.roots.length ? (
                <span className="clause-skeleton-count">
                  {skeleton.roots.length} root{skeleton.roots.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            {sequenceEntryByFiniteVerbId.size ? (
              <dl className="sequence-legend">
                <div>
                  <dt className="sequence-tag sequence-tag--reason">Reason</dt>
                  <dd>carries an attached reason clause (γάρ / διότι / ὅτι), at any depth</dd>
                </div>
                <div>
                  <dt className="sequence-tag sequence-tag--statement">Statement</dt>
                  <dd>statement mood, and not already a reason — the content being asserted</dd>
                </div>
                <div>
                  <dt className="sequence-tag sequence-tag--imperative">Imperative</dt>
                  <dd>a command (Brick 2)</dd>
                </div>
                <div>
                  <dt className="sequence-tag sequence-tag--purpose">Purpose</dt>
                  <dd>has a directly-attached purpose clause</dd>
                </div>
                <div>
                  <dt className="sequence-tag sequence-tag--recipient">Recipient</dt>
                  <dd>who an imperative is addressed to, from Brick 2B — consecutive same-recipient roots are grouped visually</dd>
                </div>
              </dl>
            ) : null}

            {skeleton.roots.length ? (
              <div className="clause-tree">{skeleton.roots.map(renderSkeletonNode)}</div>
            ) : (
              <p className="clause-output-empty">
                Nothing placed yet. Classify a clause as Independent, or as content/frame pointing at one, and it
                shows up here.
              </p>
            )}

            {outline.length ? (
              <div className="clause-outline-section">
                <h3>Outline</h3>
                <p className="clause-section-note">
                  Just the root clauses, book order — everything indented stripped out of the skeleton above.
                </p>
                {outline.map(clause => (
                  <p className="clause-outline-item" key={clause.finiteVerbId}>
                    <span>{clause.reference}</span>
                    {clause.spanText}
                  </p>
                ))}
              </div>
            ) : null}

            {skeleton.parked.length ? (
              <div className="clause-parked-section">
                <h3>Not yet placed in the skeleton</h3>
                <p className="clause-section-note">
                  These describe a noun that isn't inside any indexed clause yet — often material like Tito 1:1 that
                  has no finite verb of its own. Nothing to do here now; they get connected during closer clause-level
                  work later, once the skeleton around them is settled.
                </p>
                {skeleton.parked.map(parked => (
                  <div className="clause-parked-item" key={parked.finiteVerbId}>
                    <p>
                      <span>{parked.reference}</span>
                      {parked.spanText}
                    </p>
                    {parked.ambiguousOwnerIds?.length ? (
                      <p className="clause-parked-ambiguous">
                        Describes a noun that falls inside more than one clause — a tie, not a guess. Candidates:{" "}
                        {parked.ambiguousOwnerIds
                          .map(id => clauseSpanInfos.find(candidate => candidate.finiteVerbId === id))
                          .filter((candidate): candidate is ClauseSpanInfo => Boolean(candidate))
                          .map(candidate => `${candidate.reference} (${candidate.spanText})`)
                          .join("; ")}
                      </p>
                    ) : null}
                    {parked.children.length ? (
                      <div className="clause-tree-children">{parked.children.map(renderSkeletonNode)}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {verblessVerses.length ? (
              <div className="clause-verbless-section">
                <h3>No finite verb — set aside for the detailed pass</h3>
                <p className="clause-section-note">
                  These verses have no finite verb in the Greek at all, so Brick 1 never reaches them and they're not
                  part of the skeleton pass. Nothing to decide about them now — shown here only so they're visible,
                  not silently missing.
                </p>
                {verblessVerses.map(verse => (
                  <p className="clause-verbless-item" key={verse.reference}>
                    <span>{verse.reference}</span>
                    {verse.text}
                  </p>
                ))}
              </div>
            ) : null}

            {standaloneParticipleGroups.length ? (
              <div className="clause-standalone-participles">
                <h3>
                  Participles without a clause
                  <ParticipleCheck confirmed={participlesConfirmed} />
                </h3>
                <p className="clause-section-note">
                  Found in Brick 4, in verses with no finite verb — so there's no clause for them to attach to.
                  Sort each one below (circumstantial isn't offered here since there's no finite verb to ride).
                </p>
                {standaloneParticipleGroups.map(group => (
                  <div className="clause-standalone-group" key={group.reference}>
                    <p className="clause-verbless-item">
                      <span>{group.reference}</span>
                      {verseTextByKey.get(`${group.chapter}:${group.verse}`) ?? ""}
                    </p>
                    <div className="clause-participle-chip-row">
                      {group.entries.map(word => {
                        const classification = word.participleId ? resolveParticipleClassification(participleObservations[word.participleId]) : null;
                        return (
                          <button
                            type="button"
                            key={word.participleId}
                            className={[
                              "clause-participle-chip",
                              activeStandaloneParticipleId === word.participleId ? "clause-participle-chip--active" : "",
                              classification ? `clause-participle-chip--${classification}` : ""
                            ].filter(Boolean).join(" ")}
                            onClick={() =>
                              setActiveStandaloneParticipleId(current => (current === word.participleId ? null : word.participleId ?? null))
                            }
                          >
                            {participleChipLabel(word)}
                            <span className="clause-participle-chip-state">{classification ?? "unsorted"}</span>
                          </button>
                        );
                      })}
                    </div>

                    {activeStandaloneWord && group.entries.some(word => word.participleId === activeStandaloneParticipleId) ? (
                      <div className="clause-participle-detail">
                        <p className="clause-participle-morph">
                          {participleChipLabel(activeStandaloneWord)} — {describeParticipleMorph(activeStandaloneWord)}
                          {activeStandaloneWord.participleCase === "N" ? (
                            <span className="clause-participle-fact"> · nominative is the case a subject takes</span>
                          ) : null}
                          {isPossibleGenitiveAbsolute(activeStandaloneWord) ? (
                            <span className="clause-participle-flag"> · possible genitive absolute — worth a second look</span>
                          ) : null}
                        </p>

                        {activeStandaloneObservation.agreesWithNoun === "yes" ? (
                          <div className="clause-noun-picker">
                            <p className="clause-observation-term">Attributive</p>
                            <p>Select the noun this participle describes, in the text above.</p>
                            {standaloneDescribedNounText ? <p className="clause-noun-selection">{standaloneDescribedNounText}</p> : null}
                            <div className="clause-step-actions">
                              <button
                                type="button"
                                className="clause-reconsider"
                                onClick={resetStandaloneParticipleObservation}
                              >
                                Not this — reconsider
                              </button>
                            </div>
                            <div className="clause-context-panel clause-context-panel--compact" aria-label="Select the described noun">
                              {standaloneContextVerses.map(verse => (
                                <p className="clause-noun-verse" key={`sp-${verse.chapter}:${verse.verse}`}>
                                  <span className="clause-noun-verse-label">{verse.verse}</span>
                                  <span>
                                    {verse.words.map((word, position) => {
                                      const isSelected = Boolean(activeStandaloneObservation.describedNounSpan?.includes(word.id));
                                      return (
                                        <span key={word.id}>
                                          {position > 0 ? " " : null}
                                          <button
                                            type="button"
                                            className={isSelected ? "clause-noun-word clause-noun-word--selected" : "clause-noun-word"}
                                            onClick={event => selectStandaloneNounWord(word, event)}
                                          >
                                            {word.text}
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </span>
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="clause-choice-grid clause-choice-grid--participle">
                            <button type="button" className="clause-choice-btn" onClick={chooseStandaloneAttributive}>
                              <span className="clause-choice-term">Attributive</span>
                              Agrees with and describes a nearby noun
                            </button>
                            <button type="button" className="clause-choice-btn" onClick={chooseStandaloneSubstantival}>
                              <span className="clause-choice-term">Substantival</span>
                              Stands alone, naming a person or thing
                            </button>
                          </div>
                        )}

                        {resolveParticipleClassification(activeStandaloneObservation) && activeStandaloneObservation.agreesWithNoun !== "yes" ? (
                          <button type="button" className="clause-reconsider" onClick={resetStandaloneParticipleObservation}>
                            Not this — reconsider
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {telos ? (
              <div className="clause-telos-section">
                <h3>Candidate telos</h3>
                {telos.purposeClauses.map(clause => (
                  <p className="clause-telos-item" key={clause.finiteVerbId}>
                    {clause.spanText}
                  </p>
                ))}
                {telos.lastOutlineClause ? (
                  <>
                    <p className="clause-telos-vs">compare with the outline's last point</p>
                    <p className="clause-telos-item clause-telos-item--outline">{telos.lastOutlineClause.spanText}</p>
                  </>
                ) : null}
                <p className="clause-telos-note">
                  Does this look like the book's stated purpose? That's your call, not something the software concludes.
                </p>
              </div>
            ) : null}
          </aside>
        </div>
        </section>
      ) : view === "participle-views" ? (
        <section className="participle-views" aria-labelledby="participle-views-heading">
          <div className="clause-only-header">
            <div>
              <h2 id="participle-views-heading">Participle Views</h2>
              <p>Aggregate patterns from participles classified so far — counts and locations only, no conclusions.</p>
            </div>
          </div>

          <div className="participle-view-tabs" aria-label="Participle view">
            <button
              type="button"
              className={participleViewTab === "flow" ? "clause-view-option clause-view-option--active" : "clause-view-option"}
              onClick={() => setParticipleViewTab("flow")}
            >
              Flow
            </button>
            <button
              type="button"
              className={participleViewTab === "emphasis" ? "clause-view-option clause-view-option--active" : "clause-view-option"}
              onClick={() => setParticipleViewTab("emphasis")}
            >
              Emphasis
            </button>
            <button
              type="button"
              className={participleViewTab === "cast" ? "clause-view-option clause-view-option--active" : "clause-view-option"}
              onClick={() => setParticipleViewTab("cast")}
            >
              Cast
            </button>
          </div>

          {participleViewTab === "emphasis" ? (
            <div className="participle-view-panel">
              <p className="clause-section-note">
                From attributive participles — the noun each one was resolved to describe. Grouped by the Greek
                lemma of that noun (via the same alignment data Interlinear surfaces), not the displayed Spanish
                gloss — two different Greek words that happen to translate the same way stay separate rows rather
                than merging into one. A row falls back to grouping by its exact word-span, shown without a lemma,
                only if the lemma genuinely couldn't be resolved for that one occurrence.
              </p>
              {emphasisGroups.length ? (
                <table className="participle-emphasis-table">
                  <thead>
                    <tr>
                      <th>Noun</th>
                      <th>Lemma</th>
                      <th>Count</th>
                      <th>References</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emphasisGroups.map(group => (
                      <tr key={group.entries[0].participleId}>
                        <td>
                          {group.nounText}
                          {group.sharesGlossWithOther ? (
                            <span className="participle-emphasis-gloss-note"> (also glossed this way elsewhere — different Greek word)</span>
                          ) : null}
                        </td>
                        <td className="participle-emphasis-lemma">{group.nounLemma ?? "—"}</td>
                        <td>{group.count}</td>
                        <td>
                          {group.entries.map((entry, index) => (
                            <span key={entry.participleId}>
                              {index > 0 ? ", " : ""}
                              <button
                                type="button"
                                className="participle-view-ref"
                                onClick={() => jumpToParticipleClause(entry.participleId)}
                              >
                                {entry.reference}
                              </button>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="clause-output-empty">No attributive participles sorted yet.</p>
              )}
            </div>
          ) : null}

          {participleViewTab === "cast" ? (
            <div className="participle-view-panel">
              <p className="clause-section-note">
                From substantival participles — the categories the letter names via participle, in the author's own
                words ("the one who teaches," "those who reject"). Grouped by Greek lemma.
              </p>
              <div className="participle-cast-group">
                <h3>Recurring</h3>
                {castGroups.recurring.length ? (
                  castGroups.recurring.map(group => (
                    <div className="participle-cast-item" key={group.lemma}>
                      <span className="participle-cast-text">{group.textSample}</span>
                      <span className="participle-cast-count">{group.count}×</span>
                      <span className="participle-cast-refs">
                        {group.entries.map((entry, index) => (
                          <span key={entry.participleId}>
                            {index > 0 ? ", " : ""}
                            <button
                              type="button"
                              className="participle-view-ref"
                              onClick={() => jumpToParticipleClause(entry.participleId)}
                            >
                              {entry.reference}
                            </button>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="clause-output-empty">None yet.</p>
                )}
              </div>
              <div className="participle-cast-group">
                <h3>Single occurrence</h3>
                {castGroups.single.length ? (
                  castGroups.single.map(group => (
                    <div className="participle-cast-item" key={group.lemma}>
                      <span className="participle-cast-text">{group.textSample}</span>
                      <button
                        type="button"
                        className="participle-view-ref"
                        onClick={() => jumpToParticipleClause(group.entries[0].participleId)}
                      >
                        {group.entries[0]?.reference}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="clause-output-empty">None yet.</p>
                )}
              </div>
            </div>
          ) : null}

          {participleViewTab === "flow" ? (
            <div className="participle-view-panel">
              <p className="clause-section-note">
                From circumstantial participles — tallied against the root clause whose stretch of text they fall
                within, even several levels deep. Bar height is a quick-scan aid; the number is the fact. Every root
                clause in the outline gets a bar, labeled with its reference — a flat tick at 0 means that clause was
                checked and none were found, not that it's missing.
              </p>
              {outline.length ? (
                <div className="participle-flow-strip">
                  {outline.map(clause => {
                    const tally = flowTallies.get(clause.finiteVerbId);
                    const count = tally?.count ?? 0;
                    const heightPct = Math.round((count / maxFlowCount) * 100);
                    return (
                      <button
                        type="button"
                        className={[
                          "participle-flow-marker",
                          count === 0 ? "participle-flow-marker--zero" : "",
                          expandedFlowRootId === clause.finiteVerbId ? "participle-flow-marker--active" : ""
                        ].filter(Boolean).join(" ")}
                        key={clause.finiteVerbId}
                        onClick={() =>
                          setExpandedFlowRootId(current => (current === clause.finiteVerbId ? null : clause.finiteVerbId))
                        }
                        title={`${clause.reference} — ${count} circumstantial participle${count === 1 ? "" : "s"}${count === 0 ? " (checked, none found)" : ""}`}
                      >
                        <span className="participle-flow-bar" style={{ height: `${count > 0 ? Math.max(heightPct, 6) : 2}%` }} />
                        <span className="participle-flow-count">{count}</span>
                        <span className="participle-flow-ref">{clause.reference.replace("Tito ", "")}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="clause-output-empty">No root clauses in the outline yet.</p>
              )}

              {expandedFlowRootId ? (() => {
                const rootClause = clauseSpanInfos.find(candidate => candidate.finiteVerbId === expandedFlowRootId);
                const tally = flowTallies.get(expandedFlowRootId);
                return (
                  <div className="participle-flow-detail">
                    <p className="participle-flow-detail-root">
                      <span className="clause-output-meta">{rootClause?.reference}</span>
                      {rootClause?.spanText ?? expandedFlowRootId}
                    </p>
                    {tally?.entries.length ? (
                      <ul className="participle-flow-detail-list">
                        {tally.entries.map(entry => {
                          const ridingRow = finiteVerbIdToRow.get(entry.ridingClauseId);
                          return (
                            <li key={entry.participleId}>
                              <button
                                type="button"
                                className="participle-view-ref"
                                onClick={() => jumpToParticipleClause(entry.participleId)}
                              >
                                {entry.text} — {entry.reference}
                              </button>
                              <span> attached to {ridingRow?.spanText ?? entry.ridingClauseId}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="clause-output-empty">No circumstantial participles under this root.</p>
                    )}
                  </div>
                );
              })() : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "passage" && activeVerb ? (
        <aside className="clause-selection-panel" aria-live="polite">
          <p className="clause-active-verb">
            <span>Tito {activeVerb.chapter}:{activeVerb.verse}</span>
            <strong>{activeVerb.text}</strong>
          </p>
          {draftText ? (
            <p className="clause-belonging-list">{draftText}</p>
          ) : (
            <p className="clause-empty">No words selected.</p>
          )}
          <div className="clause-panel-actions">
            <button type="button" className="clause-save" onClick={saveActive} disabled={!draftGreekRange}>
              Save
            </button>
            <button type="button" className="clause-clear" onClick={clearDraft}>
              Clear
            </button>
          </div>
          {draftSpan.some(id => overlapWordIds.has(id)) ? (
            <p className="clause-overlap-note">Overlap noted.</p>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}
