import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  auditGreekSpanConsistency,
  deriveGreekClauseRange,
  deriveSpanishSpanFromGreekRange,
  formatClauseSpan,
  getClauseBeginningTokens,
  getVersesWithoutFiniteVerb,
  loadClauseVerses,
  readClauseAssignments,
  readClauseObservations,
  readCommandRecipientAssignments,
  readMarkedAlignmentIds,
  readNominalClauseHeadIds,
  spanFromRange,
  wordInSpan,
  writeClauseAssignments,
  writeClauseObservations,
  groupParticiplesByNounHost,
  formatActorTriple,
  readBookDefinitions,
  readBookThread,
  readClauseActors,
  readContrastObservations,
  readH3FlowState,
  readParticipleSubjectHosts,
  writeBookDefinitions,
  writeBookThread,
  writeClauseActors,
  writeContrastObservations,
  writeH3FlowState,
  writeParticipleSubjectHosts,
  type BookDefinitionHit,
  type BookDefinitionTerm,
  type BookDefinitionsState,
  type BookThreadState,
  type BookThreadStep,
  type ClauseActorObservation,
  type ClauseActors,
  type ContrastObservation,
  type ContrastObservationsState,
  type H3FlowState,
  type ClauseAssignments,
  type ClauseBeginningToken,
  type ClauseObservation,
  type ClauseObservations,
  type GreekClauseRange,
  type ParticipleSubjectHosts,
  type SpanishWord
} from "./clause-data";
import {
  buildClauseChoiceGuidance,
  detectClauseMarker,
  detectClauseSignal,
  detectLeadingCoordinator,
  detectLeadingFrameType,
  detectRelativeOfConnection,
  isLikelyContentParent,
  type ClauseChoiceKind,
  type ClauseChoiceOption,
  type ClauseMarker,
  type ClauseSignal,
  type ClauseSignalInput,
  type FrameType
} from "./clause-signals";
import { loadLbfTokenSurfaces } from "./lbf-alignment";
import { describeMorph, ensureVerseInterlinear, getVerseInterlinear } from "./o-data";
import { TokenDetailAnchor } from "./TokenDetailPopover";
import { getReaderBookInfo, workshopProgressKeys, type ReaderBookId } from "@cgv/core";
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
import {
  buildH3FlowMovements,
  buildH3FlowSupports,
  clearH2Start,
  clearPressureAfter,
  markPressureAfter,
  reconcileH3FlowState,
  setH2Label,
  startH2After
} from "./h3-flow";
import { buildH3UnitSignals } from "./h2-movements";
import { buildBookMovementReport } from "./book-movement";
import {
  investigateBookDefinition,
  type DefinitionInvestigation
} from "./book-definitions";
import {
  proposeThreadWaypoints,
  verseKeyFromReference,
  type ThreadWaypointProposal
} from "./book-threads";
import {
  buildConvergenceReport,
  buildVerseDashboard,
  buildVerseDevelopment,
  type ReasonHit,
  type VerseConvergence
} from "./convergence-engine";

const FALLBACK_CLAUSE_CHOICES: ClauseChoiceOption[] = [
  {
    kind: "describes",
    term: "Relative clause",
    blurb: "Describes something nearby",
    evidence: "",
    lean: "available"
  },
  {
    kind: "content",
    term: "Content clause",
    blurb: "Reports what was said or thought",
    evidence: "",
    lean: "available"
  },
  {
    kind: "frame",
    term: "Adverbial clause",
    blurb: "Gives a when, why, if, or so-that",
    evidence: "",
    lean: "available"
  },
  {
    kind: "root",
    term: "Independent clause",
    blurb: "Stands on its own",
    evidence: "",
    lean: "available"
  }
];

// Structure = Passage + Clause Workspace as one continuous view (START-HERE Step 4).
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `chapter:verse` from a `chapter:verse:n` id, or null. */
function verseKeyFromId(id: string): string | null {
  const [chapter, verse] = id.split(":");
  if (!chapter || !verse) return null;
  return `${chapter}:${verse}`;
}

/**
 * Nearby clauses that could become the relative’s host by expanding their span.
 * Only same-verse candidates: Greek clause ranges are verse-bound, so a 1:3
 * host can never acquire a 1:2 noun id — offering it was a dead end.
 */
function findHostCandidatesForParked(
  parked: ClauseSpanInfo,
  nounIds: string[],
  allClauses: ClauseSpanInfo[],
  limit = 4
): ClauseSpanInfo[] {
  if (!nounIds.length) return [];
  const nounVerses = new Set(
    nounIds.map(verseKeyFromId).filter((key): key is string => Boolean(key))
  );
  if (!nounVerses.size) return [];
  return allClauses
    .filter(candidate => candidate.finiteVerbId !== parked.finiteVerbId)
    .filter(candidate => !nounIds.some(id => candidate.wordIds.includes(id)))
    .filter(candidate => {
      const verse = verseKeyFromId(candidate.finiteVerbId);
      return Boolean(verse && nounVerses.has(verse));
    })
    .sort((a, b) => {
      const aBefore = a.order <= parked.order ? 0 : 1;
      const bBefore = b.order <= parked.order ? 0 : 1;
      if (aBefore !== bBefore) return aBefore - bBefore;
      return Math.abs(a.order - parked.order) - Math.abs(b.order - parked.order);
    })
    .slice(0, limit);
}

interface HostFixHint {
  hostVerbId: string;
  parkedReference: string;
  nounText: string;
}

/** Spanish-only reading: contiguous words sharing one clause membership. */
type SpanishPhraseKind = "plain" | "clause" | "draft" | "reviewing" | "overlap";

interface SpanishPhrase {
  key: string;
  kind: SpanishPhraseKind;
  /** Alternating wash so adjacent settled clauses stay distinguishable. */
  alt: boolean;
  words: SpanishWord[];
}

function groupSpanishPhrases(
  words: SpanishWord[],
  ownersByWordId: Map<string, string[]>,
  draftSpan: string[] | null,
  activeBeginningVerbId: string | null
): SpanishPhrase[] {
  const phrases: SpanishPhrase[] = [];
  let clausePaint = 0;

  for (const word of words) {
    const inDraft = wordInSpan(word, draftSpan);
    const reviewing =
      Boolean(activeBeginningVerbId) &&
      Boolean(ownersByWordId.get(word.id)?.includes(activeBeginningVerbId!));
    const owners = ownersByWordId.get(word.id) ?? [];

    let key: string;
    let kind: SpanishPhraseKind;
    if (inDraft) {
      key = "draft";
      kind = "draft";
    } else if (reviewing) {
      key = `reviewing:${activeBeginningVerbId}`;
      kind = "reviewing";
    } else if (owners.length > 1) {
      key = `overlap:${[...owners].sort().join("|")}`;
      kind = "overlap";
    } else if (owners.length === 1) {
      key = `clause:${owners[0]}`;
      kind = "clause";
    } else {
      key = "plain";
      kind = "plain";
    }

    const last = phrases[phrases.length - 1];
    if (last && last.key === key) {
      last.words.push(word);
      continue;
    }

    const alt = kind === "clause" ? clausePaint % 2 === 1 : false;
    if (kind === "clause") clausePaint += 1;
    phrases.push({ key, kind, alt, words: [word] });
  }

  return phrases;
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


// Spanish surface is primary; Greek is secondary confirmation of Brick 4.
export default function SpanishClauseBuilder({ bookId }: { bookId: ReaderBookId }) {
  const bookInfo = getReaderBookInfo(bookId);
  const progressKeys = useMemo(() => workshopProgressKeys(bookId), [bookId]);
  const [interlinearReady, setInterlinearReady] = useState(false);
  const verses = useMemo(() => loadClauseVerses(bookId), [bookId]);

  useEffect(() => {
    let cancelled = false;
    setInterlinearReady(false);
    void ensureVerseInterlinear(bookId).then(() => {
      if (!cancelled) setInterlinearReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

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
    readMarkedAlignmentIds(progressKeys.commandMarks, bookId).forEach(id => ids.add(id));
    readMarkedAlignmentIds(progressKeys.statementMarks, bookId).forEach(id => ids.add(id));
    readMarkedAlignmentIds(progressKeys.subjunctiveMarks, bookId).forEach(id => ids.add(id));
    readMarkedAlignmentIds(progressKeys.optativeMarks, bookId).forEach(id => ids.add(id));
    // A verbless nominal clause may carry a mood the student read into it, but it
    // reaches this workspace either way — there is no morphology to review first.
    readNominalClauseHeadIds(bookId).forEach(id => ids.add(id));
    return ids;
  }, [bookId, progressKeys]);

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

  const [assignments, setAssignments] = useState<ClauseAssignments>(() => readClauseAssignments(bookId));

  // Read-only audit (clause-selection-greek-spec.md): before Greek becomes
  // the authoritative span, surface every existing clause whose stored
  // Greek range no longer matches what deriving it fresh from the current
  // Spanish span would produce, rather than assuming old data is fine.
  const greekSpanAudit = useMemo(
    () => auditGreekSpanConsistency(verses, assignments, bookId),
    [assignments, bookId, verses]
  );
  const greekSpanMismatches = useMemo(() => greekSpanAudit.filter(entry => entry.mismatch), [greekSpanAudit]);

  const [activeVerbId, setActiveVerbId] = useState<string | null>(null);

  // Per clause-selection-greek-spec.md: the Greek token range is now the
  // authoritative draft, set directly by clicking Greek tokens. The Spanish
  // span (draftSpan, below) is derived from this for display and for every
  // downstream consumer that already expects Spanish word ids — it's no
  // longer itself something a click sets.
  const [draftGreekRange, setDraftGreekRange] = useState<{ start: number; end: number } | null>(null);
  const [greekRangeAnchorToken, setGreekRangeAnchorToken] = useState<number | null>(null);
  // Settled reading: LBF Spanish as the primary passage surface. Greek
  // workstation stays one toggle away for span editing (connector order).
  const [showSpanishOnly, setShowSpanishOnly] = useState(false);
  // Skeleton lives in a popup (not the Structure canvas) — open/maximized.
  const [skeletonOpen, setSkeletonOpen] = useState(false);
  const [skeletonMaximized, setSkeletonMaximized] = useState(false);
  /** Passage | Movement | Definitions | Thread. */
  const [structureMode, setStructureMode] = useState<
    "passage" | "movement" | "definitions" | "thread"
  >("passage");
  const [hostFixHint, setHostFixHint] = useState<HostFixHint | null>(null);
  const [activeBeginningVerbId, setActiveBeginningVerbId] = useState<string | null>(null);
  const [observations, setObservations] = useState<ClauseObservations>(() => readClauseObservations(bookId));
  const [participleSubjectHosts, setParticipleSubjectHosts] = useState<ParticipleSubjectHosts>(() =>
    readParticipleSubjectHosts(bookId)
  );
  const [clauseActors, setClauseActors] = useState<ClauseActors>(() => readClauseActors(bookId));
  const [h3FlowState, setH3FlowState] = useState<H3FlowState>(() => readH3FlowState(bookId));
  const [contrastState, setContrastState] = useState<ContrastObservationsState>(() =>
    readContrastObservations(bookId)
  );
  const [bookDefinitions, setBookDefinitions] = useState<BookDefinitionsState>(() =>
    readBookDefinitions(bookId)
  );
  const [bookThread, setBookThread] = useState<BookThreadState>(() => readBookThread(bookId));
  const [selectedThreadStepId, setSelectedThreadStepId] = useState<string | null>(null);
  const [definitionSeedDraft, setDefinitionSeedDraft] = useState("");
  const [activeDefinitionTermId, setActiveDefinitionTermId] = useState<string | null>(null);
  const [definitionInvestigation, setDefinitionInvestigation] = useState<DefinitionInvestigation | null>(
    null
  );
  const [selectedDefinitionHitId, setSelectedDefinitionHitId] = useState<string | null>(null);
  const [contrastDraftA, setContrastDraftA] = useState("");
  const [contrastDraftB, setContrastDraftB] = useState("");
  const [contrastDraftNote, setContrastDraftNote] = useState("");
  const [nounAnchorId, setNounAnchorId] = useState<string | null>(null);
  const [subjectHostAnchorId, setSubjectHostAnchorId] = useState<string | null>(null);
  /** clauseId or verseKey currently picking a nominative subject host for. */
  const [pickingSubjectHostKey, setPickingSubjectHostKey] = useState<string | null>(null);
  /** Active clause SVO field being tapped in the passage. */
  const [pickingActorField, setPickingActorField] = useState<"subject" | "verb" | "object" | null>(null);
  const [actorAnchorId, setActorAnchorId] = useState<string | null>(null);
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
    setPickingActorField(null);
    setActorAnchorId(null);
  }, [activeBeginningVerbId]);

  useEffect(() => {
    if (!activeBeginningVerbId) return;
    const node = document.querySelector<HTMLElement>(
      `[data-clause-nav-id="${CSS.escape(activeBeginningVerbId)}"]`
    );
    const panel = node?.closest<HTMLElement>(".clause-side-menu, .clause-only-list");
    if (!node || !panel) return;
    const nodeTop = node.offsetTop - panel.offsetTop;
    const nodeBottom = nodeTop + node.offsetHeight;
    if (nodeTop < panel.scrollTop) {
      panel.scrollTop = nodeTop;
    } else if (nodeBottom > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = nodeBottom - panel.clientHeight;
    }
  }, [activeBeginningVerbId]);

  useEffect(() => {
    if (!skeletonOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkeletonOpen(false);
        setSkeletonMaximized(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [skeletonOpen]);

  const closeSkeletonPopup = useCallback(() => {
    setSkeletonOpen(false);
    setSkeletonMaximized(false);
  }, []);

  const [showGreekBeginning, setShowGreekBeginning] = useState(false);
  // Clear audit banners can be dismissed; they reappear if problems return.

  useEffect(() => {
    setAssignments(readClauseAssignments(bookId));
    setObservations(readClauseObservations(bookId));
    setParticipleSubjectHosts(readParticipleSubjectHosts(bookId));
    setClauseActors(readClauseActors(bookId));
    setH3FlowState(readH3FlowState(bookId));
    setContrastState(readContrastObservations(bookId));
    setBookDefinitions(readBookDefinitions(bookId));
    setBookThread(readBookThread(bookId));
    setSelectedThreadStepId(null);
    setDefinitionSeedDraft("");
    setActiveDefinitionTermId(null);
    setDefinitionInvestigation(null);
    setSelectedDefinitionHitId(null);
    setContrastDraftA("");
    setContrastDraftB("");
    setContrastDraftNote("");
    setPickingSubjectHostKey(null);
    setSubjectHostAnchorId(null);
    setActiveVerbId(null);
    setDraftGreekRange(null);
    setGreekRangeAnchorToken(null);
  }, [bookId]);

  // Brick 4's own marks (Greek O-Prototype), converted from MorphGNT-line-id
  // format to "chapter:verse:token" alignment format — same conversion
  // moodReviewedVerbIds already relies on. Read-only here: this view shows
  // participles relationally beside their host clause; it doesn't find or sort them.
  const participleMarkedAlignmentIds = useMemo(
    () => readMarkedAlignmentIds(progressKeys.participleMarks, bookId),
    [bookId, progressKeys]
  );

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
      activeVerseWords,
      bookId
    );
  }, [activeVerb, activeVerseWords, bookId, draftGreekRange]);

  const overlapWordIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of Object.values(assignments)) {
      for (const id of assignment.selectedSpan) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([id]) => id));
  }, [assignments]);

  // word id → finite-verb clause ids that claim it (for Spanish phrase washes).
  const clauseOwnersByWordId = useMemo(() => {
    const owners = new Map<string, string[]>();
    for (const [finiteVerbId, assignment] of Object.entries(assignments)) {
      for (const id of assignment.selectedSpan) {
        const list = owners.get(id) ?? [];
        list.push(finiteVerbId);
        owners.set(id, list);
      }
    }
    return owners;
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
        reference: `${bookInfo.displayName} ${finiteVerb.chapter}:${finiteVerb.verse}`,
        spanText: assignment ? formatClauseSpan(assignment.selectedSpan, verseWords, verseText) : "",
        selectedWords,
        greekRange,
        beginningTokens: getClauseBeginningTokens(greekRange),
        hasDependentIntroducer: selectedWords.some(word => word.dependentIntroducerId)
      };
    });
  }, [assignments, bookInfo.displayName, finiteVerbs, verseTextByKey, wordById, wordsByVerse]);

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
    const nominalHeadIds = readNominalClauseHeadIds(bookId);
    const ids = new Set<string>();
    for (const input of clauseSignalInputs) {
      if (!input.finiteVerbId) continue;
      if (detectClauseSignal(input, clauseSignalInputs).kind !== "none") continue;
      // A hand-marked nominal head claims its own predicate, and inheritance
      // would silently settle it as a continuation — leaving no Q1/Q2/Q3 to
      // answer and no way to say otherwise. 1 Peter 3:8's transitional δέ is
      // the case in point: a command, not a coupling.
      if (nominalHeadIds.has(input.finiteVerbId)) continue;
      if (detectLeadingCoordinator(input.beginningTokens, input.finiteVerbId)) ids.add(input.finiteVerbId);
    }
    return ids;
  }, [bookId, clauseSignalInputs]);

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
    writeClauseAssignments(next, bookId);
  }, [assignments, bookId, clauseRows]);

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

  const workspaceClauseRows = reviewClauseRows;

  const reviewedCount = useMemo(
    () => reviewClauseRows.filter(row => getClauseReviewState(row) !== "Unreviewed").length,
    [getClauseReviewState, reviewClauseRows]
  );

  const unreviewedClauseRows = useMemo(
    () => reviewClauseRows.filter(row => getClauseReviewState(row) === "Unreviewed"),
    [getClauseReviewState, reviewClauseRows]
  );

  const categorizedClauseRows = useMemo(
    () => reviewClauseRows.filter(row => getClauseReviewState(row) !== "Unreviewed"),
    [getClauseReviewState, reviewClauseRows]
  );

  // Actor SVO: span saved, but Quién actúa not yet observed (verb defaults alone don't count).
  const missingActorClauseRows = useMemo(
    () =>
      reviewClauseRows.filter(row => {
        const id = row.finiteVerb.finiteVerbId;
        if (!id || !row.selectedWords.length) return false;
        return !(clauseActors[id]?.subjectSpan?.length);
      }),
    [clauseActors, reviewClauseRows]
  );

  // Tokens belonging to the clause currently open in the review panel —
  // highlighted in the (always-Greek) passage so the workstation and the
  // panel stay visually linked without flipping language mid-verse.
  const reviewingGreekTokenIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeBeginningVerbId) return ids;
    const assignment = assignments[activeBeginningVerbId];
    if (!assignment?.greekStartTokenId || !assignment.greekEndTokenId) return ids;
    const start = parseGreekTokenId(assignment.greekStartTokenId);
    const end = parseGreekTokenId(assignment.greekEndTokenId);
    if (!start || !end) return ids;
    for (let token = start.token; token <= end.token; token += 1) {
      ids.add(`${start.chapter}:${start.verse}:${token}`);
    }
    return ids;
  }, [activeBeginningVerbId, assignments]);

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

  // When attaching a content/frame clause, the real governor may be another
  // finite in the same verse that still has no clause span — so it never
  // appears in the parent list (e.g. 4:18 εἰ…σῴζεται waiting on φανεῖται).
  const unassignedSameVerseFinites = useMemo(() => {
    if (!activeBeginningRow?.finiteVerb.finiteVerbId) return [];
    const activeId = activeBeginningRow.finiteVerb.finiteVerbId;
    const chapter = activeBeginningRow.finiteVerb.chapter;
    const verse = activeBeginningRow.finiteVerb.verse;
    const assignedIds = new Set(
      Object.entries(assignments)
        .filter(([, assignment]) => (assignment.selectedSpan?.length ?? 0) > 0)
        .map(([id]) => id)
    );
    return finiteVerbs.filter(word => {
      if (!word.finiteVerbId || word.finiteVerbId === activeId) return false;
      if (word.chapter !== chapter || word.verse !== verse) return false;
      return !assignedIds.has(word.finiteVerbId);
    });
  }, [activeBeginningRow, assignments, finiteVerbs]);

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

  // Word ids inside Independent (root) clause spans — used when picking a
  // relative's noun so host material stands out in the chapter text.
  const independentClauseWordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const clause of outline) {
      for (const wordId of clause.wordIds) ids.add(wordId);
    }
    return ids;
  }, [outline]);

  const activeClauseWordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const word of activeBeginningRow?.selectedWords ?? []) ids.add(word.id);
    return ids;
  }, [activeBeginningRow]);

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
      const marker = detectClauseMarker(beginningTokens, resolved.relation, resolved.frameType, clause.finiteVerbId);
      if (marker) map.set(clause.finiteVerbId, marker);
    }
    return map;
  }, [augmentedObservations, clauseSignalInputs, clauseSpanInfos]);

  const activeSignal = useMemo<ClauseSignal | null>(() => {
    const finiteVerbId = activeBeginningRow?.finiteVerb.finiteVerbId;
    if (!finiteVerbId) return null;
    const input = clauseSignalInputs.find(candidate => candidate.finiteVerbId === finiteVerbId);
    if (!input) return null;
    return detectClauseSignal(input, clauseSignalInputs);
  }, [activeBeginningRow, clauseSignalInputs]);

  const activeChoiceGuidance = useMemo(() => {
    const finiteVerbId = activeBeginningRow?.finiteVerb.finiteVerbId;
    if (!finiteVerbId || !activeSignal) return null;
    const input = clauseSignalInputs.find(candidate => candidate.finiteVerbId === finiteVerbId);
    if (!input) return null;
    return buildClauseChoiceGuidance(input, activeSignal, clauseSignalInputs);
  }, [activeBeginningRow, activeSignal, clauseSignalInputs]);

  const activeFrameType = useMemo<FrameType | undefined>(() => {
    if (!activeBeginningRow) return undefined;
    return detectLeadingFrameType(
      activeBeginningRow.beginningTokens,
      activeBeginningRow.finiteVerb.finiteVerbId ?? undefined
    );
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

  // Skeleton/Compiler resolve against augmented observations (including
  // coordinate inheritance). The review panel must use the same resolution —
  // raw all-no answers look like "Independent" even when inheritance nests
  // the clause as a dependent (the 1:5:12 pattern).
  const activeResolved = useMemo(() => {
    if (!activeBeginningVerbId) return null;
    const info = clauseSpanInfos.find(clause => clause.finiteVerbId === activeBeginningVerbId);
    if (!info) return null;
    return resolveClause(info, augmentedObservations[activeBeginningVerbId], clauseSpanInfos);
  }, [activeBeginningVerbId, augmentedObservations, clauseSpanInfos]);

  const isActiveInherited = Boolean(
    activeBeginningVerbId &&
      coordinateContinuationIds.has(activeBeginningVerbId) &&
      activeResolved?.relation &&
      activeResolved.relation !== "root"
  );

  const isActiveClauseRoot = activeResolved?.relation === "root";

  const describeClauseCategory = useCallback(
    (row: ClauseOutputRow): string => {
      const finiteVerbId = row.finiteVerb.finiteVerbId;
      if (!finiteVerbId) return "Unreviewed";
      const reviewState = getClauseReviewState(row);
      if (reviewState === "Unreviewed") return "Unreviewed";
      if (reviewState === "Not sure") return "Not sure";
      const info = clauseSpanInfos.find(clause => clause.finiteVerbId === finiteVerbId);
      if (!info) return reviewState;
      const resolved = resolveClause(info, augmentedObservations[finiteVerbId], clauseSpanInfos);
      if (resolved.parked) return "Relative (needs a home)";
      if (resolved.relation === "root") return "Independent";
      if (resolved.relation === "describes") return "Relative clause";
      if (resolved.relation === "content") return "Content clause";
      if (resolved.relation === "frame") {
        return resolved.frameType ? `${capitalize(resolved.frameType)} clause` : "Adverbial clause";
      }
      if (coordinateContinuationIds.has(finiteVerbId)) return "Continues previous";
      return reviewState;
    },
    [augmentedObservations, clauseSpanInfos, coordinateContinuationIds, getClauseReviewState]
  );

  // Noun pickers (relative clauses / attributive participles) need the host
  // noun even when it sits several verses away (e.g. 1 Pet 1:12 looking back
  // into earlier ch. 1). Same-chapter is the practical window — ±1 verse was
  // too tight.
  const activeObservationContextVerses = useMemo(() => {
    if (!activeBeginningRow) return [];
    return verses.filter(verse => verse.chapter === activeBeginningRow.finiteVerb.chapter);
  }, [activeBeginningRow, verses]);

  // Keep the active verse visible inside the chapter-length context panel —
  // never scroll the window. scrollIntoView on a nested node also scrolls
  // every ancestor (including the page), which yanked the viewport to the
  // bottom after Save when the row object identity changed.
  useEffect(() => {
    if (!activeBeginningRow) return;
    const key = `${activeBeginningRow.finiteVerb.chapter}:${activeBeginningRow.finiteVerb.verse}`;
    const node = document.querySelector<HTMLElement>(`[data-context-verse="${CSS.escape(key)}"]`);
    const panel = node?.closest<HTMLElement>(".clause-context-panel");
    if (!node || !panel) return;
    const nodeTop = node.offsetTop - panel.offsetTop;
    const nodeBottom = nodeTop + node.offsetHeight;
    if (nodeTop < panel.scrollTop) {
      panel.scrollTop = nodeTop;
    } else if (nodeBottom > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = nodeBottom - panel.clientHeight;
    }
  }, [
    activeBeginningVerbId,
    activeBeginningRow?.finiteVerb.chapter,
    activeBeginningRow?.finiteVerb.verse,
    activeObservation.describesNoun
  ]);

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

  // A different layer entirely from the skeleton: verses with no finite verb
  // at all (Titus 1:1's long verbless run) never enter Brick 1, so they'd
  // otherwise be silently absent everywhere. Shown, not solved — per spec,
  // deciding their grammatical role now would force the structure to fit a
  // premature decision. Brick-4-marked participles in those verses are listed
  // read-only so they aren't silently missing either.
  const verblessVerses = useMemo(() => {
    const verbless = getVersesWithoutFiniteVerb();
    return verses
      .filter(verse => verbless.has(`${verse.chapter}:${verse.verse}`))
      .map(verse => {
        const verseKey = `${verse.chapter}:${verse.verse}`;
        const participles = Array.from(participleMarkedAlignmentIds)
          .map(id => wordByParticipleId.get(id))
          .filter((word): word is SpanishWord => Boolean(word && `${word.chapter}:${word.verse}` === verseKey))
          .sort((a, b) => a.index - b.index);
        return {
          reference: `${bookInfo.displayName} ${verse.chapter}:${verse.verse}`,
          text: verse.text,
          words: verse.words,
          participles
        };
      });
  }, [bookInfo.displayName, participleMarkedAlignmentIds, verses, wordByParticipleId]);

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

  // Only participles whose Spanish word sits inside a saved same-verse clause
  // span belong with that clause. Nearest-neighbor fallback was stealing words
  // from elsewhere in the verse (1 Pet 1:7: ἀπολλυμένου / δοκιμαζομένου ride
  // with «oro», not with the later «sea hallada» span). Orphans stay verse-local
  // and surface in the Skeleton list below — never on the wrong clause card.
  const participleClauseAssignment = useMemo(() => {
    const assignment = new Map<string, string | null>();

    for (const participleId of participleMarkedAlignmentIds) {
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      const participleVerse = `${word.chapter}:${word.verse}`;

      // Span membership can cross verses (1 Pet 1:3–6). Never let a later
      // finite-verb span claim a participle from an earlier verse.
      const exactClauseId = wordIdToClauseId.get(word.id);
      if (exactClauseId && verseKeyFromId(exactClauseId) === participleVerse) {
        assignment.set(participleId, exactClauseId);
      } else {
        assignment.set(participleId, null);
      }
    }

    return assignment;
  }, [participleMarkedAlignmentIds, wordByParticipleId, wordIdToClauseId]);

  const orphanParticiplesByVerse = useMemo(() => {
    const groups = new Map<string, SpanishWord[]>();
    for (const participleId of participleMarkedAlignmentIds) {
      if (participleClauseAssignment.get(participleId)) continue;
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      const key = `${word.chapter}:${word.verse}`;
      const group = groups.get(key) ?? [];
      group.push(word);
      groups.set(key, group);
    }
    for (const group of groups.values()) group.sort((a, b) => a.index - b.index);
    return groups;
  }, [participleClauseAssignment, participleMarkedAlignmentIds, wordByParticipleId]);

  const participleWordsByClauseId = useMemo(() => {
    const groups = new Map<string, SpanishWord[]>();
    for (const participleId of participleMarkedAlignmentIds) {
      const clauseId = participleClauseAssignment.get(participleId);
      const word = wordByParticipleId.get(participleId);
      if (!clauseId || !word) continue;
      const group = groups.get(clauseId) ?? [];
      group.push(word);
      groups.set(clauseId, group);
    }
    for (const group of groups.values()) group.sort((a, b) => a.index - b.index);
    return groups;
  }, [participleClauseAssignment, participleMarkedAlignmentIds, wordByParticipleId]);

  const activeParticiples = useMemo(() => {
    const clauseId = activeBeginningRow?.finiteVerb.finiteVerbId;
    if (!clauseId) return [];
    return participleWordsByClauseId.get(clauseId) ?? [];
  }, [activeBeginningRow, participleWordsByClauseId]);

  const orphanParticipleVerses = useMemo(() => {
    const verbless = getVersesWithoutFiniteVerb();
    return Array.from(orphanParticiplesByVerse.entries())
      .filter(([key]) => !verbless.has(key))
      .map(([key, participles]) => {
        const [chapter, verse] = key.split(":").map(Number);
        const verseObj = verses.find(v => v.chapter === chapter && v.verse === verse);
        return {
          key,
          reference: `${bookInfo.displayName} ${chapter}:${verse}`,
          text: verseObj?.text ?? "",
          words: verseObj?.words ?? [],
          participles
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [bookInfo.displayName, orphanParticiplesByVerse, verses]);

  // Clause-attached nominatives that still need (or already have) a manual
  // subject host — worked in the bottom Skeleton section, same workflow as
  // phrase orphans, not in the tree or clause-review panel.
  const clauseSubjectHostEntries = useMemo(() => {
    const entries: {
      key: string;
      reference: string;
      text: string;
      words: SpanishWord[];
      participles: SpanishWord[];
      sourceChapter: number;
      sourceVerse: number;
    }[] = [];
    for (const [clauseId, participles] of participleWordsByClauseId) {
      if (!participles.length) continue;
      const sourceChapter = participles[0].chapter;
      const sourceVerse = participles[0].verse;
      const nearby =
        verses.find(v => v.chapter === sourceChapter && v.verse === sourceVerse)?.words ?? [];
      const groups = groupParticiplesByNounHost(
        participles,
        nearby,
        (participleSubjectHosts[clauseId] ?? [])
          .map(id => wordById.get(id))
          .filter((word): word is SpanishWord => Boolean(word))
      );
      const relevant =
        pickingSubjectHostKey === clauseId ||
        groups.some(group => group.needsHostPick || group.isManualHost);
      if (!relevant) continue;
      const row = finiteVerbIdToRow.get(clauseId);
      entries.push({
        key: clauseId,
        reference: row?.reference ?? `${bookInfo.displayName} ${sourceChapter}:${sourceVerse}`,
        text: row ? formatClauseSpan(
          assignments[clauseId]?.selectedSpan ?? [],
          nearby,
          verses.find(v => v.chapter === sourceChapter && v.verse === sourceVerse)?.text ?? ""
        ) : "",
        words: nearby,
        participles,
        sourceChapter,
        sourceVerse
      });
    }
    return entries.sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }));
  }, [
    assignments,
    bookInfo.displayName,
    finiteVerbIdToRow,
    participleSubjectHosts,
    participleWordsByClauseId,
    pickingSubjectHostKey,
    verses,
    wordById
  ]);

  const pendingObservationScrollRef = useRef(false);

  const scrollObservationCenterIntoView = useCallback(() => {
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-observation-center]")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }, 40);
  }, []);

  const requestObservationScroll = useCallback(() => {
    pendingObservationScrollRef.current = true;
    // Also scroll immediately after the next paint. The active clause may
    // already be selected, in which case the state-dependent effect below
    // will not run.
    scrollObservationCenterIntoView();
  }, [scrollObservationCenterIntoView]);

  useEffect(() => {
    if (!pendingObservationScrollRef.current || !activeBeginningVerbId) return;
    pendingObservationScrollRef.current = false;
    scrollObservationCenterIntoView();
  }, [activeBeginningVerbId, scrollObservationCenterIntoView]);

    // Sequence — Reason / Statement / Imperative / Purpose / Recipient, one entry per root
  // clause, book order. Everything here is computed from data already
  // collected elsewhere (frameType, mood brick marks, participle
  // classifications); nothing new is detected or tagged.
  const statementMarkedIds = useMemo(
    () => readMarkedAlignmentIds(progressKeys.statementMarks, bookId),
    [bookId, progressKeys]
  );
  const imperativeMarkedIds = useMemo(
    () => readMarkedAlignmentIds(progressKeys.commandMarks, bookId),
    [bookId, progressKeys]
  );

  // A reason clause can sit several levels under the root it justifies, not
  // just directly attached to it — same reasoning as same-verse participle
  // satellites that ride a finite clause without becoming tree nodes.
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

  /** Reason-frame clauses for convergence scoring + verse dashboard. */
  const reasonHits = useMemo((): ReasonHit[] => {
    const hits: ReasonHit[] = [];
    for (const clause of clauseSpanInfos) {
      const resolved = resolveClause(clause, augmentedObservations[clause.finiteVerbId], clauseSpanInfos);
      if (resolved.relation !== "frame" || resolved.frameType !== "reason") continue;
      const rootId = findRootAncestor(clause.finiteVerbId, clauseSpanInfos, augmentedObservations);
      if (!rootId) continue;
      hits.push({
        finiteVerbId: clause.finiteVerbId,
        rootId,
        reference: clause.reference,
        spanText: clause.spanText
      });
    }
    return hits;
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

  // Brick 2B keeps its original purpose — who an imperative is addressed to —
  // read-only here, same as every other Sequence category.
  const recipientAssignments = useMemo(() => readCommandRecipientAssignments(bookId), [bookId]);

  const sequenceEntries = useMemo(() => {
    const base = outline.map(clause => ({
      finiteVerbId: clause.finiteVerbId,
      reference: clause.reference,
      spanText: clause.spanText,
      isReason: rootReasonIds.has(clause.finiteVerbId),
      isStatement: statementRootIds.has(clause.finiteVerbId),
      isImperative: imperativeRootIds.has(clause.finiteVerbId),
      isPurpose: rootPurposeIds.has(clause.finiteVerbId),
      recipient: recipientAssignments.get(clause.finiteVerbId) ?? null
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
    rootPurposeIds,
    rootReasonIds,
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
    if (activeBeginningVerbId || !reviewClauseRows.length) return;
    const firstOpenRow =
      reviewClauseRows.find(row => getClauseReviewState(row) === "Unreviewed") ?? reviewClauseRows[0];
    setActiveBeginningVerbId(firstOpenRow.finiteVerb.finiteVerbId ?? null);
  }, [activeBeginningVerbId, getClauseReviewState, reviewClauseRows]);

  useEffect(() => {
    setForceChoices(false);
    setShowGreekBeginning(false);
    setNounAnchorId(null);
    setAutoAdvancedNoticeId(autoAdvanceRef.current ? activeBeginningVerbId : null);
    autoAdvanceRef.current = false;
  }, [activeBeginningVerbId]);

  const selectVerb = useCallback(
    (verb: SpanishWord, options?: { scrollTo?: "passage" | "observation" | "none" }) => {
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

      const scrollTo = options?.scrollTo ?? "passage";
      if (scrollTo === "observation") {
        requestObservationScroll();
        setActiveBeginningVerbId(verb.finiteVerbId);
        return;
      }
      if (scrollTo === "none") return;

      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-token-id="${verb.finiteVerbId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }, 20);
    },
    [assignments, requestObservationScroll]
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
      // Subject-host naming is observation-only — don't start/edit a clause span.
      if (pickingSubjectHostKey) return;

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
    [activeVerb, applyGreekRange, finiteVerbByAlignmentId, greekRangeAnchorToken, pickingSubjectHostKey, selectVerb]
  );

  // Clear must remove the *saved* assignment, not only the in-memory draft.
  // Saved highlighting (clause-greek-token--saved) is derived from
  // assignments in localStorage — wiping draft alone left 1:2 and every
  // other saved clause looking permanently marked.
  const clearActive = useCallback(() => {
    setDraftGreekRange(null);
    setGreekRangeAnchorToken(null);
    if (!activeVerbId) return;
    setAssignments(current => {
      if (!current[activeVerbId]) return current;
      const next = { ...current };
      delete next[activeVerbId];
      writeClauseAssignments(next, bookId);
      return next;
    });
  }, [activeVerbId, bookId]);

  // One-click fix for span-audit rows: keep the stored Greek range, rewrite
  // selectedSpan from it (Greek → LBF). Save used to look like a no-op because
  // the audit still re-derived Greek from Spanish the other way.
  const resyncSpanishFromStoredGreek = useCallback(
    (finiteVerbId: string) => {
      const assignment = assignments[finiteVerbId];
      if (!assignment?.greekStartTokenId || !assignment.greekEndTokenId) return;
      const start = parseGreekTokenId(assignment.greekStartTokenId);
      const end = parseGreekTokenId(assignment.greekEndTokenId);
      if (!start || !end) return;
      const verseWords = wordsByVerse.get(`${start.chapter}:${start.verse}`) ?? [];
      const selectedSpan = deriveSpanishSpanFromGreekRange(
        start.chapter,
        start.verse,
        Math.min(start.token, end.token),
        Math.max(start.token, end.token),
        verseWords,
        bookId
      );
      if (!selectedSpan.length) return;
      setAssignments(current => {
        const existing = current[finiteVerbId];
        if (!existing) return current;
        const next = {
          ...current,
          [finiteVerbId]: {
            ...existing,
            selectedSpan,
            greekConfirmedAt: existing.greekConfirmedAt ?? new Date().toISOString()
          }
        };
        writeClauseAssignments(next, bookId);
        return next;
      });
    },
    [assignments, bookId, wordsByVerse]
  );

  const saveActive = useCallback(() => {
    if (!activeVerbId || !activeVerb || !draftGreekRange) return;
    const greekStartTokenId = `${activeVerb.chapter}:${activeVerb.verse}:${draftGreekRange.start}`;
    const greekEndTokenId = `${activeVerb.chapter}:${activeVerb.verse}:${draftGreekRange.end}`;
    // Preserve place in the passage — Save used to reflow audits/lists and
    // nested scrollIntoView calls yanked the window to the bottom.
    const scrollY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

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
      writeClauseAssignments(next, bookId);
      return next;
    });
    setActiveVerbId(null);
    setDraftGreekRange(null);
    setGreekRangeAnchorToken(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
    });
  }, [activeVerb, activeVerbId, bookId, draftGreekRange, draftSpan]);

  // Reload draft from storage when the active verb changes — not on every
  // assignments write. Otherwise deleting a span (Clear) or saving would
  // fight the draft state, and a stale restore made cleared clauses look stuck.
  useEffect(() => {
    if (!activeVerbId) {
      setDraftGreekRange(null);
      return;
    }
    const existing = assignments[activeVerbId];
    if (existing?.greekStartTokenId && existing.greekEndTokenId) {
      const start = parseGreekTokenId(existing.greekStartTokenId);
      const end = parseGreekTokenId(existing.greekEndTokenId);
      if (start && end) {
        setDraftGreekRange({ start: start.token, end: end.token });
        setGreekRangeAnchorToken(start.token);
        return;
      }
    }
    setDraftGreekRange(null);
    setGreekRangeAnchorToken(null);
    // intentionally only when the selected verb changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignments read once per verb focus
  }, [activeVerbId]);

  const inspectClauseBeginning = useCallback(
    (row: ClauseOutputRow) => {
      if (!row.finiteVerb.finiteVerbId) return;
      requestObservationScroll();
      setActiveBeginningVerbId(row.finiteVerb.finiteVerbId);
      // Observation only — do not open the Save/Clear span panel.
      setActiveVerbId(null);
      setDraftGreekRange(null);
      setGreekRangeAnchorToken(null);
    },
    [requestObservationScroll]
  );

  // Skeleton is for scanning; fixing happens in the review panel. Always close
  // the popup so the selected clause is reachable (drawer-over-review was a trap).
  // editSpan: true opens the Save/Clear panel (Greek span editing) — only for
  // flows that actually need to change belonging, e.g. unparking a relative.
  const openClauseFromSkeleton = useCallback(
    (finiteVerbId: string, options?: { editSpan?: boolean }) => {
      setStructureMode("passage");
      closeSkeletonPopup();
      requestObservationScroll();
      setActiveBeginningVerbId(finiteVerbId);
      const row = finiteVerbIdToRow.get(finiteVerbId);
      if (options?.editSpan && row) {
        selectVerb(row.finiteVerb, { scrollTo: "none" });
        return;
      }
      setActiveVerbId(null);
      setDraftGreekRange(null);
      setGreekRangeAnchorToken(null);
    },
    [closeSkeletonPopup, finiteVerbIdToRow, requestObservationScroll, selectVerb]
  );

  // Parked relatives nest under a *different* clause that contains their noun.
  // Opening that host (not the relative) is the span edit that can actually unpark.
  const openHostToIncludeNoun = useCallback(
    (hostVerbId: string, parkedReference: string, nounText: string) => {
      setHostFixHint({ hostVerbId, parkedReference, nounText });
      setShowSpanishOnly(false);
      openClauseFromSkeleton(hostVerbId, { editSpan: true });
    },
    [openClauseFromSkeleton]
  );

  /** One-click: stretch a same-verse host’s Greek span until it covers the noun. */
  const expandHostSpanToIncludeNoun = useCallback(
    (hostVerbId: string, nounIds: string[], parkedReference: string, nounText: string) => {
      const assignment = assignments[hostVerbId];
      const hostVerse = verseKeyFromId(hostVerbId);
      if (!assignment || !hostVerse) {
        openHostToIncludeNoun(hostVerbId, parkedReference, nounText);
        return;
      }
      const sameVerseNounIds = nounIds.filter(id => verseKeyFromId(id) === hostVerse);
      if (!sameVerseNounIds.length) {
        openHostToIncludeNoun(hostVerbId, parkedReference, nounText);
        return;
      }
      const verseWords = wordsByVerse.get(hostVerse) ?? [];
      const merged = new Set([...assignment.selectedSpan, ...sameVerseNounIds]);
      const expandedSpan = verseWords.map(word => word.id).filter(id => merged.has(id));
      const greek = deriveGreekClauseRange(expandedSpan, verseWords, hostVerbId);
      if (!greek) {
        openHostToIncludeNoun(hostVerbId, parkedReference, nounText);
        return;
      }
      const start = parseGreekTokenId(greek.greekStartTokenId);
      const end = parseGreekTokenId(greek.greekEndTokenId);
      if (!start || !end) {
        openHostToIncludeNoun(hostVerbId, parkedReference, nounText);
        return;
      }
      const selectedSpan = deriveSpanishSpanFromGreekRange(
        start.chapter,
        start.verse,
        Math.min(start.token, end.token),
        Math.max(start.token, end.token),
        verseWords,
        bookId
      );
      if (!selectedSpan.length || !sameVerseNounIds.every(id => selectedSpan.includes(id))) {
        // Couldn’t cover the noun from Greek — fall back to manual expand.
        openHostToIncludeNoun(hostVerbId, parkedReference, nounText);
        return;
      }
      setAssignments(current => {
        const next = {
          ...current,
          [hostVerbId]: {
            finiteVerbId: hostVerbId,
            selectedSpan,
            greekStartTokenId: greek.greekStartTokenId,
            greekEndTokenId: greek.greekEndTokenId,
            greekConfirmedAt: new Date().toISOString()
          }
        };
        writeClauseAssignments(next, bookId);
        return next;
      });
      setHostFixHint(null);
      setActiveVerbId(null);
      setDraftGreekRange(null);
      setGreekRangeAnchorToken(null);
    },
    [assignments, bookId, openHostToIncludeNoun, wordsByVerse]
  );

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
        writeClauseObservations(next, bookId);
        return next;
      });
    },
    [activeBeginningVerbId, bookId]
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
    if (nextId) requestObservationScroll();
    setActiveBeginningVerbId(nextId);
  }, [activeBeginningRow, getClauseReviewState, requestObservationScroll, reviewClauseRows]);

  // Single-choice classification: pick one shape, first-yes-wins, no separate
  // question for the other two. Choosing "describes"/"content"/"frame" only sets
  // that field to "yes" — the other two stay unset, which is what lets the tree
  // treat a clause as resolved via any one relation rather than requiring all
  // three answered like the old fixed-order flow did.
  const chooseRoot = useCallback(() => {
    setForceChoices(false);
    updateActiveObservation({
      describesNoun: "no",
      isWhatWasExpressed: "no",
      tellsWhenOrIf: "no",
      describedNounSpan: [],
      expressedParentClauseId: "",
      whenIfParentClauseId: "",
      frameType: undefined
    });
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

  const chooseByKind = useCallback(
    (kind: ClauseChoiceKind) => {
      if (kind === "describes") chooseDescribes();
      else if (kind === "content") chooseContent();
      else if (kind === "frame") chooseFrame();
      else chooseRoot();
    },
    [chooseContent, chooseDescribes, chooseFrame, chooseRoot]
  );

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

  const manualSubjectHostWords = useCallback(
    (hostKey: string | null | undefined) => {
      if (!hostKey) return [] as SpanishWord[];
      const ids = participleSubjectHosts[hostKey] ?? [];
      return ids.map(id => wordById.get(id)).filter((word): word is SpanishWord => Boolean(word));
    },
    [participleSubjectHosts, wordById]
  );

  const updateSubjectHostSpan = useCallback(
    (hostKey: string, span: string[]) => {
      setParticipleSubjectHosts(current => {
        const next = { ...current };
        if (span.length) next[hostKey] = span;
        else delete next[hostKey];
        writeParticipleSubjectHosts(next, bookId);
        return next;
      });
    },
    [bookId]
  );

  const selectSubjectHostWord = useCallback(
    (hostKey: string, word: SpanishWord, event: MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && subjectHostAnchorId) {
        const anchor = wordById.get(subjectHostAnchorId);
        if (anchor) {
          const span = spanFromRange(anchor, word);
          if (span) {
            updateSubjectHostSpan(hostKey, span);
            setPickingSubjectHostKey(null);
          }
          return;
        }
      }
      setSubjectHostAnchorId(word.id);
      updateSubjectHostSpan(hostKey, [word.id]);
      setPickingSubjectHostKey(null);
    },
    [subjectHostAnchorId, updateSubjectHostSpan, wordById]
  );

  const beginSubjectHostPick = useCallback(
    (hostKey: string, options?: { force?: boolean }) => {
      const nextKey =
        !options?.force && pickingSubjectHostKey === hostKey ? null : hostKey;
      setPickingSubjectHostKey(nextKey);
      setPickingActorField(null);
      setActorAnchorId(null);
      // Naming a subject host must not also edit clause belonging — clear any
      // open Save/Clear span session.
      setActiveVerbId(null);
      setDraftGreekRange(null);
      setGreekRangeAnchorToken(null);
      if (!nextKey) return;
      // Always work host picks in the bottom Skeleton section (phrase-style
      // chapter list) — never jump to clause review or land on the tree.
      setSkeletonOpen(true);
      setSkeletonMaximized(false);
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-subject-host-key="${CSS.escape(nextKey)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        document
          .querySelector<HTMLElement>('[data-host-source-verse="true"]')
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    },
    [pickingSubjectHostKey]
  );

  const renderSubjectHostChapterPicker = useCallback(
    (hostKey: string, sourceChapter: number, sourceVerse: number) => {
      if (pickingSubjectHostKey !== hostKey) return null;
      const isPhrase = hostKey.split(":").length === 2;
      return (
        <div className="clause-subject-host-picker" aria-label="Pick who they ride with">
          <p className="clause-participle-host-picker-note" role="status">
            {isPhrase
              ? "Phrase participle — tap who they ride with in any verse. This does not change a clause span."
              : "Tap who they ride with in any verse. This does not change the clause span."}
          </p>
          {verses
            .filter(v => v.chapter === sourceChapter)
            .map(chapterVerse => {
              const isSourceVerse =
                chapterVerse.chapter === sourceChapter && chapterVerse.verse === sourceVerse;
              return (
                <p
                  className={
                    isSourceVerse
                      ? "clause-subject-host-verse clause-subject-host-verse--current"
                      : "clause-subject-host-verse"
                  }
                  key={`${chapterVerse.chapter}:${chapterVerse.verse}`}
                  data-host-source-verse={isSourceVerse ? "true" : undefined}
                >
                  <span className="clause-subject-host-verse-label">
                    {chapterVerse.chapter}:{chapterVerse.verse}
                  </span>
                  <span className="clause-subject-host-verse-text">
                    {chapterVerse.words.map((word, position) => (
                      <span key={word.id}>
                        {position > 0 ? " " : null}
                        <button
                          type="button"
                          className={
                            (participleSubjectHosts[hostKey] ?? []).includes(word.id)
                              ? "clause-noun-word clause-noun-word--selected"
                              : "clause-noun-word clause-noun-word--subject-host"
                          }
                          onClick={event => selectSubjectHostWord(hostKey, word, event)}
                        >
                          {word.text}
                        </button>
                      </span>
                    ))}
                  </span>
                </p>
              );
            })}
        </div>
      );
    },
    [participleSubjectHosts, pickingSubjectHostKey, selectSubjectHostWord, verses]
  );

  // Host first (oro / ustedes), participles under it. Subject-host picking
  // always happens in the bottom Skeleton chapter list — not beside the tree
  // and not in the clause-review panel.
  const renderParticipleNounGroups = useCallback(
    (participles: SpanishWord[], nearbyWords: SpanishWord[], hostKey: string) => {
      if (!participles.length) return null;
      const groups = groupParticiplesByNounHost(
        participles,
        nearbyWords,
        manualSubjectHostWords(hostKey)
      );
      const picking = pickingSubjectHostKey === hostKey;
      return (
        <div className="clause-participle-noun-groups" aria-label="What hangs on the host">
          {groups.map(group => (
            <div
              className={[
                "clause-participle-noun-group",
                group.needsHostPick ? "clause-participle-noun-group--pick" : "",
                !group.noun && !group.needsHostPick && !group.isManualHost
                  ? "clause-participle-noun-group--role"
                  : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={group.noun?.id ?? `${group.hostLabel}:${group.items[0]?.word.participleId ?? ""}`}
            >
              <div className="clause-participle-noun-host">
                {group.needsHostPick ? (
                  <button
                    type="button"
                    className={
                      picking
                        ? "clause-participle-host-pick clause-participle-host-pick--active"
                        : "clause-participle-host-pick"
                    }
                    onClick={event => {
                      event.stopPropagation();
                      beginSubjectHostPick(hostKey);
                    }}
                  >
                    {picking ? "Tap a word in the list below →" : group.hostLabel}
                  </button>
                ) : (
                  <div className="clause-participle-noun-host-row">
                    <span>{group.hostLabel}</span>
                    {group.isManualHost ? (
                      <button
                        type="button"
                        className="clause-participle-host-clear"
                        onClick={event => {
                          event.stopPropagation();
                          updateSubjectHostSpan(hostKey, []);
                          beginSubjectHostPick(hostKey, { force: true });
                        }}
                      >
                        Change
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <ul className="clause-participle-noun-children">
                {group.items.map(({ word, reading }) => (
                  <li key={word.participleId}>
                    <span className="clause-participle-satellite-text">
                      {reading.spanish}
                      {reading.greek && reading.greek !== reading.spanish ? (
                        <span className="clause-participle-satellite-greek"> · {reading.greek}</span>
                      ) : null}
                    </span>
                    <span className="clause-participle-satellite-form">{reading.formLine}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    },
    [
      beginSubjectHostPick,
      manualSubjectHostWords,
      pickingSubjectHostKey,
      updateSubjectHostSpan
    ]
  );

  const spanTextFromIds = useCallback(
    (ids: string[]): string => {
      if (!ids.length) return "";
      const first = wordById.get(ids[0]);
      if (!first) return "";
      return formatClauseSpan(
        ids,
        wordsByVerse.get(`${first.chapter}:${first.verse}`) ?? [],
        verseTextByKey.get(`${first.chapter}:${first.verse}`) ?? ""
      ).trim();
    },
    [verseTextByKey, wordById, wordsByVerse]
  );

  const defaultVerbSpanFor = useCallback(
    (finiteVerbId: string): string[] => {
      for (const words of wordsByVerse.values()) {
        const hit = words.find(word => word.finiteVerbId === finiteVerbId);
        if (hit) return [hit.id];
      }
      return [];
    },
    [wordsByVerse]
  );

  const actorObservationFor = useCallback(
    (finiteVerbId: string | null | undefined): ClauseActorObservation => {
      if (!finiteVerbId) return { subjectSpan: [], verbSpan: [], objectSpan: [] };
      const stored = clauseActors[finiteVerbId];
      const verbSpan = stored?.verbSpan?.length
        ? stored.verbSpan
        : defaultVerbSpanFor(finiteVerbId);
      return {
        subjectSpan: stored?.subjectSpan ?? [],
        verbSpan,
        objectSpan: stored?.objectSpan ?? []
      };
    },
    [clauseActors, defaultVerbSpanFor]
  );

  const updateActorField = useCallback(
    (finiteVerbId: string, field: "subject" | "verb" | "object", span: string[]) => {
      setClauseActors(current => {
        const prior = current[finiteVerbId] ?? {
          subjectSpan: [],
          verbSpan: defaultVerbSpanFor(finiteVerbId),
          objectSpan: []
        };
        const nextRow: ClauseActorObservation = {
          subjectSpan: field === "subject" ? span : prior.subjectSpan,
          verbSpan:
            field === "verb"
              ? span
              : prior.verbSpan.length
                ? prior.verbSpan
                : defaultVerbSpanFor(finiteVerbId),
          objectSpan: field === "object" ? span : prior.objectSpan
        };
        const next = { ...current };
        if (!nextRow.subjectSpan.length && !nextRow.objectSpan.length && !nextRow.verbSpan.length) {
          delete next[finiteVerbId];
        } else {
          next[finiteVerbId] = nextRow;
        }
        writeClauseActors(next, bookId);
        return next;
      });
    },
    [bookId, defaultVerbSpanFor]
  );

  const beginActorFieldPick = useCallback(
    (field: "subject" | "verb" | "object") => {
      setPickingSubjectHostKey(null);
      setActiveVerbId(null);
      setDraftGreekRange(null);
      setGreekRangeAnchorToken(null);
      setActorAnchorId(null);
      setPickingActorField(current => (current === field ? null : field));
    },
    []
  );

  // Keep the clause verse (or an existing field pick’s verse) visible inside
  // the actor chapter list — scroll only that picker, not the window.
  useEffect(() => {
    if (!pickingActorField || !activeBeginningRow || !activeBeginningVerbId) return;
    const actor = actorObservationFor(activeBeginningVerbId);
    const span =
      pickingActorField === "subject"
        ? actor.subjectSpan
        : pickingActorField === "verb"
          ? actor.verbSpan
          : actor.objectSpan;
    let verseKey = `${activeBeginningRow.finiteVerb.chapter}:${activeBeginningRow.finiteVerb.verse}`;
    if (span.length) {
      const first = wordById.get(span[0]);
      if (first) verseKey = `${first.chapter}:${first.verse}`;
    }
    const timer = window.setTimeout(() => {
      const node = document.querySelector<HTMLElement>(
        `[data-actor-verse="${CSS.escape(verseKey)}"]`
      );
      const panel = node?.closest<HTMLElement>(".clause-subject-host-picker");
      if (!node || !panel) return;
      const panelRect = panel.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const delta = nodeRect.top - panelRect.top - 8;
      if (delta < 0 || nodeRect.bottom > panelRect.bottom) {
        panel.scrollTop += delta;
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [
    pickingActorField,
    activeBeginningVerbId,
    activeBeginningRow,
    actorObservationFor,
    wordById,
    clauseActors
  ]);

  const selectActorWord = useCallback(
    (finiteVerbId: string, field: "subject" | "verb" | "object", word: SpanishWord, event: MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && actorAnchorId) {
        const anchor = wordById.get(actorAnchorId);
        if (anchor) {
          const span = spanFromRange(anchor, word);
          if (span) {
            updateActorField(finiteVerbId, field, span);
            setPickingActorField(null);
            setActorAnchorId(null);
          }
          return;
        }
      }
      // Keep picker open after the first tap so shift-click can extend the span.
      setActorAnchorId(word.id);
      updateActorField(finiteVerbId, field, [word.id]);
    },
    [actorAnchorId, updateActorField, wordById]
  );

  const activeActor = useMemo(
    () => actorObservationFor(activeBeginningVerbId),
    [activeBeginningVerbId, actorObservationFor]
  );

  const actorConcentration = useMemo(() => {
    const counts = new Map<string, number>();
    for (const info of clauseSpanInfos) {
      const actor = actorObservationFor(info.finiteVerbId);
      const name = spanTextFromIds(actor.subjectSpan);
      if (!name) continue;
      const key = name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => {
        // Recover display casing from first matching observation.
        let label = key;
        for (const info of clauseSpanInfos) {
          const name = spanTextFromIds(actorObservationFor(info.finiteVerbId).subjectSpan);
          if (name.toLowerCase() === key) {
            label = name;
            break;
          }
        }
        return { label, count };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [actorObservationFor, clauseSpanInfos, spanTextFromIds]);

  const actorTripleFor = useCallback(
    (finiteVerbId: string | null | undefined): string => {
      if (!finiteVerbId) return "";
      const actor = actorObservationFor(finiteVerbId);
      return formatActorTriple(
        spanTextFromIds(actor.subjectSpan),
        spanTextFromIds(actor.verbSpan),
        spanTextFromIds(actor.objectSpan)
      );
    },
    [actorObservationFor, spanTextFromIds]
  );

  const actorFlow = useMemo(() => {
    type FlowAction = { triple: string; order: number };
    const byActor = new Map<string, { label: string; actions: FlowAction[] }>();
    for (const info of clauseSpanInfos) {
      const actor = actorObservationFor(info.finiteVerbId);
      const subject = spanTextFromIds(actor.subjectSpan);
      if (!subject) continue;
      const triple = formatActorTriple(
        subject,
        spanTextFromIds(actor.verbSpan),
        spanTextFromIds(actor.objectSpan)
      );
      if (!triple) continue;
      const key = subject.toLowerCase();
      const group = byActor.get(key) ?? { label: subject, actions: [] };
      group.actions.push({ triple, order: info.order });
      byActor.set(key, group);
    }
    return Array.from(byActor.values())
      .map(group => ({
        label: group.label,
        actions: group.actions.sort((a, b) => a.order - b.order)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [actorObservationFor, clauseSpanInfos, spanTextFromIds]);

  // H3 flow: continuous reading strip; user places H2 starts; observations support after.
  const h3FlowInput = useMemo(() => {
    const subjectByClauseId = new Map<string, string>();
    for (const info of clauseSpanInfos) {
      const subject = spanTextFromIds(actorObservationFor(info.finiteVerbId).subjectSpan);
      if (subject) subjectByClauseId.set(info.finiteVerbId, subject);
    }
    return {
      outline,
      skeletonRoots: skeleton.roots,
      subjectByClauseId,
      imperativeRootIds,
      statementRootIds,
      recipientByRootId: recipientAssignments
    };
  }, [
    actorObservationFor,
    clauseSpanInfos,
    imperativeRootIds,
    outline,
    recipientAssignments,
    skeleton.roots,
    spanTextFromIds,
    statementRootIds
  ]);

  const h3FlowReconciled = useMemo(
    () => reconcileH3FlowState(
      h3FlowState,
      outline.map(clause => clause.finiteVerbId)
    ),
    [h3FlowState, outline]
  );

  const h3FlowMovements = useMemo(
    () => buildH3FlowMovements(h3FlowInput, h3FlowReconciled),
    [h3FlowInput, h3FlowReconciled]
  );

  const h3FlowSupportByAfterId = useMemo(
    () => new Map(buildH3FlowSupports(h3FlowInput, h3FlowReconciled).map(row => [row.afterH3Id, row])),
    [h3FlowInput, h3FlowReconciled]
  );

  const h3FlowPressureSet = useMemo(
    () => new Set(h3FlowReconciled.pressureAfter),
    [h3FlowReconciled.pressureAfter]
  );

  const bookMovementClauses = useMemo(() => {
    const units = buildH3UnitSignals(h3FlowInput);
    const spanById = new Map(clauseSpanInfos.map(info => [info.finiteVerbId, info.spanText]));
    return units.map((unit, order) => ({
      finiteVerbId: unit.finiteVerbId,
      reference: unit.reference,
      order,
      spanText: unit.clauseIds
        .map(id => spanById.get(id) ?? "")
        .filter(Boolean)
        .join(" ")
    }));
  }, [clauseSpanInfos, h3FlowInput]);

  const bookMovementReport = useMemo(() => {
    const movementVerses = verses.map(v => ({
      verseKey: `${v.chapter}:${v.verse}`,
      reference: `${bookInfo.displayName} ${v.chapter}:${v.verse}`,
      text: v.text
    }));
    return buildBookMovementReport(bookMovementClauses, { verses: movementVerses });
  }, [bookInfo.displayName, bookMovementClauses, verses]);

  const convergenceReport = useMemo(
    () =>
      buildConvergenceReport(bookMovementClauses, bookMovementReport, {
        imperativeH3Ids: imperativeRootIds,
        pressureAfterH3Ids: h3FlowReconciled.pressureAfter,
        reasonHits,
        contrastHits: contrastState.items
      }),
    [
      bookMovementClauses,
      bookMovementReport,
      contrastState.items,
      h3FlowReconciled.pressureAfter,
      imperativeRootIds,
      reasonHits
    ]
  );

  const [selectedConvergenceKey, setSelectedConvergenceKey] = useState<string | null>(null);

  const scoredConvergenceVerses = useMemo(
    () => convergenceReport.verses.filter(v => v.score > 0),
    [convergenceReport.verses]
  );

  const selectedConvergence: VerseConvergence | null = useMemo(() => {
    if (!selectedConvergenceKey) return convergenceReport.hotspots[0] ?? scoredConvergenceVerses[0] ?? null;
    return (
      convergenceReport.verses.find(v => v.verseKey === selectedConvergenceKey) ??
      convergenceReport.hotspots[0] ??
      null
    );
  }, [convergenceReport, scoredConvergenceVerses, selectedConvergenceKey]);

  const selectedVerseDashboard = useMemo(
    () => (selectedConvergence ? buildVerseDashboard(selectedConvergence) : []),
    [selectedConvergence]
  );

  const selectedVerseDevelopment = useMemo(
    () => (selectedConvergence ? buildVerseDevelopment(selectedConvergence) : []),
    [selectedConvergence]
  );

  const hotspotVerseKeys = useMemo(
    () => new Set(convergenceReport.hotspots.map(h => h.verseKey)),
    [convergenceReport.hotspots]
  );

  const contrastsOnSelectedVerse = useMemo(() => {
    if (!selectedConvergence) return [] as ContrastObservation[];
    return contrastState.items.filter(item => item.verseKey === selectedConvergence.verseKey);
  }, [contrastState.items, selectedConvergence]);

  const candidateBoundaryAfterIds = useMemo(
    () => new Set(bookMovementReport.candidateBoundaries.map(row => row.afterH3Id)),
    [bookMovementReport.candidateBoundaries]
  );

  const discourseResetIds = useMemo(
    () => new Set(bookMovementReport.discourseResets.map(row => row.finiteVerbId)),
    [bookMovementReport.discourseResets]
  );

  const persistH3Flow = useCallback(
    (next: H3FlowState) => {
      const reconciled = reconcileH3FlowState(
        next,
        outline.map(clause => clause.finiteVerbId)
      );
      setH3FlowState(reconciled);
      writeH3FlowState(reconciled, bookId);
    },
    [bookId, outline]
  );

  const persistContrasts = useCallback(
    (next: ContrastObservationsState) => {
      setContrastState(next);
      writeContrastObservations(next, bookId);
    },
    [bookId]
  );

  const addContrastOnSelected = useCallback(() => {
    if (!selectedConvergence) return;
    const poleA = contrastDraftA.trim();
    const poleB = contrastDraftB.trim();
    if (!poleA || !poleB) return;
    const id = `contrast:${selectedConvergence.verseKey}:${Date.now()}`;
    const note = contrastDraftNote.trim() || undefined;
    persistContrasts({
      items: [
        ...contrastState.items,
        { id, verseKey: selectedConvergence.verseKey, poleA, poleB, note }
      ]
    });
    setContrastDraftA("");
    setContrastDraftB("");
    setContrastDraftNote("");
  }, [
    contrastDraftA,
    contrastDraftB,
    contrastDraftNote,
    contrastState.items,
    persistContrasts,
    selectedConvergence
  ]);

  const removeContrast = useCallback(
    (id: string) => {
      persistContrasts({ items: contrastState.items.filter(item => item.id !== id) });
    },
    [contrastState.items, persistContrasts]
  );

  const movementVerses = useMemo(
    () =>
      verses.map(v => ({
        verseKey: `${v.chapter}:${v.verse}`,
        reference: `${bookInfo.displayName} ${v.chapter}:${v.verse}`,
        text: v.text
      })),
    [bookInfo.displayName, verses]
  );

  const persistBookDefinitions = useCallback(
    (next: BookDefinitionsState) => {
      setBookDefinitions(next);
      writeBookDefinitions(next, bookId);
    },
    [bookId]
  );

  const activeDefinitionTerm = useMemo(
    () => bookDefinitions.terms.find(t => t.id === activeDefinitionTermId) ?? null,
    [activeDefinitionTermId, bookDefinitions.terms]
  );

  const investigateTerm = useCallback(
    (seedRaw: string) => {
      const seed = seedRaw.trim();
      if (!seed) return;
      const writingPurposeTexts = bookMovementReport.writingPurposes.map(h => h.spanText);
      const investigation = investigateBookDefinition(seed, movementVerses, { writingPurposeTexts });
      setDefinitionInvestigation(investigation);
      setDefinitionSeedDraft(seed);
      setStructureMode("definitions");

      const existing = bookDefinitions.terms.find(
        t => t.seed.trim().toLowerCase() === seed.toLowerCase()
      );
      if (existing) {
        setActiveDefinitionTermId(existing.id);
        setSelectedDefinitionHitId(existing.hits.find(h => h.confirmed)?.id ?? null);
        return;
      }
      const id = `term:${seed.toLowerCase()}:${Date.now()}`;
      const term: BookDefinitionTerm = {
        id,
        seed,
        relatedConfirmed: [],
        hits: [],
        workingDefinition: ""
      };
      persistBookDefinitions({ terms: [...bookDefinitions.terms, term] });
      setActiveDefinitionTermId(id);
      setSelectedDefinitionHitId(null);
    },
    [
      bookDefinitions.terms,
      bookMovementReport.writingPurposes,
      movementVerses,
      persistBookDefinitions
    ]
  );

  const updateActiveDefinitionTerm = useCallback(
    (updater: (term: BookDefinitionTerm) => BookDefinitionTerm) => {
      if (!activeDefinitionTermId) return;
      persistBookDefinitions({
        terms: bookDefinitions.terms.map(t =>
          t.id === activeDefinitionTermId ? updater(t) : t
        )
      });
    },
    [activeDefinitionTermId, bookDefinitions.terms, persistBookDefinitions]
  );

  const confirmDefinitionHit = useCallback(
    (proposal: { id: string; verseKey: string; kind: BookDefinitionHit["kind"]; snippet: string }) => {
      updateActiveDefinitionTerm(term => {
        const existing = term.hits.find(h => h.id === proposal.id);
        if (existing) {
          return {
            ...term,
            hits: term.hits.map(h =>
              h.id === proposal.id ? { ...h, confirmed: true, kind: proposal.kind, snippet: proposal.snippet } : h
            )
          };
        }
        return {
          ...term,
          hits: [
            ...term.hits,
            {
              id: proposal.id,
              verseKey: proposal.verseKey,
              kind: proposal.kind,
              snippet: proposal.snippet,
              confirmed: true
            }
          ]
        };
      });
      setSelectedDefinitionHitId(proposal.id);
    },
    [updateActiveDefinitionTerm]
  );

  const dismissDefinitionHit = useCallback(
    (hitId: string) => {
      updateActiveDefinitionTerm(term => {
        if (term.hits.some(h => h.id === hitId)) {
          return {
            ...term,
            hits: term.hits.map(h => (h.id === hitId ? { ...h, confirmed: false } : h))
          };
        }
        const proposal = definitionInvestigation?.hits.find(h => h.id === hitId);
        if (!proposal) return term;
        return {
          ...term,
          hits: [
            ...term.hits,
            {
              id: proposal.id,
              verseKey: proposal.verseKey,
              kind: proposal.kind,
              snippet: proposal.snippet,
              confirmed: false
            }
          ]
        };
      });
      if (selectedDefinitionHitId === hitId) setSelectedDefinitionHitId(null);
    },
    [definitionInvestigation, selectedDefinitionHitId, updateActiveDefinitionTerm]
  );

  const toggleRelatedSurface = useCallback(
    (display: string, on: boolean) => {
      updateActiveDefinitionTerm(term => {
        const set = new Set(term.relatedConfirmed);
        if (on) set.add(display);
        else set.delete(display);
        return { ...term, relatedConfirmed: [...set] };
      });
    },
    [updateActiveDefinitionTerm]
  );

  const confirmedHitsForSelectedVerse = useMemo(() => {
    if (!selectedConvergence) return [] as Array<{ seed: string; termId: string }>;
    const out: Array<{ seed: string; termId: string }> = [];
    for (const term of bookDefinitions.terms) {
      if (term.hits.some(h => h.confirmed && h.verseKey === selectedConvergence.verseKey)) {
        out.push({ seed: term.seed, termId: term.id });
      }
    }
    return out;
  }, [bookDefinitions.terms, selectedConvergence]);

  const selectedDefinitionHit = useMemo(() => {
    if (!selectedDefinitionHitId) return null;
    const fromTerm = activeDefinitionTerm?.hits.find(h => h.id === selectedDefinitionHitId);
    if (fromTerm) return fromTerm;
    const fromProposal = definitionInvestigation?.hits.find(h => h.id === selectedDefinitionHitId);
    if (!fromProposal) return null;
    return {
      id: fromProposal.id,
      verseKey: fromProposal.verseKey,
      kind: fromProposal.kind,
      snippet: fromProposal.snippet,
      confirmed: false
    } satisfies BookDefinitionHit;
  }, [activeDefinitionTerm, definitionInvestigation, selectedDefinitionHitId]);

  /** Evidence inventory only — never a composed sense. */
  const definitionEvidenceSumUp = useMemo(() => {
    if (!activeDefinitionTerm) return null;
    const confirmed = [...activeDefinitionTerm.hits]
      .filter(h => h.confirmed)
      .sort((a, b) => {
        const [ac, av] = a.verseKey.split(":").map(Number);
        const [bc, bv] = b.verseKey.split(":").map(Number);
        return ac - bc || av - bv;
      });
    const byKind = { equative: 0, contrast: 0, use: 0, other: 0 };
    for (const hit of confirmed) {
      byKind[hit.kind] += 1;
    }
    return {
      seed: activeDefinitionTerm.seed,
      confirmedCount: confirmed.length,
      byKind,
      related: activeDefinitionTerm.relatedConfirmed,
      verses: confirmed.map(h => h.verseKey),
      lines: confirmed.map(h => ({
        verseKey: h.verseKey,
        kind: h.kind,
        snippet: h.snippet,
        note: h.note
      }))
    };
  }, [activeDefinitionTerm]);

  const persistBookThread = useCallback(
    (next: BookThreadState) => {
      setBookThread(next);
      writeBookThread(next, bookId);
    },
    [bookId]
  );

  const threadWaypointProposals = useMemo(() => {
    const definitionHits = bookDefinitions.terms.flatMap(term =>
      term.hits
        .filter(h => h.confirmed)
        .map(h => ({
          hitId: h.id,
          verseKey: h.verseKey,
          seed: term.seed,
          snippet: h.snippet
        }))
    );
    const opens = scoredConvergenceVerses
      .filter(v => v.phase === "opens")
      .map(v => ({ verseKey: v.verseKey, reference: v.reference }));
    return proposeThreadWaypoints({
      writingPurposes: bookMovementReport.writingPurposes,
      opens,
      definitionHits,
      alreadyOnThread: bookThread.steps
    });
  }, [
    bookDefinitions.terms,
    bookMovementReport.writingPurposes,
    bookThread.steps,
    scoredConvergenceVerses
  ]);

  const selectedThreadStep = useMemo(
    () => bookThread.steps.find(s => s.id === selectedThreadStepId) ?? null,
    [bookThread.steps, selectedThreadStepId]
  );

  const addThreadWaypoint = useCallback(
    (proposal: ThreadWaypointProposal) => {
      const step: BookThreadStep = {
        id: `step:${proposal.source}:${proposal.verseKey}:${Date.now()}`,
        label: "",
        verseKey: proposal.verseKey,
        source: proposal.source,
        evidence: proposal.evidence,
        seed: proposal.seed
      };
      const next = { steps: [...bookThread.steps, step] };
      persistBookThread(next);
      setSelectedThreadStepId(step.id);
      setStructureMode("thread");
    },
    [bookThread.steps, persistBookThread]
  );

  const addThreadFromWritingPurpose = useCallback(
    (hit: { finiteVerbId: string; reference: string; spanText: string; trajectory: string }) => {
      const verseKey = verseKeyFromReference(hit.reference, hit.finiteVerbId);
      if (!verseKey) return;
      if (
        bookThread.steps.some(s => s.source === "writing-purpose" && s.verseKey === verseKey)
      ) {
        setStructureMode("thread");
        const existing = bookThread.steps.find(
          s => s.source === "writing-purpose" && s.verseKey === verseKey
        );
        if (existing) setSelectedThreadStepId(existing.id);
        return;
      }
      addThreadWaypoint({
        id: `wp:${hit.finiteVerbId}`,
        verseKey,
        reference: hit.reference,
        source: "writing-purpose",
        evidence: hit.trajectory || hit.spanText
      });
    },
    [addThreadWaypoint, bookThread.steps]
  );

  const addThreadFromOpens = useCallback(
    (verseKey: string, reference: string) => {
      if (bookThread.steps.some(s => s.source === "opens" && s.verseKey === verseKey)) {
        setStructureMode("thread");
        const existing = bookThread.steps.find(s => s.source === "opens" && s.verseKey === verseKey);
        if (existing) setSelectedThreadStepId(existing.id);
        return;
      }
      addThreadWaypoint({
        id: `opens:${verseKey}`,
        verseKey,
        reference,
        source: "opens",
        evidence: "opens"
      });
    },
    [addThreadWaypoint, bookThread.steps]
  );

  const updateThreadStep = useCallback(
    (stepId: string, updater: (step: BookThreadStep) => BookThreadStep) => {
      persistBookThread({
        steps: bookThread.steps.map(s => (s.id === stepId ? updater(s) : s))
      });
    },
    [bookThread.steps, persistBookThread]
  );

  const removeThreadStep = useCallback(
    (stepId: string) => {
      persistBookThread({ steps: bookThread.steps.filter(s => s.id !== stepId) });
      if (selectedThreadStepId === stepId) setSelectedThreadStepId(null);
    },
    [bookThread.steps, persistBookThread, selectedThreadStepId]
  );

  const moveThreadStep = useCallback(
    (stepId: string, direction: -1 | 1) => {
      const index = bookThread.steps.findIndex(s => s.id === stepId);
      if (index < 0) return;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= bookThread.steps.length) return;
      const steps = [...bookThread.steps];
      const [row] = steps.splice(index, 1);
      steps.splice(nextIndex, 0, row!);
      persistBookThread({ steps });
    },
    [bookThread.steps, persistBookThread]
  );

  // Shared by renderClauseLine and renderSkeletonNode — dotted underline on
  // Brick-4-marked participles. Read-only: identification happens in Brick 4.
  const renderClauseWords = useCallback(
    (words: SpanishWord[], ownFiniteVerbId: string) => {
      return words.map((word, index) => {
        const classes = ["clause-line-token"];
        if (word.finiteVerbId === ownFiniteVerbId) classes.push("clause-line-token--finite");
        if (word.dependentIntroducerId) classes.push("clause-line-token--dependent");

        const isConfirmedParticiple =
          Boolean(word.participleId) && participleMarkedAlignmentIds.has(word.participleId as string);
        if (isConfirmedParticiple) classes.push("clause-line-token--participle");

        return (
          <span className={classes.join(" ")} key={word.id}>
            {index > 0 ? " " : null}
            {word.text}
          </span>
        );
      });
    },
    [participleMarkedAlignmentIds]
  );

  const wordsInVerse = useCallback(
    (chapter: number, verse: number) => {
      return verses.find(v => v.chapter === chapter && v.verse === verse)?.words ?? [];
    },
    [verses]
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
      const actorTriple = actorTripleFor(node.finiteVerbId);
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
            onClick={() => openClauseFromSkeleton(node.finiteVerbId)}
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
            {actorTriple ? <span className="clause-actor-triple">{actorTriple}</span> : null}
            {marker ? (
              <span className="clause-marker-line">
                “{marker.word}” — {marker.type === "relational" ? "conector relacional" : "marcador subordinante"} ·{" "}
                {marker.subtype}
              </span>
            ) : null}
          </button>
          {participleWordsByClauseId.get(node.finiteVerbId)?.length ? (
            <div className="clause-participle-satellite-list" aria-label="What hangs with this clause">
              {renderParticipleNounGroups(
                participleWordsByClauseId.get(node.finiteVerbId)!,
                wordsInVerse(
                  participleWordsByClauseId.get(node.finiteVerbId)![0].chapter,
                  participleWordsByClauseId.get(node.finiteVerbId)![0].verse
                ),
                node.finiteVerbId
              )}
            </div>
          ) : null}
          {node.children.length ? (
            <div className="clause-tree-children">{node.children.map(renderSkeletonNode)}</div>
          ) : null}
        </div>
      );
    },
    [
      activeBeginningVerbId,
      actorTripleFor,
      clauseMarkers,
      finiteVerbIdToRow,
      openClauseFromSkeleton,
      participleWordsByClauseId,
      renderClauseWords,
      renderParticipleNounGroups,
      sequenceEntryByFiniteVerbId,
      wordsInVerse
    ]
  );

  const unassignedSameVerseNotice =
    unassignedSameVerseFinites.length > 0 ? (
      <div className="clause-proposal clause-unassigned-finite-notice" role="status">
        <p className="clause-proposal-label">Unassigned finite in this verse</p>
        <p className="clause-proposal-reason">
          {unassignedSameVerseFinites.length === 1
            ? "Another finite verb in this verse has not been assigned a clause span yet, so it cannot appear as a parent below. Assign it first if that is the clause this depends on."
            : "Other finite verbs in this verse have not been assigned a clause span yet, so they cannot appear as parents below. Assign them first if one of them is the clause this depends on."}
        </p>
        <div className="clause-unassigned-finite-actions">
          {unassignedSameVerseFinites.map(word => (
            <button
              type="button"
              key={word.finiteVerbId ?? word.id}
              className="clause-parked-host-button"
              onClick={() => selectVerb(word, { scrollTo: "passage" })}
            >
              Assign {word.greekSurface || word.text}
              <span>
                {word.chapter}:{word.verse}
                {word.text ? ` — ${word.text}` : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    ) : null;

  if (!interlinearReady) {
    return (
      <p className="workshop-lbf-gate" role="status">
        Loading…
      </p>
    );
  }

  return (
    <main className="clause-builder">
      <header className="clause-builder-header">
        <p className="reader-kicker">Observer · Structure</p>
        <h1>{bookInfo.displayName}</h1>
        <p className="clause-builder-scope">
          Greek in token order with aligned LBF under each word. The verse line below is LBF in Spanish reading
          order (word order will differ). Open Skeleton anytime to read the settled tree.
        </p>
      </header>

      <section className="structure-canvas" aria-labelledby="structure-heading">
          <div className="clause-only-header structure-toolbar">
            <div>
              <h2 id="structure-heading">
                {structureMode === "thread"
                  ? "Thread"
                  : structureMode === "definitions"
                    ? "Definitions"
                    : structureMode === "movement"
                      ? "Movement"
                      : "Passage"}
              </h2>
              <p>
                {structureMode === "thread"
                  ? "One book-level story — software proposes waypoints; you name each step."
                  : structureMode === "definitions"
                    ? "Authorial use in this book — software proposes; you confirm and name."
                    : structureMode === "movement"
                      ? "Convergence by verse — open, intensify, or resolve. You name the H2."
                      : `${reviewedCount} of ${reviewClauseRows.length} mood-tagged clauses reviewed${
                          clauseRows.length ? ` · ${savedClauseRows.length} of ${clauseRows.length} spans saved` : ""
                        }${
                          greekSpanMismatches.length
                            ? ` · ${greekSpanMismatches.length} span drift${greekSpanMismatches.length === 1 ? "" : "s"}`
                            : ""
                        }${
                          greekReconfirmationProgress.unconfirmed.length
                            ? ` · ${greekReconfirmationProgress.unconfirmed.length} unconfirmed`
                            : ""
                        }${
                          relativeOfConnectionFlags.length
                            ? ` · ${relativeOfConnectionFlags.length} relative-of-connection`
                            : ""
                        }`}
              </p>
            </div>
            <div className="structure-toolbar-modes" role="group" aria-label="Structure view">
              <button
                type="button"
                className={
                  structureMode === "passage"
                    ? "clause-print-btn structure-toolbar-mode structure-toolbar-mode--active"
                    : "clause-print-btn structure-toolbar-mode"
                }
                aria-pressed={structureMode === "passage"}
                onClick={() => setStructureMode("passage")}
              >
                Passage
              </button>
              <button
                type="button"
                className={
                  structureMode === "movement"
                    ? "clause-print-btn structure-toolbar-mode structure-toolbar-mode--active"
                    : "clause-print-btn structure-toolbar-mode"
                }
                aria-pressed={structureMode === "movement"}
                onClick={() => setStructureMode("movement")}
              >
                Movement
                {convergenceReport.hotspots.length
                  ? ` (${convergenceReport.hotspots.length})`
                  : ""}
              </button>
              <button
                type="button"
                className={
                  structureMode === "definitions"
                    ? "clause-print-btn structure-toolbar-mode structure-toolbar-mode--active"
                    : "clause-print-btn structure-toolbar-mode"
                }
                aria-pressed={structureMode === "definitions"}
                onClick={() => setStructureMode("definitions")}
              >
                Definitions
                {bookDefinitions.terms.length ? ` (${bookDefinitions.terms.length})` : ""}
              </button>
              <button
                type="button"
                className={
                  structureMode === "thread"
                    ? "clause-print-btn structure-toolbar-mode structure-toolbar-mode--active"
                    : "clause-print-btn structure-toolbar-mode"
                }
                aria-pressed={structureMode === "thread"}
                onClick={() => setStructureMode("thread")}
              >
                Thread
                {bookThread.steps.length ? ` (${bookThread.steps.length})` : ""}
              </button>
            </div>
            {structureMode === "passage" ? (
              <label className="clause-dependent-toggle">
                <input
                  type="checkbox"
                  checked={showSpanishOnly}
                  onChange={event => setShowSpanishOnly(event.currentTarget.checked)}
                />
                <span>Show Spanish only</span>
              </label>
            ) : null}
            <button
              type="button"
              className="clause-print-btn"
              onClick={() => {
                setSkeletonOpen(true);
                setSkeletonMaximized(false);
              }}
            >
              Skeleton
              {skeleton.roots.length ? ` (${skeleton.roots.length})` : ""}
            </button>
            <button
              type="button"
              className="clause-print-btn"
              onClick={() => {
                setSkeletonOpen(true);
                setSkeletonMaximized(true);
                window.setTimeout(() => window.print(), 80);
              }}
            >
              Print skeleton
            </button>
          </div>

          {structureMode === "movement" ? (
            <div className="clause-movement-view" aria-label="Movement Explorer">
              <p className="clause-section-note clause-movement-view-intro">
                Where signals pile up — writing purpose, resets, reasons, formulas, repeated words,
                contrasts, commands, assurance, and pressure you marked. The software never names the H2.
              </p>
              <div className="clause-movement-view-grid">
                <div className="clause-movement-strip-col">
                  <h3 className="clause-movement-explorer-heading">Convergence</h3>
                  {scoredConvergenceVerses.length ? (
                    <div className="clause-convergence-strip" role="list">
                      {scoredConvergenceVerses.map(hit => (
                        <button
                          key={hit.verseKey}
                          type="button"
                          role="listitem"
                          className={[
                            "clause-convergence-bar",
                            selectedConvergence?.verseKey === hit.verseKey
                              ? "clause-convergence-bar--selected"
                              : "",
                            hotspotVerseKeys.has(hit.verseKey)
                              ? "clause-convergence-bar--hotspot"
                              : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          title={`${hit.reference} · score ${hit.score}${hit.phase ? ` · ${hit.phase}` : ""}`}
                          onClick={() => setSelectedConvergenceKey(hit.verseKey)}
                        >
                          <span className="clause-convergence-bar-ref">{hit.verseKey}</span>
                          <span
                            className="clause-convergence-bar-fill"
                            style={{ width: `${hit.bar * 10}%` }}
                            aria-hidden="true"
                          />
                          {hit.phase ? (
                            <span className={`clause-convergence-phase clause-convergence-phase--${hit.phase}`}>
                              {hit.phase}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="clause-output-empty">
                      No scored verses yet — keep observing; single weak signals stay quiet.
                    </p>
                  )}
                </div>

                <div className="clause-movement-dashboard" aria-label="Verse dashboard">
                  {selectedConvergence ? (
                    <>
                      <p className="clause-convergence-evidence-heading">
                        {selectedConvergence.reference}
                        <span className="clause-convergence-score">
                          score {selectedConvergence.score}
                        </span>
                        {selectedConvergence.phase ? (
                          <span
                            className={`clause-convergence-phase clause-convergence-phase--${selectedConvergence.phase}`}
                          >
                            {selectedConvergence.phase}
                          </span>
                        ) : null}
                      </p>
                      <p className="clause-section-note">
                        Why look here — signals for this verse.
                      </p>
                      {selectedVerseDashboard.length ? (
                        <div className="clause-movement-dashboard-sections">
                          {selectedVerseDashboard.map(section => (
                            <section
                              key={section.id}
                              className="clause-movement-dashboard-section"
                              aria-label={section.title}
                            >
                              <h4 className="clause-movement-dashboard-section-title">
                                {section.title}
                              </h4>
                              <ul className="clause-book-movement-list">
                                {section.items.map(item => (
                                  <li key={`${section.id}:${item.label}:${item.detail ?? ""}`}>
                                    <span className="clause-book-movement-badge">{item.label}</span>
                                    {item.detail ? (
                                      <span className="clause-book-movement-meta">{item.detail}</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </section>
                          ))}
                        </div>
                      ) : (
                        <p className="clause-output-empty">No evidence items on this verse.</p>
                      )}

                      <section className="clause-movement-contrasts" aria-label="Add contrast">
                        <h4 className="clause-movement-dashboard-section-title">Your contrast</h4>
                        <p className="clause-section-note">
                          Mark a pole pair you notice on this verse — not an app theme.
                        </p>
                        {contrastsOnSelectedVerse.length ? (
                          <ul className="clause-book-movement-list">
                            {contrastsOnSelectedVerse.map(item => (
                              <li key={item.id}>
                                <span className="clause-book-movement-badge">
                                  {item.poleA} / {item.poleB}
                                </span>
                                {item.note ? (
                                  <span className="clause-book-movement-meta">{item.note}</span>
                                ) : null}
                                <button
                                  type="button"
                                  className="clause-h3-flow-remove"
                                  onClick={() => removeContrast(item.id)}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="clause-movement-contrast-form">
                          <input
                            type="text"
                            className="clause-h3-flow-h2-name"
                            value={contrastDraftA}
                            placeholder="pole A"
                            aria-label="Contrast pole A"
                            onChange={event => setContrastDraftA(event.target.value)}
                          />
                          <span className="clause-movement-contrast-slash" aria-hidden="true">
                            /
                          </span>
                          <input
                            type="text"
                            className="clause-h3-flow-h2-name"
                            value={contrastDraftB}
                            placeholder="pole B"
                            aria-label="Contrast pole B"
                            onChange={event => setContrastDraftB(event.target.value)}
                          />
                          <input
                            type="text"
                            className="clause-h3-flow-h2-name clause-movement-contrast-note"
                            value={contrastDraftNote}
                            placeholder="optional note"
                            aria-label="Contrast note"
                            onChange={event => setContrastDraftNote(event.target.value)}
                          />
                          <button
                            type="button"
                            className="clause-print-btn"
                            disabled={!contrastDraftA.trim() || !contrastDraftB.trim()}
                            onClick={addContrastOnSelected}
                          >
                            Add contrast
                          </button>
                        </div>
                      </section>

                      {selectedVerseDevelopment.length ? (
                        <section
                          className="clause-movement-development"
                          aria-label="Development"
                        >
                          <h4 className="clause-movement-explorer-heading">Development</h4>
                          <p className="clause-section-note">
                            Tension, pressure, and argument from what you marked and what returns —
                            not section titles.
                          </p>
                          <div className="clause-movement-dashboard-sections">
                            {selectedVerseDevelopment.map(section => (
                              <section
                                key={section.id}
                                className="clause-movement-dashboard-section"
                                aria-label={section.title}
                              >
                                <h5 className="clause-movement-dashboard-section-title">
                                  {section.title}
                                </h5>
                                <ul className="clause-book-movement-list">
                                  {section.items.map(item => (
                                    <li key={`${section.id}:${item.label}:${item.detail ?? ""}`}>
                                      <span className="clause-book-movement-badge">{item.label}</span>
                                      {item.detail ? (
                                        <span className="clause-book-movement-meta">{item.detail}</span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                                {section.id === "pressure" &&
                                selectedConvergence.previousH3Id ? (
                                  <div className="clause-convergence-h2-row">
                                    {h3FlowPressureSet.has(selectedConvergence.previousH3Id) ? (
                                      <button
                                        type="button"
                                        className="clause-h3-flow-pressure clause-h3-flow-pressure--on"
                                        aria-pressed="true"
                                        onClick={() =>
                                          persistH3Flow(
                                            clearPressureAfter(
                                              h3FlowReconciled,
                                              selectedConvergence.previousH3Id!
                                            )
                                          )
                                        }
                                      >
                                        Clear pressure into this verse
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="clause-h3-flow-pressure"
                                        aria-pressed="false"
                                        onClick={() =>
                                          persistH3Flow(
                                            markPressureAfter(
                                              h3FlowReconciled,
                                              selectedConvergence.previousH3Id!
                                            )
                                          )
                                        }
                                      >
                                        Mark pressure into this verse
                                      </button>
                                    )}
                                  </div>
                                ) : null}
                              </section>
                            ))}
                          </div>
                        </section>
                      ) : selectedConvergence.previousH3Id ? (
                        <section
                          className="clause-movement-development"
                          aria-label="Development"
                        >
                          <h4 className="clause-movement-explorer-heading">Development</h4>
                          <p className="clause-section-note">
                            No tension or argument signals yet — you can still mark pressure.
                          </p>
                          <div className="clause-convergence-h2-row">
                            {h3FlowPressureSet.has(selectedConvergence.previousH3Id) ? (
                              <button
                                type="button"
                                className="clause-h3-flow-pressure clause-h3-flow-pressure--on"
                                aria-pressed="true"
                                onClick={() =>
                                  persistH3Flow(
                                    clearPressureAfter(
                                      h3FlowReconciled,
                                      selectedConvergence.previousH3Id!
                                    )
                                  )
                                }
                              >
                                Clear pressure into this verse
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="clause-h3-flow-pressure"
                                aria-pressed="false"
                                onClick={() =>
                                  persistH3Flow(
                                    markPressureAfter(
                                      h3FlowReconciled,
                                      selectedConvergence.previousH3Id!
                                    )
                                  )
                                }
                              >
                                Mark pressure into this verse
                              </button>
                            )}
                          </div>
                        </section>
                      ) : null}

                      <div className="clause-convergence-h2">
                        <p className="clause-convergence-h2-caption">Your H2</p>
                        <div className="clause-convergence-h2-row">
                          <input
                            type="text"
                            className="clause-h3-flow-h2-name"
                            value={h3FlowReconciled.labels[selectedConvergence.anchorH3Id] ?? ""}
                            placeholder="optional name — you decide"
                            aria-label="Name this movement"
                            onChange={event =>
                              persistH3Flow(
                                setH2Label(
                                  h3FlowReconciled,
                                  selectedConvergence.anchorH3Id,
                                  event.target.value
                                )
                              )
                            }
                          />
                          {selectedConvergence.previousH3Id &&
                          !h3FlowReconciled.breaksAfter.includes(selectedConvergence.previousH3Id) ? (
                            <button
                              type="button"
                              className="clause-h3-flow-begin clause-h3-flow-begin--candidate"
                              onClick={() =>
                                persistH3Flow(
                                  startH2After(
                                    h3FlowReconciled,
                                    selectedConvergence.previousH3Id!
                                  )
                                )
                              }
                            >
                              Begin movement here
                            </button>
                          ) : selectedConvergence.previousH3Id &&
                            h3FlowReconciled.breaksAfter.includes(
                              selectedConvergence.previousH3Id
                            ) ? (
                            <span className="clause-book-movement-meta">Movement start placed</span>
                          ) : null}
                        </div>
                      </div>
                      {confirmedHitsForSelectedVerse.length ? (
                        <p className="clause-section-note clause-definitions-open-links">
                          {confirmedHitsForSelectedVerse.map(link => (
                            <button
                              key={link.termId}
                              type="button"
                              className="clause-audit-ref clause-audit-ref--link"
                              onClick={() => investigateTerm(link.seed)}
                            >
                              Book definition open for {link.seed}
                            </button>
                          ))}
                        </p>
                      ) : null}
                      {selectedConvergence.phase === "opens" ? (
                        <p className="clause-section-note">
                          <button
                            type="button"
                            className="clause-print-btn"
                            onClick={() =>
                              addThreadFromOpens(
                                selectedConvergence.verseKey,
                                selectedConvergence.reference
                              )
                            }
                          >
                            Add opens to thread
                          </button>
                        </p>
                      ) : null}
                      <p className="clause-section-note">
                        <button
                          type="button"
                          className="clause-audit-ref clause-audit-ref--link"
                          onClick={() => openClauseFromSkeleton(selectedConvergence.anchorH3Id)}
                        >
                          Open anchor clause in Passage
                        </button>
                      </p>
                    </>
                  ) : (
                    <p className="clause-output-empty">
                      Select a verse in the strip to open its dashboard.
                    </p>
                  )}
                </div>

                <aside className="clause-movement-verse" aria-label="Selected verse">
                  {selectedConvergence ? (
                    <>
                      <p className="clause-verse-label">{selectedConvergence.verseKey}</p>
                      <p className="clause-movement-verse-text">
                        {verseTextByKey.get(selectedConvergence.verseKey) ||
                          wordsByVerse
                            .get(selectedConvergence.verseKey)
                            ?.map(w => w.text)
                            .join(" ") ||
                          "(no verse text)"}
                      </p>
                    </>
                  ) : (
                    <p className="clause-output-empty">Select a verse to read it here.</p>
                  )}
                </aside>
              </div>

              <details className="clause-book-movement-panel clause-movement-repeated-panel">
                <summary>
                  Repeated words
                  <span className="clause-book-movement-count">
                    {bookMovementReport.repeatedWords.length}
                  </span>
                </summary>
                {bookMovementReport.repeatedWords.length ? (
                  <div className="clause-book-movement-families">
                    {bookMovementReport.repeatedWords.slice(0, 40).map(entry => (
                      <div key={entry.word} className="clause-book-movement-family">
                        <p className="clause-book-movement-family-label">
                          {entry.display}
                          <span className="clause-book-movement-count">{entry.count}</span>
                          <button
                            type="button"
                            className="clause-print-btn clause-definitions-investigate-btn"
                            onClick={() => investigateTerm(entry.display)}
                          >
                            Investigate
                          </button>
                        </p>
                        <p className="clause-book-movement-chain">
                          {entry.verses.map((hit, hitIndex) => (
                            <span key={`${entry.word}:${hit.verseKey}`}>
                              {hitIndex > 0 ? " → " : null}
                              <button
                                type="button"
                                className={
                                  hit.isReturn
                                    ? "clause-book-movement-hit clause-book-movement-hit--return clause-book-movement-hit--btn"
                                    : "clause-book-movement-hit clause-book-movement-hit--btn"
                                }
                                title={hit.isReturn ? "Return" : undefined}
                                onClick={() => setSelectedConvergenceKey(hit.verseKey)}
                              >
                                {hit.verseKey}
                                {hit.isReturn ? "↩" : ""}
                              </button>
                            </span>
                          ))}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="clause-output-empty">No repeated content words yet.</p>
                )}
              </details>
            </div>
          ) : null}

          {structureMode === "definitions" ? (
            <div className="clause-definitions-view" aria-label="Book definitions">
              <p className="clause-section-note clause-definitions-view-intro">
                Gather what this letter means by a word from its own use. Proposals are candidates —
                never a finished glossary sense.
              </p>
              <div className="clause-definitions-view-grid">
                <aside className="clause-definitions-glossary" aria-label="Terms">
                  <h3 className="clause-movement-explorer-heading">Glossary</h3>
                  {bookDefinitions.terms.length ? (
                    <ul className="clause-definitions-term-list">
                      {bookDefinitions.terms.map(term => (
                        <li key={term.id}>
                          <button
                            type="button"
                            className={
                              term.id === activeDefinitionTermId
                                ? "clause-definitions-term clause-definitions-term--active"
                                : "clause-definitions-term"
                            }
                            onClick={() => investigateTerm(term.seed)}
                          >
                            <span>{term.seed}</span>
                            <span className="clause-book-movement-count">
                              {term.hits.filter(h => h.confirmed).length}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="clause-output-empty">No investigated terms yet.</p>
                  )}

                  <div className="clause-definitions-seed-row">
                    <input
                      type="text"
                      className="clause-h3-flow-h2-name"
                      value={definitionSeedDraft}
                      placeholder="seed, e.g. luz"
                      aria-label="Definition seed"
                      onChange={event => setDefinitionSeedDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          investigateTerm(definitionSeedDraft);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="clause-print-btn"
                      disabled={!definitionSeedDraft.trim()}
                      onClick={() => investigateTerm(definitionSeedDraft)}
                    >
                      Investigate
                    </button>
                  </div>

                  <h4 className="clause-movement-dashboard-section-title">Repeated words</h4>
                  {bookMovementReport.repeatedWords.length ? (
                    <div className="clause-definitions-chip-row">
                      {bookMovementReport.repeatedWords.slice(0, 24).map(entry => (
                        <button
                          key={entry.word}
                          type="button"
                          className="clause-definitions-chip"
                          onClick={() => investigateTerm(entry.display)}
                        >
                          {entry.display}
                          <span className="clause-book-movement-count">{entry.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="clause-output-empty">No repeated words yet.</p>
                  )}
                </aside>

                <div className="clause-definitions-center" aria-label="Active term">
                  {activeDefinitionTerm && definitionInvestigation ? (
                    <>
                      <h3 className="clause-movement-explorer-heading">
                        {activeDefinitionTerm.seed}
                      </h3>

                      {definitionEvidenceSumUp ? (
                        <details className="clause-definitions-sumup">
                          <summary>
                            Investigation sum-up
                            <span className="clause-book-movement-count">
                              {definitionEvidenceSumUp.confirmedCount}
                            </span>
                          </summary>
                          <p className="clause-section-note">
                            Evidence from your confirmed dossier — not a definition.
                          </p>
                          {definitionEvidenceSumUp.confirmedCount === 0 ? (
                            <p className="clause-output-empty">
                              Confirm hits to build a sum-up.
                            </p>
                          ) : (
                            <>
                              <ul className="clause-definitions-sumup-counts">
                                {(
                                  [
                                    ["equative", definitionEvidenceSumUp.byKind.equative],
                                    ["contrast", definitionEvidenceSumUp.byKind.contrast],
                                    ["use", definitionEvidenceSumUp.byKind.use],
                                    ["other", definitionEvidenceSumUp.byKind.other]
                                  ] as const
                                )
                                  .filter(([, n]) => n > 0)
                                  .map(([kind, n]) => (
                                    <li key={kind}>
                                      <span className="clause-definitions-hit-kind">{kind}</span>
                                      <span className="clause-book-movement-count">{n}</span>
                                    </li>
                                  ))}
                              </ul>
                              {definitionEvidenceSumUp.related.length ? (
                                <p className="clause-definitions-sumup-related">
                                  Related confirmed:{" "}
                                  {definitionEvidenceSumUp.related.join(" · ")}
                                </p>
                              ) : null}
                              <p className="clause-definitions-sumup-chain">
                                {definitionEvidenceSumUp.verses.join(" → ")}
                              </p>
                              <ul className="clause-book-movement-list">
                                {definitionEvidenceSumUp.lines.map(line => (
                                  <li key={`${line.verseKey}:${line.kind}:${line.snippet}`}>
                                    <button
                                      type="button"
                                      className="clause-audit-ref clause-audit-ref--link"
                                      onClick={() => {
                                        const hit = activeDefinitionTerm.hits.find(
                                          h =>
                                            h.confirmed &&
                                            h.verseKey === line.verseKey &&
                                            h.snippet === line.snippet
                                        );
                                        if (hit) setSelectedDefinitionHitId(hit.id);
                                      }}
                                    >
                                      {line.verseKey}
                                    </button>
                                    <span className="clause-definitions-hit-kind">{line.kind}</span>
                                    <span className="clause-book-movement-meta">
                                      {line.snippet}
                                      {line.note ? ` — ${line.note}` : ""}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </details>
                      ) : null}

                      <section aria-label="Related surfaces">
                        <h4 className="clause-movement-dashboard-section-title">Related surfaces</h4>
                        <p className="clause-section-note">
                          Confirm partners you accept for this book — proposals only.
                        </p>
                        {definitionInvestigation.related.length ? (
                          <div className="clause-definitions-chip-row">
                            {definitionInvestigation.related.map(surface => {
                              const on = activeDefinitionTerm.relatedConfirmed.includes(
                                surface.display
                              );
                              return (
                                <button
                                  key={`${surface.reason}:${surface.word}`}
                                  type="button"
                                  className={
                                    on
                                      ? "clause-definitions-chip clause-definitions-chip--on"
                                      : "clause-definitions-chip"
                                  }
                                  aria-pressed={on}
                                  title={surface.reason === "partner" ? "contrast partner" : "stem"}
                                  onClick={() => toggleRelatedSurface(surface.display, !on)}
                                >
                                  {surface.display}
                                  <span className="clause-book-movement-count">{surface.count}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="clause-output-empty">No related surfaces proposed.</p>
                        )}
                      </section>

                      <section aria-label="Proposed hits">
                        <h4 className="clause-movement-dashboard-section-title">Proposed hits</h4>
                        <ul className="clause-definitions-hit-list">
                          {definitionInvestigation.hits.map(hit => {
                            const stored = activeDefinitionTerm.hits.find(h => h.id === hit.id);
                            const status = stored
                              ? stored.confirmed
                                ? "confirmed"
                                : "dismissed"
                              : "pending";
                            if (status === "confirmed" || status === "dismissed") return null;
                            return (
                              <li
                                key={hit.id}
                                className={
                                  selectedDefinitionHitId === hit.id
                                    ? "clause-definitions-hit clause-definitions-hit--selected"
                                    : "clause-definitions-hit"
                                }
                              >
                                <button
                                  type="button"
                                  className="clause-definitions-hit-main"
                                  onClick={() => setSelectedDefinitionHitId(hit.id)}
                                >
                                  <span className="clause-book-movement-badge">{hit.verseKey}</span>
                                  <span className="clause-definitions-hit-kind">{hit.kind}</span>
                                  <span className="clause-book-movement-meta">{hit.snippet}</span>
                                </button>
                                <div className="clause-definitions-hit-actions">
                                  <button
                                    type="button"
                                    className="clause-print-btn"
                                    onClick={() =>
                                      confirmDefinitionHit({
                                        id: hit.id,
                                        verseKey: hit.verseKey,
                                        kind: hit.kind,
                                        snippet: hit.snippet
                                      })
                                    }
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="clause-h3-flow-remove"
                                    onClick={() => dismissDefinitionHit(hit.id)}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        {definitionInvestigation.hits.every(hit =>
                          activeDefinitionTerm.hits.some(h => h.id === hit.id)
                        ) ? (
                          <p className="clause-output-empty">
                            {definitionInvestigation.hits.length
                              ? "All proposals reviewed — see confirmed dossier below."
                              : "No definitional hits proposed for this seed."}
                          </p>
                        ) : null}
                      </section>

                      <section aria-label="Confirmed dossier">
                        <h4 className="clause-movement-dashboard-section-title">
                          Confirmed dossier
                        </h4>
                        {activeDefinitionTerm.hits.filter(h => h.confirmed).length ? (
                          <ul className="clause-definitions-hit-list">
                            {[...activeDefinitionTerm.hits]
                              .filter(h => h.confirmed)
                              .sort((a, b) => {
                                const [ac, av] = a.verseKey.split(":").map(Number);
                                const [bc, bv] = b.verseKey.split(":").map(Number);
                                return ac - bc || av - bv;
                              })
                              .map(hit => (
                                <li
                                  key={hit.id}
                                  className={
                                    selectedDefinitionHitId === hit.id
                                      ? "clause-definitions-hit clause-definitions-hit--selected clause-definitions-hit--confirmed"
                                      : "clause-definitions-hit clause-definitions-hit--confirmed"
                                  }
                                >
                                  <button
                                    type="button"
                                    className="clause-definitions-hit-main"
                                    onClick={() => setSelectedDefinitionHitId(hit.id)}
                                  >
                                    <span className="clause-book-movement-badge">
                                      {hit.verseKey}
                                    </span>
                                    <span className="clause-definitions-hit-kind">{hit.kind}</span>
                                    <span className="clause-book-movement-meta">{hit.snippet}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="clause-h3-flow-remove"
                                    onClick={() => dismissDefinitionHit(hit.id)}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="clause-output-empty">
                            Confirm hits to build the dossier for this term.
                          </p>
                        )}
                      </section>
                    </>
                  ) : (
                    <p className="clause-output-empty">
                      Pick a repeated word or type a seed, then Investigate.
                    </p>
                  )}
                </div>

                <aside className="clause-definitions-verse" aria-label="Verse and working definition">
                  {selectedDefinitionHit ? (
                    <>
                      <p className="clause-verse-label">{selectedDefinitionHit.verseKey}</p>
                      <p className="clause-movement-verse-text">
                        {verseTextByKey.get(selectedDefinitionHit.verseKey) ||
                          wordsByVerse
                            .get(selectedDefinitionHit.verseKey)
                            ?.map(w => w.text)
                            .join(" ") ||
                          selectedDefinitionHit.snippet ||
                          "(no verse text)"}
                      </p>
                      {selectedDefinitionHit.confirmed && activeDefinitionTerm ? (
                        <label className="clause-definitions-hit-note">
                          <span className="clause-movement-dashboard-section-title">Hit note</span>
                          <input
                            type="text"
                            className="clause-h3-flow-h2-name"
                            value={selectedDefinitionHit.note ?? ""}
                            placeholder="optional note"
                            aria-label="Note for this hit"
                            onChange={event => {
                              const note = event.target.value;
                              const hitId = selectedDefinitionHit.id;
                              updateActiveDefinitionTerm(term => ({
                                ...term,
                                hits: term.hits.map(h =>
                                  h.id === hitId
                                    ? { ...h, note: note.trim() || undefined }
                                    : h
                                )
                              }));
                            }}
                          />
                        </label>
                      ) : null}
                    </>
                  ) : (
                    <p className="clause-output-empty">Select a hit to read the verse.</p>
                  )}

                  {activeDefinitionTerm ? (
                    <label className="clause-definitions-working">
                      <span className="clause-movement-dashboard-section-title">
                        Working definition
                      </span>
                      <p className="clause-section-note">
                        What John means by {activeDefinitionTerm.seed} in this letter — your prose
                        only.
                      </p>
                      <textarea
                        className="clause-definitions-working-text"
                        rows={8}
                        value={activeDefinitionTerm.workingDefinition}
                        placeholder="Write from the confirmed dossier — do not paste a lexicon sense."
                        onChange={event => {
                          const workingDefinition = event.target.value;
                          updateActiveDefinitionTerm(term => ({
                            ...term,
                            workingDefinition
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                </aside>
              </div>
            </div>
          ) : null}

          {structureMode === "thread" ? (
            <div className="clause-thread-view" aria-label="Book thread">
              <p className="clause-section-note clause-thread-view-intro">
                Software proposes waypoints. You name the short steps — never auto themes.
              </p>
              <div className="clause-thread-view-grid">
                <aside className="clause-thread-proposals" aria-label="Proposed waypoints">
                  <h3 className="clause-movement-explorer-heading">Proposed waypoints</h3>
                  {threadWaypointProposals.length ? (
                    <ul className="clause-thread-proposal-list">
                      {threadWaypointProposals.map(proposal => (
                        <li key={proposal.id} className="clause-thread-proposal">
                          <div className="clause-definitions-hit-main">
                            <span className="clause-book-movement-badge">{proposal.verseKey}</span>
                            <span className="clause-definitions-hit-kind">{proposal.source}</span>
                            <span className="clause-book-movement-meta">{proposal.evidence}</span>
                          </div>
                          <button
                            type="button"
                            className="clause-print-btn"
                            onClick={() => addThreadWaypoint(proposal)}
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="clause-output-empty">
                      No open proposals — writing purposes, opens, and confirmed definition hits
                      already on the thread, or none detected yet.
                    </p>
                  )}
                </aside>

                <div className="clause-thread-center" aria-label="Your thread">
                  <h3 className="clause-movement-explorer-heading">Your thread</h3>
                  {bookThread.steps.length ? (
                    <ol className="clause-thread-chain">
                      {bookThread.steps.map((step, index) => (
                        <li key={step.id} className="clause-thread-step-wrap">
                          {index > 0 ? (
                            <span className="clause-thread-arrow" aria-hidden="true">
                              ↓
                            </span>
                          ) : null}
                          <div
                            className={
                              selectedThreadStepId === step.id
                                ? "clause-thread-step clause-thread-step--selected"
                                : "clause-thread-step"
                            }
                          >
                            <button
                              type="button"
                              className="clause-thread-step-select"
                              onClick={() => setSelectedThreadStepId(step.id)}
                            >
                              <span className="clause-book-movement-badge">{step.verseKey}</span>
                              <span className="clause-definitions-hit-kind">{step.source}</span>
                            </button>
                            <input
                              type="text"
                              className="clause-h3-flow-h2-name clause-thread-step-label"
                              value={step.label}
                              placeholder="…"
                              aria-label={`Name step at ${step.verseKey}`}
                              onFocus={() => setSelectedThreadStepId(step.id)}
                              onChange={event =>
                                updateThreadStep(step.id, s => ({
                                  ...s,
                                  label: event.target.value
                                }))
                              }
                            />
                            {step.evidence ? (
                              <p className="clause-book-movement-meta clause-thread-step-evidence">
                                {step.evidence}
                              </p>
                            ) : null}
                            <div className="clause-thread-step-actions">
                              <button
                                type="button"
                                className="clause-print-btn"
                                disabled={index === 0}
                                onClick={() => moveThreadStep(step.id, -1)}
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                className="clause-print-btn"
                                disabled={index === bookThread.steps.length - 1}
                                onClick={() => moveThreadStep(step.id, 1)}
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                className="clause-h3-flow-remove"
                                onClick={() => removeThreadStep(step.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="clause-output-empty">
                      Add waypoints from the left, then name each step.
                    </p>
                  )}

                  {bookThread.steps.some(s => s.label.trim()) ? (
                    <div className="clause-thread-sum-chain" aria-label="Named chain">
                      <h4 className="clause-movement-dashboard-section-title">Named chain</h4>
                      <ol className="clause-thread-sum-chain-list">
                        {bookThread.steps.map((step, index) => (
                          <li key={step.id} className="clause-thread-sum-chain-item">
                            {index > 0 ? (
                              <span className="clause-thread-sum-arrow" aria-hidden="true">
                                ↓
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className={
                                selectedThreadStepId === step.id
                                  ? "clause-thread-sum-label clause-thread-sum-label--selected"
                                  : "clause-thread-sum-label"
                              }
                              onClick={() => setSelectedThreadStepId(step.id)}
                            >
                              {step.label.trim() || "…"}
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </div>

                <aside className="clause-thread-verse" aria-label="Selected step verse">
                  {selectedThreadStep ? (
                    <>
                      <p className="clause-verse-label">{selectedThreadStep.verseKey}</p>
                      <p className="clause-movement-verse-text">
                        {verseTextByKey.get(selectedThreadStep.verseKey) ||
                          wordsByVerse
                            .get(selectedThreadStep.verseKey)
                            ?.map(w => w.text)
                            .join(" ") ||
                          "(no verse text)"}
                      </p>
                      {selectedThreadStep.evidence ? (
                        <p className="clause-section-note">{selectedThreadStep.evidence}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="clause-output-empty">Select a step to read its verse.</p>
                  )}
                </aside>
              </div>
            </div>
          ) : null}

          <div
            className="structure-passage-stack"
            hidden={
              structureMode === "movement" ||
              structureMode === "definitions" ||
              structureMode === "thread"
            }
            aria-hidden={
              structureMode === "movement" ||
              structureMode === "definitions" ||
              structureMode === "thread"
            }
          >
          <div className="structure-audits" aria-label="Structure audits and warnings">
          {unreviewedClauseRows.length ? (
            <section className="clause-unresolved-participles" aria-label="Clauses not yet identified">
              <div className="clause-audit-header">
                <h3>
                  Not yet identified — {unreviewedClauseRows.length} of {reviewClauseRows.length} mood-tagged
                  clause{reviewClauseRows.length === 1 ? "" : "s"}
                </h3>
              </div>
              <p className="clause-section-note">
                Span is saved, but the clause shape is still open — Independent, relative, content, or
                adverbial (time / reason / condition / purpose). Open one to finish it.
              </p>
              <ul className="clause-audit-list">
                {unreviewedClauseRows.map(row => (
                  <li key={row.finiteVerb.finiteVerbId}>
                    <button
                      type="button"
                      className="clause-audit-ref clause-audit-ref--link"
                      onClick={() => inspectClauseBeginning(row)}
                    >
                      {row.reference}
                    </button>
                    <span className="clause-audit-range">{row.spanText || "(no span text)"}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : reviewClauseRows.length ? (
            <section
              className="clause-unresolved-participles clause-unresolved-participles--clear"
              aria-label="All clauses identified"
            >
              <h3>All mood-tagged clauses identified</h3>
              <p className="clause-section-note">
                Every saved mood-tagged clause has a shape. Reopen any from the list below if you want to
                reconsider.
              </p>
            </section>
          ) : null}

          {missingActorClauseRows.length ? (
            <section className="clause-unresolved-participles" aria-label="Clauses without actor">
              <div className="clause-audit-header">
                <h3>
                  Actor not yet observed — {missingActorClauseRows.length} of {reviewClauseRows.length}{" "}
                  mood-tagged clause{reviewClauseRows.length === 1 ? "" : "s"}
                </h3>
              </div>
              <p className="clause-section-note">
                Span is saved, but Quién actúa is still open. Open a clause and tap the subject in the chapter
                text — this does not change the clause span.
              </p>
              <ul className="clause-audit-list">
                {missingActorClauseRows.map(row => (
                  <li key={`actor-${row.finiteVerb.finiteVerbId}`}>
                    <button
                      type="button"
                      className="clause-audit-ref clause-audit-ref--link"
                      onClick={() => inspectClauseBeginning(row)}
                    >
                      {row.reference}
                    </button>
                    <span className="clause-audit-range">{row.spanText || "(no span text)"}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : reviewClauseRows.length ? (
            <section
              className="clause-unresolved-participles clause-unresolved-participles--clear"
              aria-label="All actors observed"
            >
              <h3>All mood-tagged clauses have Quién actúa</h3>
              <p className="clause-section-note">
                Every saved mood-tagged clause has a subject actor. Object / receptor remains optional.
              </p>
            </section>
          ) : null}

          {categorizedClauseRows.length ? (
            <section
              className="clause-unresolved-participles clause-unresolved-participles--clear"
              aria-label="Categorized clauses"
            >
              <div className="clause-audit-header">
                <h3>
                  Categorized — {categorizedClauseRows.length} of {reviewClauseRows.length} mood-tagged clause
                  {reviewClauseRows.length === 1 ? "" : "s"}
                </h3>
              </div>
              <p className="clause-section-note">
                These already have a shape in Structure. Tap a reference to reopen and check it.
              </p>
              <ul className="clause-audit-list">
                {categorizedClauseRows.map(row => (
                  <li key={row.finiteVerb.finiteVerbId}>
                    <button
                      type="button"
                      className="clause-audit-ref clause-audit-ref--link"
                      onClick={() => inspectClauseBeginning(row)}
                    >
                      {row.reference}
                    </button>
                    <span className="clause-audit-range">{describeClauseCategory(row)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {greekSpanMismatches.length ? (
          <section className="clause-unresolved-participles" aria-label="Greek span audit">
            <div className="clause-audit-header">
              <h3>
                Greek span audit — {greekSpanMismatches.length} of {greekSpanAudit.length} clause
                {greekSpanAudit.length === 1 ? "" : "s"} drifted
              </h3>
            </div>
            <p className="clause-section-note">
              Greek is authoritative. These clauses’ saved Spanish word-span no longer matches what their
              stored Greek range maps to in LBF (often after an alignment fix). Resync keeps the Greek
              boundary and rewrites the Spanish span — or open the verb and Save after adjusting Greek.
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
                      <button
                        type="button"
                        className="clause-audit-ref clause-audit-ref--link"
                        onClick={() => {
                          // Span audit → edit belonging (Save/Clear panel).
                          const row = clauseRows.find(
                            candidate => candidate.finiteVerb.finiteVerbId === entry.finiteVerbId
                          );
                          if (row) {
                            setActiveBeginningVerbId(entry.finiteVerbId);
                            selectVerb(row.finiteVerb);
                          }
                        }}
                      >
                        {bookInfo.displayName} {entry.chapter}:{entry.verse} ({entry.finiteVerbId})
                      </button>
                      <span className="clause-audit-range">
                        Greek{" "}
                        {entry.storedRange
                          ? `${entry.storedRange.greekStartTokenId}–${entry.storedRange.greekEndTokenId}`
                          : "none"}
                        {" · "}
                        Spanish words {entry.actualSpanishSpan.length} saved /{" "}
                        {entry.expectedSpanishSpan.length} expected from Greek
                      </span>
                      {entry.storedRange ? (
                        <button
                          type="button"
                          className="clause-audit-ref clause-audit-ref--link"
                          onClick={() => resyncSpanishFromStoredGreek(entry.finiteVerbId)}
                        >
                          Resync Spanish
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          ) : null}

          {greekReconfirmationProgress.unconfirmed.length ? (
          <section className="clause-unresolved-participles" aria-label="Greek re-confirmation progress">
            <div className="clause-audit-header">
              <h3>
                Greek re-confirmation — {greekReconfirmationProgress.confirmedCount} of {greekReconfirmationProgress.total} clauses confirmed
              </h3>
            </div>
            <p className="clause-section-note">
              The span audit only checks Greek↔Spanish consistency. This count only rises when a clause is
              re-saved (or Resync’d) through the Greek-token path — clauses below still carry pre-migration
              confirmation.
            </p>
            <ul className="clause-audit-list">
              {greekReconfirmationProgress.unconfirmed.map(({ assignment, row }) => (
                <li key={assignment.finiteVerbId}>
                  {row ? (
                    <button
                      type="button"
                      className="clause-audit-ref clause-audit-ref--link"
                      onClick={() => {
                        // Re-confirm Greek span — open the Save/Clear panel.
                        setActiveBeginningVerbId(assignment.finiteVerbId);
                        selectVerb(row.finiteVerb);
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
          </section>
          ) : null}

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
                      onClick={() => {
                        requestObservationScroll();
                        setActiveBeginningVerbId(flag.finiteVerbId);
                        setActiveVerbId(null);
                        setDraftGreekRange(null);
                        setGreekRangeAnchorToken(null);
                      }}
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

          </div>

        <section
          className={["clause-builder-body", "structure-passage", showSpanishOnly ? "structure-passage--spanish-only" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-label={
            showSpanishOnly
              ? `LBF Spanish text of ${bookInfo.displayName} (settled reading)`
              : `Greek text of ${bookInfo.displayName}, Spanish alongside`
          }
        >
          {verses.map(verse => {
            const verseTokens = getVerseInterlinear(verse.chapter, verse.verse, bookId);
            const lbfSurfaces = loadLbfTokenSurfaces(verse.chapter, verse.verse, bookId);
            const isActiveVerse = Boolean(activeVerb && activeVerb.chapter === verse.chapter && activeVerb.verse === verse.verse);

            return (
              <article className="clause-verse" key={`${verse.chapter}:${verse.verse}`}>
                <p className="clause-verse-label">
                  {verse.chapter}:{verse.verse}
                </p>

                {/* Greek workstation — omit entirely in Spanish-only mode.
                    (Do not use the HTML hidden attribute: .clause-greek-row's
                    display:flex overrides [hidden] and left Greek on screen.) */}
                {!showSpanishOnly ? (
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
                    const reviewing = reviewingGreekTokenIds.has(tokenId);
                    const lbfAid = lbfSurfaces.get(tokenNumber);
                    // LBF only under the token. Unaligned → · (MorphGNT spine
                    // stays; Spanish surface is LBF — no BLE gloss fallback).
                    const aidText = lbfAid;

                    let className = "clause-greek-token";
                    if (isVerbToken) className += " clause-greek-token--verb";
                    if (isActiveToken) className += " clause-greek-token--active-verb";
                    if (inDraft) className += " clause-greek-token--belonging";
                    if (inSaved && !inDraft && !isActiveToken) className += " clause-greek-token--saved";
                    if (overlaps) className += " clause-greek-token--overlap";
                    if (reviewing) className += " clause-greek-token--reviewing";
                    if (!lbfAid) className += " clause-greek-token--unaligned";

                    return (
                      <TokenDetailAnchor
                        key={tokenId}
                        className={className}
                        onClick={event => handleGreekTokenClick(verse.chapter, verse.verse, tokenNumber, event)}
                        aria-pressed={isActiveToken || inDraft || reviewing}
                        data-token-id={tokenId}
                        disabled={!isVerbToken && !isActiveVerse}
                        surface={
                          <>
                            <span className="clause-greek-token-surface">
                              {token.surface.replace(/[⸀⸁⸂⸃,.;·]/g, "")}
                            </span>
                            <span className="clause-greek-token-gloss">{aidText || "·"}</span>
                          </>
                        }
                        detail={
                          <span className="token-detail-entry">
                            {token.lemma !== token.surface ? (
                              <span className="token-detail-lemma">{token.lemma}</span>
                            ) : null}
                            <span className="token-detail-codes">
                              <span className="token-detail-strongs">{token.strongs}</span>
                              {token.morph ? <span className="token-detail-rmac">{token.morph}</span> : null}
                            </span>
                            <span className="token-detail-morph-desc">{describeMorph(token.morph)}</span>
                            <span className="token-detail-gloss">
                              {lbfAid ? `LBF: ${lbfAid}` : "LBF: (unaligned)"}
                            </span>
                          </span>
                        }
                      />
                    );
                  })}
                </p>
                ) : null}

                <p
                  className={[
                    "clause-verse-text",
                    "clause-verse-text--reference",
                    "clause-verse-text--with-saved-phrases",
                    showSpanishOnly ? "clause-verse-text--spanish-primary" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label="LBF verse in Spanish reading order"
                >
                  {groupSpanishPhrases(
                    verse.words,
                    clauseOwnersByWordId,
                    isActiveVerse ? draftSpan : null,
                    activeBeginningVerbId
                  ).map((phrase, phraseIndex) => {
                    const phraseClass = [
                      "clause-phrase",
                      `clause-phrase--${phrase.kind}`,
                      phrase.alt ? "clause-phrase--alt" : ""
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <span className={phraseClass} key={`${phrase.key}:${phraseIndex}`}>
                        {phraseIndex > 0 ? " " : null}
                        {phrase.words.map((word, wordIndex) => {
                          const isActiveVerb = Boolean(activeVerbId && word.finiteVerbId === activeVerbId);
                          const isSavedVerb = Boolean(
                            word.finiteVerbId && assignments[word.finiteVerbId]?.selectedSpan.length
                          );
                          let wordClass = "clause-word clause-word--reference";
                          if (word.finiteVerbId) wordClass += " clause-word--verb";
                          if (isSavedVerb) wordClass += " clause-word--verb-saved";
                          if (isActiveVerb) wordClass += " clause-word--active-verb";
                          return (
                            <span className={wordClass} key={word.id}>
                              {wordIndex > 0 ? " " : null}
                              {word.text}
                            </span>
                          );
                        })}
                      </span>
                    );
                  })}
                </p>
              </article>
            );
          })}
        </section>

          <div className="clause-only-workspace">
          <nav className="clause-side-menu" aria-label="Clause list">
            <div className="clause-side-menu-header">
              <h3>Clauses</h3>
              <span className="clause-side-menu-count">
                {reviewedCount}/{reviewClauseRows.length}
              </span>
            </div>
            {workspaceClauseRows.length ? (
              <div className="clause-only-list">
                {workspaceClauseRows.map(row => {
                  const reviewState = getClauseReviewState(row);
                  const isActive = row.finiteVerb.finiteVerbId === activeBeginningVerbId;
                  return (
                    <button
                      type="button"
                      className={[
                        "clause-only-item",
                        isActive ? "clause-only-item--inspecting" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={row.finiteVerb.finiteVerbId}
                      data-clause-nav-id={row.finiteVerb.finiteVerbId}
                      onClick={() => inspectClauseBeginning(row)}
                    >
                      <span className="clause-only-item-top">
                        <span className="clause-line-reference">{row.reference}</span>
                        <span
                          className={`clause-review-state clause-review-state--${reviewState.toLowerCase().replace(/\s/g, "-")}`}
                        >
                          {reviewState}
                        </span>
                      </span>
                      <span className="clause-only-text">{renderClauseLine(row)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="clause-output-empty">No mood-tagged clauses yet.</p>
            )}
          </nav>

          <div className="clause-only-main">
            {activeBeginningRow ? (
              <section
                className="clause-review-panel"
                aria-label="Clause observation"
                data-observation-center
              >
                <div className="clause-review-progress">
                  <span>{reviewedCount} of {reviewClauseRows.length} mood-tagged clauses reviewed</span>
                </div>

                {autoAdvancedNoticeId && autoAdvancedNoticeId === activeBeginningVerbId ? (
                  <p className="clause-auto-advance-notice" role="status">
                    Moved to next clause: {activeBeginningRow.reference} · {renderClauseLine(activeBeginningRow)}
                  </p>
                ) : null}

                {hostFixHint && hostFixHint.hostVerbId === activeBeginningVerbId ? (
                  <p className="clause-parked-banner clause-parked-banner--host" role="status">
                    Host for {hostFixHint.parkedReference} — expand <em>this</em> clause’s Greek span until it includes
                    “{hostFixHint.nounText}”, then Save. Editing the relative itself cannot nest it.
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

                {activeParticiples.length && activeBeginningVerbId ? (
                  <div className="clause-participle-satellite-list" aria-label="What hangs with this clause">
                    {renderParticipleNounGroups(
                      activeParticiples,
                      wordsInVerse(activeParticiples[0].chapter, activeParticiples[0].verse),
                      activeBeginningVerbId
                    )}
                  </div>
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
                    <span className="clause-beginning-label">LBF</span>
                    {activeBeginningRow.beginningTokens.map(token => {
                      const [ch, vs, tok] = token.id.split(":").map(Number);
                      const lbf =
                        Number.isFinite(ch) && Number.isFinite(vs) && Number.isFinite(tok)
                          ? loadLbfTokenSurfaces(ch, vs, bookId).get(tok)
                          : undefined;
                      return (
                        <span className="clause-beginning-token clause-beginning-token--lbf" key={`lbf-${token.id}`}>
                          {lbf?.replace(/·/g, " ").trim() || "·"}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div
                  className={
                    activeObservation.describesNoun === "yes"
                      ? "clause-context-panel clause-context-panel--chapter clause-context-panel--noun-pick"
                      : "clause-context-panel clause-context-panel--chapter"
                  }
                  aria-label="Spanish context for this chapter"
                >
                  {activeObservation.describesNoun === "yes" ? (
                    <p className="clause-noun-host-legend" role="note">
                      <span className="clause-noun-host-swatch" aria-hidden="true" />
                      Independent clause spans are highlighted — look there for the noun this relative hangs
                      on (often in a nearby verse).
                    </p>
                  ) : null}
                  {activeObservationContextVerses.map(verse => {
                    const isCurrentVerse =
                      verse.chapter === activeBeginningRow.finiteVerb.chapter &&
                      verse.verse === activeBeginningRow.finiteVerb.verse;
                    const hasIndependentHost =
                      activeObservation.describesNoun === "yes" &&
                      verse.words.some(
                        word =>
                          independentClauseWordIds.has(word.id) && !activeClauseWordIds.has(word.id)
                      );
                    return (
                    <p
                      className={[
                        "clause-noun-verse",
                        isCurrentVerse ? "clause-noun-verse--current" : "",
                        hasIndependentHost ? "clause-noun-verse--has-independent" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={`${verse.chapter}:${verse.verse}`}
                      data-context-verse={`${verse.chapter}:${verse.verse}`}
                    >
                      <span className="clause-noun-verse-label">
                        {verse.chapter}:{verse.verse}
                      </span>
                      <span>
                        {verse.words.map((word, position) => {
                          const canSelectNoun = activeObservation.describesNoun === "yes";
                          const isSelected = Boolean(activeObservation.describedNounSpan?.includes(word.id));
                          const isIndependentHost =
                            canSelectNoun &&
                            independentClauseWordIds.has(word.id) &&
                            !activeClauseWordIds.has(word.id);
                          return (
                            <span key={word.id}>
                              {position > 0 ? " " : null}
                              {canSelectNoun ? (
                                <button
                                  type="button"
                                  className={[
                                    "clause-noun-word",
                                    isSelected ? "clause-noun-word--selected" : "",
                                    isIndependentHost ? "clause-noun-word--independent" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
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
                    );
                  })}
                </div>

                <section className="clause-observation" aria-label="Current observation">
                  {activeObservation.describesNoun === "yes" ? (
                    <div className="clause-noun-picker">
                      <p className="clause-observation-term">Relative clause</p>
                      {activeResolved?.parked ? (
                        (() => {
                          const parkedHosts =
                            activeBeginningRow && (activeObservation.describedNounSpan?.length ?? 0)
                              ? findHostCandidatesForParked(
                                  {
                                    finiteVerbId: activeBeginningRow.finiteVerb.finiteVerbId as string,
                                    reference: activeBeginningRow.reference,
                                    spanText: activeBeginningRow.spanText,
                                    wordIds: activeBeginningRow.selectedWords.map(word => word.id),
                                    order:
                                      activeBeginningRow.finiteVerb.chapter * 100000 +
                                      activeBeginningRow.finiteVerb.verse * 1000 +
                                      activeBeginningRow.finiteVerb.index
                                  },
                                  activeObservation.describedNounSpan ?? [],
                                  clauseSpanInfos
                                )
                              : [];
                          return (
                            <>
                              <p className="clause-parked-banner" role="status">
                                {parkedHosts.length ? (
                                  <>
                                    Parked — “{describedNounText}” is in the same verse as a host clause, but outside
                                    that host’s saved span. Tap below to stretch the host so it includes “
                                    {describedNounText}”; then this relative can nest.
                                  </>
                                ) : (
                                  <>
                                    Expected parked — {describedNounText ? `“${describedNounText}”` : "the selected noun"}{" "}
                                    sits in material with no finite-verb host in this verse (often verbless 1:1–2 style
                                    text). Clause spans can’t cross verses, so a later root can’t claim it here. Leave
                                    it parked for the detailed pass; don’t keep stretching spans.
                                  </>
                                )}
                              </p>
                              {parkedHosts.length && describedNounText && activeBeginningRow ? (
                                <div className="clause-parked-hosts">
                                  <p className="clause-parked-hosts-label">
                                    Stretch a host in that verse to include the noun:
                                  </p>
                                  {parkedHosts.map(host => (
                                    <button
                                      type="button"
                                      key={host.finiteVerbId}
                                      className="clause-parked-host-button"
                                      onClick={() =>
                                        expandHostSpanToIncludeNoun(
                                          host.finiteVerbId,
                                          activeObservation.describedNounSpan ?? [],
                                          activeBeginningRow.reference,
                                          describedNounText
                                        )
                                      }
                                    >
                                      Include “{describedNounText}” in {host.reference}
                                      <span>{host.spanText || "(no span text)"}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          );
                        })()
                      ) : null}
                      <p>
                        Select the noun this clause describes, in the text above. Prefer words inside a highlighted
                        independent clause (e.g. Jesucristo in 1:7 for «a quien» in 1:8).
                      </p>
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
                      {unassignedSameVerseNotice}
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
                      {unassignedSameVerseNotice}
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
                  ) : isActiveInherited && !forceChoices ? (
                    <div className="clause-parent-picker">
                      <p className="clause-observation-term">
                        {activeResolved?.relation === "describes"
                          ? "Relative clause"
                          : activeResolved?.relation === "content"
                            ? "Content clause"
                            : activeResolved?.frameType
                              ? `${capitalize(activeResolved.frameType)} clause`
                              : "Dependent clause"}{" "}
                        · continues previous
                      </p>
                      <p className="clause-tutor-note">
                        Opens with a bare coordinator and shares the previous clause&apos;s dependency — not an
                        independent root, even if Q1–Q3 would all read &quot;no&quot; on their own.
                      </p>
                      <div className="clause-step-actions">
                        <button type="button" className="clause-reconsider" onClick={() => setForceChoices(true)}>
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
                      {/*
                        "All three no" is a real answer, but the Greek can flatly
                        contradict it — a clause opening with ἵνα/ὡς/ἐάν is not
                        independent no matter how the questions were answered, and
                        Compiler will end up demoting it downstream. Say so here,
                        where it can still be fixed, instead of letting the outline
                        carry a dependent clause as an H3.
                      */}
                      {activeSignal && activeSignal.kind !== "none" ? (
                        <p className="clause-tutor-note clause-tutor-note--conflict">
                          But the Greek disagrees: {activeSignal.reason}
                        </p>
                      ) : null}
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
                            <>
                              <p className="clause-uncertain-note">{activeSignal.reason}</p>
                              {activeChoiceGuidance?.suggested ? (
                                <p className="clause-tutor-note">
                                  The highlighted card is only a lean from that idiom — pick the shape that actually fits.
                                </p>
                              ) : null}
                            </>
                          ) : null}
                          {activeChoiceGuidance &&
                          activeSignal?.kind !== "uncertain" &&
                          (activeSignal?.kind === "none" || forceChoices) ? (
                            <p className="clause-tutor-note">
                              {activeChoiceGuidance.summary}
                              {forceChoices && activeChoiceGuidance.suggested
                                ? " The highlighted card is only a lean — pick the shape that actually fits."
                                : forceChoices
                                  ? " Pick the shape that actually fits."
                                  : ""}
                            </p>
                          ) : forceChoices ? (
                            <p className="clause-tutor-note">No problem — pick the shape that actually fits.</p>
                          ) : null}

                          <div className="clause-choice-grid">
                            {(activeChoiceGuidance?.options ?? FALLBACK_CLAUSE_CHOICES).map(option => (
                              <button
                                key={option.kind}
                                type="button"
                                className={[
                                  "clause-choice-btn",
                                  option.lean === "suggested" ? "clause-choice-btn--suggested" : ""
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => chooseByKind(option.kind)}
                              >
                                <span className="clause-choice-term-row">
                                  <span className="clause-choice-term">{option.term}</span>
                                  {option.lean === "suggested" ? (
                                    <span className="clause-choice-lean">Suggested</span>
                                  ) : null}
                                </span>
                                <span className="clause-choice-blurb">{option.blurb}</span>
                                {option.evidence ? (
                                  <span className="clause-choice-evidence">{option.evidence}</span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </section>

                {activeBeginningVerbId && activeBeginningRow.selectedWords.length ? (
                  <section className="clause-actor-svo" aria-label="Actor observation">
                    <p className="clause-observation-term">SUJETO → VERBO → OBJETO / RECEPTOR</p>
                    <p className="clause-section-note">
                      Quién actúa, qué hace, y sobre quién o qué recae la acción. Tap in the chapter text below —
                      this does not change the clause span.
                    </p>
                    <p className="clause-actor-summary" role="status">
                      <span>{spanTextFromIds(activeActor.subjectSpan) || "—"}</span>
                      <span aria-hidden="true"> → </span>
                      <span>{spanTextFromIds(activeActor.verbSpan) || "—"}</span>
                      <span aria-hidden="true"> → </span>
                      <span>{spanTextFromIds(activeActor.objectSpan) || "—"}</span>
                    </p>
                    <div className="clause-actor-fields">
                      {(
                        [
                          ["subject", "Quién actúa", activeActor.subjectSpan],
                          ["verb", "Qué hace", activeActor.verbSpan],
                          ["object", "Sobre quién o qué recae la acción", activeActor.objectSpan]
                        ] as const
                      ).map(([field, label, span]) => (
                        <div className="clause-actor-field" key={field}>
                          <button
                            type="button"
                            className={
                              pickingActorField === field
                                ? "clause-participle-host-pick clause-participle-host-pick--active"
                                : "clause-participle-host-pick"
                            }
                            onClick={() => beginActorFieldPick(field)}
                          >
                            {pickingActorField === field
                              ? "Tap a word below →"
                              : `${label}${span.length ? `: ${spanTextFromIds(span)}` : ""}`}
                          </button>
                          {span.length && field !== "verb" ? (
                            <button
                              type="button"
                              className="clause-participle-host-clear"
                              onClick={() => {
                                updateActorField(activeBeginningVerbId, field, []);
                                if (pickingActorField === field) setPickingActorField(null);
                              }}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    {pickingActorField ? (
                      <div className="clause-subject-host-picker" aria-label="Pick actor span">
                        <p className="clause-participle-host-picker-note" role="status">
                          {pickingActorField === "subject"
                            ? "Quién actúa — tap the subject (shift-click for a span)."
                            : pickingActorField === "verb"
                              ? "Qué hace — tap the verb (defaults to the finite verb; retap to change)."
                              : "Sobre quién o qué — tap the object or receptor (optional; shift-click for a span)."}
                        </p>
                        {verses
                          .filter(v => v.chapter === activeBeginningRow.finiteVerb.chapter)
                          .map(chapterVerse => {
                            const isSourceVerse =
                              chapterVerse.chapter === activeBeginningRow.finiteVerb.chapter &&
                              chapterVerse.verse === activeBeginningRow.finiteVerb.verse;
                            const selectedIds = new Set(
                              pickingActorField === "subject"
                                ? activeActor.subjectSpan
                                : pickingActorField === "verb"
                                  ? activeActor.verbSpan
                                  : activeActor.objectSpan
                            );
                            return (
                              <p
                                className={
                                  isSourceVerse
                                    ? "clause-subject-host-verse clause-subject-host-verse--current"
                                    : "clause-subject-host-verse"
                                }
                                data-actor-verse={`${chapterVerse.chapter}:${chapterVerse.verse}`}
                                key={`actor-${chapterVerse.chapter}:${chapterVerse.verse}`}
                              >
                                <span className="clause-subject-host-verse-label">
                                  {chapterVerse.chapter}:{chapterVerse.verse}
                                </span>
                                <span className="clause-subject-host-verse-text">
                                  {chapterVerse.words.map((word, position) => (
                                    <span key={word.id}>
                                      {position > 0 ? " " : null}
                                      <button
                                        type="button"
                                        className={
                                          selectedIds.has(word.id)
                                            ? "clause-noun-word clause-noun-word--selected"
                                            : "clause-noun-word clause-noun-word--subject-host"
                                        }
                                        onClick={event =>
                                          selectActorWord(
                                            activeBeginningVerbId,
                                            pickingActorField,
                                            word,
                                            event
                                          )
                                        }
                                      >
                                        {word.text}
                                      </button>
                                    </span>
                                  ))}
                                </span>
                              </p>
                            );
                          })}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </section>
            ) : (
              <p className="clause-output-empty">Select a clause from the side menu to review it here.</p>
            )}
          </div>
          </div>
          </div>

      </section>

          {skeletonOpen ? (
          <div
            className={[
              "clause-skeleton-popup",
              skeletonMaximized ? "clause-skeleton-popup--maximized" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              className="clause-skeleton-backdrop"
              aria-label="Close skeleton"
              onClick={closeSkeletonPopup}
            />
            <aside
              className="clause-skeleton-panel"
              aria-label="Skeleton"
              role="dialog"
              aria-modal="true"
              aria-labelledby="skeleton-popup-heading"
            >
            <div className="clause-skeleton-header">
              <div className="clause-skeleton-title-row">
                <h2 id="skeleton-popup-heading">Skeleton</h2>
                {skeleton.roots.length ? (
                  <span className="clause-skeleton-count">
                    {skeleton.roots.length} root{skeleton.roots.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <div className="clause-skeleton-actions">
                <button
                  type="button"
                  className="clause-skeleton-action"
                  onClick={() => setSkeletonMaximized(current => !current)}
                >
                  {skeletonMaximized ? "Restore" : "Maximize"}
                </button>
                <button type="button" className="clause-skeleton-action" onClick={closeSkeletonPopup}>
                  Close
                </button>
              </div>
            </div>
            <div className="clause-skeleton-body">

            {skeleton.parked.length ? (
              <div className="clause-parked-section clause-parked-section--priority">
                <h3>Needs a home ({skeleton.parked.length})</h3>
                <p className="clause-section-note">
                  These relatives describe a noun outside every other finite-verb span. Selecting the relative’s
                  verse cannot nest it. If a same-verse host exists, expand that host; if not (common for verbless
                  material), leave parked for the detailed pass — that is settled for now, not a broken fix.
                </p>
                <div className="clause-parked-list">
                  {skeleton.parked.map(parked => {
                    const nounSpan = parked.describedNounSpan ?? [];
                    const nounFirst = nounSpan.length ? wordById.get(nounSpan[0]) : undefined;
                    const nounText = nounFirst
                      ? formatClauseSpan(
                          nounSpan,
                          wordsByVerse.get(`${nounFirst.chapter}:${nounFirst.verse}`) ?? [],
                          verseTextByKey.get(`${nounFirst.chapter}:${nounFirst.verse}`) ?? ""
                        )
                      : "";
                    const ambiguousLabels = (parked.ambiguousOwnerIds ?? [])
                      .map(id => clauseSpanInfos.find(candidate => candidate.finiteVerbId === id))
                      .filter((candidate): candidate is ClauseSpanInfo => Boolean(candidate))
                      .map(candidate => candidate.reference);
                    const parkedInfo = clauseSpanInfos.find(clause => clause.finiteVerbId === parked.finiteVerbId);
                    const hostCandidates =
                      parkedInfo && nounSpan.length && !ambiguousLabels.length
                        ? findHostCandidatesForParked(parkedInfo, nounSpan, clauseSpanInfos)
                        : [];
                    return (
                      <div className="clause-parked-item" key={parked.finiteVerbId}>
                        <button
                          type="button"
                          className="clause-parked-item-main"
                          onClick={() => {
                            setHostFixHint(null);
                            openClauseFromSkeleton(parked.finiteVerbId);
                          }}
                        >
                          <span className="clause-parked-ref">{parked.reference}</span>
                          <span className="clause-parked-clause">{parked.spanText || "(no span text)"}</span>
                          <span className="clause-parked-noun">
                            Describes: {nounText ? `“${nounText}”` : "(no noun selected)"}
                          </span>
                          <span className="clause-parked-why">
                            {ambiguousLabels.length
                              ? `Tie — noun sits in more than one clause: ${ambiguousLabels.join(", ")}`
                              : hostCandidates.length
                                ? "No other clause contains this noun yet — expand a same-verse host"
                                : "Expected parked — noun sits in unplaced/verbless material; no same-verse host can take it"}
                          </span>
                          {parked.children.length ? (
                            <span className="clause-parked-dependents">
                              {parked.children.length} dependent{parked.children.length === 1 ? "" : "s"} waiting on this
                            </span>
                          ) : null}
                          <span className="clause-parked-action">
                            {hostCandidates.length ? "Open relative" : "OK as parked — open if needed"}
                          </span>
                        </button>
                        {hostCandidates.length && nounText ? (
                          <div className="clause-parked-hosts">
                            {hostCandidates.map(host => (
                              <button
                                type="button"
                                key={host.finiteVerbId}
                                className="clause-parked-host-button"
                                onClick={() =>
                                  expandHostSpanToIncludeNoun(
                                    host.finiteVerbId,
                                    nounSpan,
                                    parked.reference,
                                    nounText
                                  )
                                }
                              >
                                Include “{nounText}” in {host.reference}
                                <span>{host.spanText || "(no span text)"}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {outline.length || skeleton.roots.length ? (
              <div className="clause-telos-section clause-telos-section--compact" data-telos-section="true">
                <h3>Candidate telos</h3>
                {telos ? (
                  <>
                    {telos.purposeClauses.map(clause => (
                      <p className="clause-telos-item" key={clause.finiteVerbId}>
                        {clause.spanText}
                      </p>
                    ))}
                    {telos.lastOutlineClause ? (
                      <>
                        <p className="clause-telos-vs">compare with the outline&apos;s last point</p>
                        <p className="clause-telos-item clause-telos-item--outline">
                          {telos.lastOutlineClause.spanText}
                        </p>
                      </>
                    ) : null}
                    <p className="clause-telos-note">
                      Does this look like the book&apos;s stated purpose? That&apos;s your call, not something the
                      software concludes.
                    </p>
                  </>
                ) : (
                  <p className="clause-telos-note">
                    No candidate yet. A purpose clause (ἵνα / ὅπως) attached directly to a root independent
                    clause will appear here, next to the outline&apos;s last point.
                  </p>
                )}
              </div>
            ) : null}

            {outline.length ? (
              <div className="clause-book-movement" aria-label="Book movement">
                <h3>Book movement</h3>
                <p className="clause-section-note">
                  What keeps returning, what is added, and where threads converge — not themes, not
                  automatic H2s. Use the Movement view for the verse dashboard; inventory stays here.
                </p>
                <p className="clause-section-note">
                  <button
                    type="button"
                    className="clause-print-btn"
                    onClick={() => {
                      closeSkeletonPopup();
                      setStructureMode("movement");
                    }}
                  >
                    Open Movement view
                    {convergenceReport.hotspots.length
                      ? ` (${convergenceReport.hotspots.length} hotspots)`
                      : ""}
                  </button>
                </p>

                <details className="clause-book-movement-panel" open>
                  <summary>1. Writing-purpose trajectory</summary>
                  {bookMovementReport.writingPurposes.length ? (
                    <ol className="clause-book-movement-trajectory">
                      {bookMovementReport.writingPurposes.map(hit => (
                        <li key={hit.finiteVerbId}>
                          <span className="clause-book-movement-ref">{hit.reference}</span>
                          <span className="clause-book-movement-traj">{hit.trajectory}</span>
                          <button
                            type="button"
                            className="clause-print-btn clause-definitions-investigate-btn"
                            onClick={() => {
                              closeSkeletonPopup();
                              addThreadFromWritingPurpose(hit);
                            }}
                          >
                            Add to thread
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="clause-output-empty">No writing-purpose statements detected yet.</p>
                  )}
                </details>

                <details className="clause-book-movement-panel">
                  <summary>
                    2. Possible discourse resets
                    <span className="clause-book-movement-count">
                      {bookMovementReport.discourseResets.length}
                    </span>
                  </summary>
                  {bookMovementReport.discourseResets.length ? (
                    <ul className="clause-book-movement-list">
                      {bookMovementReport.discourseResets.map(hit => (
                        <li key={`${hit.finiteVerbId}:${hit.label}`}>
                          <span className="clause-book-movement-ref">{hit.reference}</span>
                          <span className="clause-book-movement-badge">{hit.label}</span>
                          <span className="clause-book-movement-kind">{hit.kind}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="clause-output-empty">No strong reset formulas detected.</p>
                  )}
                </details>

                <details className="clause-book-movement-panel">
                  <summary>
                    3. Repeated formulas
                    <span className="clause-book-movement-count">
                      {bookMovementReport.formulas.length}
                    </span>
                  </summary>
                  {bookMovementReport.formulasByFamily.length ? (
                    <div className="clause-book-movement-families">
                      {bookMovementReport.formulasByFamily.map(family => (
                        <div key={family.familyId} className="clause-book-movement-family">
                          <p className="clause-book-movement-family-label">{family.familyLabel}</p>
                          <p className="clause-book-movement-chain">
                            {family.hits.map(hit => hit.reference).join(" → ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="clause-output-empty">No formula families matched.</p>
                  )}
                </details>

                <details className="clause-book-movement-panel">
                  <summary>
                    4. Repeated words
                    <span className="clause-book-movement-count">
                      {bookMovementReport.repeatedWords.length}
                    </span>
                  </summary>
                  {bookMovementReport.repeatedWords.length ? (
                    <div className="clause-book-movement-families">
                      {bookMovementReport.repeatedWords.slice(0, 40).map(entry => (
                        <div key={entry.word} className="clause-book-movement-family">
                          <p className="clause-book-movement-family-label">
                            {entry.display}
                            <span className="clause-book-movement-count">{entry.count}</span>
                          </p>
                          <p className="clause-book-movement-chain">
                            {entry.verses.map((hit, hitIndex) => (
                              <span key={`${entry.word}:${hit.verseKey}`}>
                                {hitIndex > 0 ? " → " : null}
                                <span
                                  className={
                                    hit.isReturn
                                      ? "clause-book-movement-hit clause-book-movement-hit--return"
                                      : "clause-book-movement-hit"
                                  }
                                  title={
                                    hit.isReturn
                                      ? `Return · ×${hit.count}`
                                      : `×${hit.count}`
                                  }
                                >
                                  {hit.reference.replace(/^.*\s+(\d+:\d+)\s*$/, "$1") || hit.verseKey}
                                  {hit.isReturn ? "↩" : ""}
                                </span>
                              </span>
                            ))}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="clause-output-empty">No repeated content words yet.</p>
                  )}
                </details>

                <details className="clause-book-movement-panel">
                  <summary>
                    5. Semantic families
                    <span className="clause-book-movement-count">
                      {bookMovementReport.vocabByField.length} fields
                    </span>
                  </summary>
                  {bookMovementReport.vocabByField.length ? (
                    <div className="clause-book-movement-families">
                      {bookMovementReport.vocabByField.map(field => (
                        <div key={field.fieldId} className="clause-book-movement-family">
                          <p className="clause-book-movement-family-label">{field.fieldLabel}</p>
                          <p className="clause-book-movement-chain">
                            {field.hits.map((hit, hitIndex) => (
                              <span key={`${hit.finiteVerbId}:${hit.fieldId}`}>
                                {hitIndex > 0 ? " → " : null}
                                <span
                                  className={
                                    hit.isReturn
                                      ? "clause-book-movement-hit clause-book-movement-hit--return"
                                      : "clause-book-movement-hit"
                                  }
                                  title={
                                    hit.isReturn
                                      ? `Return: ${hit.matched.join(" · ")}`
                                      : hit.matched.join(" · ")
                                  }
                                >
                                  {hit.reference}
                                  {hit.isReturn ? "↩" : ""}
                                </span>
                              </span>
                            ))}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="clause-output-empty">No semantic families matched.</p>
                  )}
                </details>

                <details className="clause-book-movement-panel">
                  <summary>
                    6. Convergence &amp; candidate boundaries
                    <span className="clause-book-movement-count">
                      {bookMovementReport.candidateBoundaries.length}
                    </span>
                  </summary>
                  {bookMovementReport.convergences.length ? (
                    <>
                      <p className="clause-book-movement-subhead">Convergence points</p>
                      <ul className="clause-book-movement-list">
                        {bookMovementReport.convergences.slice(0, 12).map(hit => (
                          <li key={hit.finiteVerbId}>
                            <span className="clause-book-movement-ref">{hit.reference}</span>
                            <span className="clause-book-movement-meta">
                              {hit.strength} signals
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {bookMovementReport.candidateBoundaries.length ? (
                    <>
                      <p className="clause-book-movement-subhead">
                        Candidate large boundaries (≥3 independent signals)
                      </p>
                      <ul className="clause-book-movement-list">
                        {bookMovementReport.candidateBoundaries.map(hit => (
                          <li key={hit.afterH3Id}>
                            <span className="clause-book-movement-ref">{hit.reference}</span>
                            <span className="clause-book-movement-meta">
                              {hit.signalKinds.join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="clause-output-empty">
                      No candidate boundaries yet — one weak signal never opens a movement.
                    </p>
                  )}
                </details>
              </div>
            ) : null}

            {outline.length ? (
              <div className="clause-h3-flow" aria-label="H3 flow">
                <h3>H3 flow</h3>
                <p className="clause-section-note">
                  Linear clauses in book order. Prefer the Movement view when placing H2s —
                  begin a movement where several threads converge, not at every subject change.
                  Mark pressure where you notice tension.
                </p>
                <div className="clause-h3-flow-list">
                  {h3FlowMovements.map((movement, movementIndex) => {
                    const movementFirstId = movement.h3Ids[0] ?? "";
                    const prevMovementLast =
                      movementIndex > 0
                        ? h3FlowMovements[movementIndex - 1]?.units[
                            (h3FlowMovements[movementIndex - 1]?.units.length ?? 1) - 1
                          ]
                        : null;
                    const support = prevMovementLast
                      ? h3FlowSupportByAfterId.get(prevMovementLast.finiteVerbId)
                      : null;
                    return (
                      <div
                        key={movementFirstId || `movement-${movementIndex}`}
                        className="clause-h3-flow-movement"
                      >
                        {movementIndex > 0 && prevMovementLast ? (
                          <div className="clause-h3-flow-placed">
                            <div className="clause-h3-flow-rule" aria-hidden="true" />
                            {support?.observations.length ? (
                              <div className="clause-h3-flow-support">
                                <p className="clause-h3-flow-support-heading">
                                  Observations supporting this decision
                                </p>
                                <ul>
                                  {support.observations.map(item => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            <div className="clause-h3-flow-boundary clause-h3-flow-boundary--placed">
                              <button
                                type="button"
                                className="clause-h3-flow-remove"
                                onClick={() =>
                                  persistH3Flow(
                                    clearH2Start(h3FlowReconciled, prevMovementLast.finiteVerbId)
                                  )
                                }
                              >
                                Remove movement start
                              </button>
                              <button
                                type="button"
                                className={
                                  h3FlowPressureSet.has(prevMovementLast.finiteVerbId)
                                    ? "clause-h3-flow-pressure clause-h3-flow-pressure--on"
                                    : "clause-h3-flow-pressure"
                                }
                                aria-pressed={h3FlowPressureSet.has(prevMovementLast.finiteVerbId)}
                                title={
                                  h3FlowPressureSet.has(prevMovementLast.finiteVerbId)
                                    ? "Clear pressure mark"
                                    : "Mark pressure — tension or opposition you notice here"
                                }
                                onClick={() =>
                                  persistH3Flow(
                                    h3FlowPressureSet.has(prevMovementLast.finiteVerbId)
                                      ? clearPressureAfter(
                                          h3FlowReconciled,
                                          prevMovementLast.finiteVerbId
                                        )
                                      : markPressureAfter(
                                          h3FlowReconciled,
                                          prevMovementLast.finiteVerbId
                                        )
                                  )
                                }
                              >
                                {h3FlowPressureSet.has(prevMovementLast.finiteVerbId)
                                  ? "Pressure marked"
                                  : "Mark pressure"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <div className="clause-h3-flow-h2-bar">
                          <p className="clause-h3-flow-h2-heading">H2</p>
                          <label className="clause-h3-flow-h2-name-label">
                            <span className="clause-h3-flow-h2-name-caption">Name</span>
                            <input
                              type="text"
                              className="clause-h3-flow-h2-name"
                              value={h3FlowReconciled.labels[movementFirstId] ?? ""}
                              placeholder="optional"
                              aria-label="Name this movement"
                              onChange={event =>
                                persistH3Flow(
                                  setH2Label(h3FlowReconciled, movementFirstId, event.target.value)
                                )
                              }
                            />
                          </label>
                        </div>
                        {movement.units.map((unit, unitIndex) => {
                          const prevInMovement =
                            unitIndex > 0 ? movement.units[unitIndex - 1] ?? null : null;
                          const pressureMarked = prevInMovement
                            ? h3FlowPressureSet.has(prevInMovement.finiteVerbId)
                            : false;
                          const isCandidateSeam = prevInMovement
                            ? candidateBoundaryAfterIds.has(prevInMovement.finiteVerbId)
                            : false;
                          const isDiscourseReset = discourseResetIds.has(unit.finiteVerbId);
                          return (
                            <div key={unit.finiteVerbId} className="clause-h3-flow-item">
                              {prevInMovement ? (
                                <div
                                  className={
                                    isCandidateSeam
                                      ? "clause-h3-flow-boundary clause-h3-flow-boundary--candidate"
                                      : "clause-h3-flow-boundary"
                                  }
                                >
                                  {isCandidateSeam ? (
                                    <span className="clause-h3-flow-candidate-label">
                                      Candidate boundary
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={
                                      isCandidateSeam
                                        ? "clause-h3-flow-begin clause-h3-flow-begin--candidate"
                                        : "clause-h3-flow-begin"
                                    }
                                    onClick={() =>
                                      persistH3Flow(
                                        startH2After(h3FlowReconciled, prevInMovement.finiteVerbId)
                                      )
                                    }
                                  >
                                    Begin new movement
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      pressureMarked
                                        ? "clause-h3-flow-pressure clause-h3-flow-pressure--on"
                                        : "clause-h3-flow-pressure"
                                    }
                                    aria-pressed={pressureMarked}
                                    title={
                                      pressureMarked
                                        ? "Clear pressure mark"
                                        : "Mark pressure — tension or opposition you notice here"
                                    }
                                    onClick={() =>
                                      persistH3Flow(
                                        pressureMarked
                                          ? clearPressureAfter(
                                              h3FlowReconciled,
                                              prevInMovement.finiteVerbId
                                            )
                                          : markPressureAfter(
                                              h3FlowReconciled,
                                              prevInMovement.finiteVerbId
                                            )
                                      )
                                    }
                                  >
                                    {pressureMarked ? "Pressure marked" : "Mark pressure"}
                                  </button>
                                </div>
                              ) : null}
                              <div className="clause-h3-flow-row">
                                <div className="clause-h3-flow-main">
                                  <span className="clause-h3-flow-kind">H3</span>
                                  <span className="clause-h3-flow-ref">{unit.reference}</span>
                                  <span className="clause-h3-flow-span">{unit.spanText}</span>
                                  {isDiscourseReset ? (
                                    <span
                                      className="clause-h3-flow-reset-tick"
                                      title="Possible discourse reset — authorial reorientation, not an automatic H2"
                                    >
                                      Possible discourse reset
                                    </span>
                                  ) : null}
                                  {h3FlowPressureSet.has(unit.finiteVerbId) ? (
                                    <span
                                      className="clause-h3-flow-pressure-tick"
                                      title="Pressure marked after this H3"
                                    >
                                      pressure
                                    </span>
                                  ) : null}
                                </div>
                                <div
                                  className={
                                    unit.subject
                                      ? "clause-h3-flow-subject"
                                      : "clause-h3-flow-subject clause-h3-flow-subject--empty"
                                  }
                                  title="Quién actúa (H3 root)"
                                >
                                  <span className="clause-h3-flow-subject-label">sujeto</span>
                                  <span className="clause-h3-flow-subject-value">
                                    {unit.subject ?? "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="clause-actor-concentration">
              <h3>B. Actor concentration</h3>
              <p className="clause-section-note">
                Who dominates the passage — how many actions each observed subject carries.
              </p>
              {actorConcentration.length ? (
                <ul className="clause-actor-concentration-list">
                  {actorConcentration.map(entry => (
                    <li key={entry.label}>
                      <span className="clause-actor-concentration-name">{entry.label}</span>
                      <span className="clause-actor-concentration-count">
                        {entry.count} {entry.count === 1 ? "acción" : "acciones"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="clause-output-empty">
                  No actors yet. On a clause with a saved span, answer Quién actúa.
                </p>
              )}
            </div>

            <div className="clause-actor-flow">
              <h3>C. Actor flow</h3>
              <p className="clause-section-note">
                Full actor lines gathered under each subject — sujeto → verbo → objeto when observed.
              </p>
              {actorFlow.length ? (
                <div className="clause-actor-flow-list">
                  {actorFlow.map(group => (
                    <div className="clause-actor-flow-group" key={group.label}>
                      <p className="clause-actor-flow-actor">{group.label.toUpperCase()}</p>
                      <ul>
                        {group.actions.map((action, index) => (
                          <li key={`${group.label}:${action.triple}:${index}`}>{action.triple}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="clause-output-empty">
                  No actor flow yet. Observe Quién actúa and Qué hace on saved clauses.
                </p>
              )}
            </div>

            <details className="clause-skeleton-tree-details">
              <summary>Clause tree (grammar nest)</summary>
              <p className="clause-section-note">
                How clauses attach — relative, content, frame. Read the book in H3 flow above;
                open this when you need the nest.
              </p>
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
                    <dd>
                      who an imperative is addressed to, from Brick 2B — consecutive same-recipient
                      roots are grouped visually
                    </dd>
                  </div>
                </dl>
              ) : null}
              {skeleton.roots.length ? (
                <div className="clause-tree">{skeleton.roots.map(renderSkeletonNode)}</div>
              ) : (
                <p className="clause-output-empty">
                  Nothing placed yet. Classify a clause as Independent, or as content/frame pointing
                  at one, and it shows up here.
                </p>
              )}
            </details>

            <div className="clause-subject-host-section" data-subject-host-section="true">
            {verblessVerses.length ? (
              <div className="clause-verbless-section">
                <h3>No finite verb — set aside for the detailed pass</h3>
                <p className="clause-section-note">
                  These verses have no finite verb in the Greek at all, so Brick 1 never reaches them and they're not
                  part of the skeleton pass. Nothing to decide about them now — shown here only so they're visible,
                  not silently missing. Brick-4-marked participles show their form and hang.
                </p>
                {verblessVerses.map(verse => {
                  const hostKey = verse.participles.length
                    ? `${verse.participles[0].chapter}:${verse.participles[0].verse}`
                    : verse.reference;
                  return (
                  <div
                    className="clause-verbless-item"
                    key={verse.reference}
                    data-subject-host-key={verse.participles.length ? hostKey : undefined}
                  >
                    <p>
                      <span>{verse.reference}</span>
                      {verse.text}
                    </p>
                    {verse.participles.length ? (
                      <>
                        {renderParticipleNounGroups(verse.participles, verse.words, hostKey)}
                        {renderSubjectHostChapterPicker(
                          hostKey,
                          verse.participles[0].chapter,
                          verse.participles[0].verse
                        )}
                      </>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            ) : null}

            {orphanParticipleVerses.length ? (
              <div className="clause-verbless-section">
                <h3>Participles outside a saved clause span</h3>
                <p className="clause-section-note">
                  Marked in Brick 4 and sitting in a verse that has a finite verb, but not inside any saved clause
                  span yet — so they are not shown on a clause card (that would invent a host). Grouped under the
                  noun they hang on when morphology finds one; nominatives ask who they ride with. Expand the span
                  that actually contains them, or leave them here until the detailed pass.
                </p>
                {orphanParticipleVerses.map(verse => (
                  <div
                    className="clause-orphan-participle"
                    key={verse.key}
                    data-subject-host-key={verse.key}
                  >
                    <p>
                      <span>{verse.reference}</span>
                      {verse.text}
                    </p>
                    {renderParticipleNounGroups(verse.participles, verse.words, verse.key)}
                    {renderSubjectHostChapterPicker(
                      verse.key,
                      verse.participles[0].chapter,
                      verse.participles[0].verse
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {clauseSubjectHostEntries.length ? (
              <div className="clause-verbless-section">
                <h3>Who they ride with</h3>
                <p className="clause-section-note">
                  Nominative participles that already sit on a saved clause — pick their subject host here in the
                  same chapter list as phrase participles. This never changes clause length.
                </p>
                {clauseSubjectHostEntries.map(entry => (
                  <div
                    className="clause-orphan-participle"
                    key={entry.key}
                    data-subject-host-key={entry.key}
                  >
                    <p>
                      <span>{entry.reference}</span>
                      {entry.text}
                    </p>
                    {renderParticipleNounGroups(entry.participles, entry.words, entry.key)}
                    {renderSubjectHostChapterPicker(entry.key, entry.sourceChapter, entry.sourceVerse)}
                  </div>
                ))}
              </div>
            ) : null}
            </div>

            </div>
          </aside>
          </div>
          ) : null}


      {activeVerb && !showSpanishOnly ? (
        <aside className="clause-selection-panel" aria-live="polite">
          <p className="clause-active-verb">
            <span>
              {bookInfo.displayName} {activeVerb.chapter}:{activeVerb.verse}
            </span>
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
            <button
              type="button"
              className="clause-clear"
              onClick={clearActive}
              disabled={!draftGreekRange && !(activeVerbId && assignments[activeVerbId])}
            >
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
