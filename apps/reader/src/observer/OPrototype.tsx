import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeRmac, getVerseInterlinear, loadTitusData, type GreekToken, type GreekVerse, type VerseInterlinearToken } from "./o-data";

type ParticipationMode =
  | "finite"
  | "mood-commands"
  | "mood-statements"
  | "mood-subjunctive"
  | "mood-optative"
  | "command-recipients"
  | "participles";
type StatementLens = "All finite verbs" | "Statements only" | "Commands only";

interface CommandRecipientGroup {
  id: string;
  recipient: string;
  tokenIds: string[];
}

const MARKS_KEY = "o-prototype:titus:finite-verb-marks";
const COMMAND_MARKS_KEY = "roots:titus:brick2:mood:imperativeCandidates";
const STATEMENT_MARKS_KEY = "roots:titus:brick2c:mood:statementCandidates";
const SUBJUNCTIVE_MARKS_KEY = "roots:titus:brick3:mood:subjunctiveCandidates";
const OPTATIVE_MARKS_KEY = "roots:titus:brick3c:mood:optativeCandidates";
const PARTICIPLE_MARKS_KEY = "roots:titus:brick4:participleCandidates";
const COMMAND_RECIPIENTS_KEY = "roots:titus:brick2b:commandRecipients";
const STATEMENT_LENSES: StatementLens[] = ["All finite verbs", "Statements only", "Commands only"];
const RECIPIENTS = [
  "Titus",
  "Elders",
  "Older Men",
  "Older Women",
  "Younger Women",
  "Younger Men",
  "Bondservants",
  "Everyone",
  "Other"
];

function readMarks(storageKey: string): string[] {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readCommandRecipientGroups(): CommandRecipientGroup[] {
  try {
    const stored = window.localStorage.getItem(COMMAND_RECIPIENTS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CommandRecipientGroup => {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.recipient === "string" &&
        Array.isArray(item.tokenIds) &&
        item.tokenIds.every((tokenId: unknown) => typeof tokenId === "string")
      );
    });
  } catch {
    return [];
  }
}

function makeLocalId(prefix: string): string {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stripCriticalMarks(value: string): string {
  return value.replace(/[⸀⸁⸂⸃,.;·]/g, "");
}

type VerbMood = "indicative" | "subjunctive" | "imperative" | "optative";

// MorphGNT's finite-verb window: "V-" + person(1/2/3) + tense + voice + mood + ....
// A finite verb always carries a person digit here — infinitives and participles don't.
function moodFromSourceMorph(sourceMorph: string): VerbMood | null {
  if (!/^V-[123]/.test(sourceMorph)) return null;
  switch (sourceMorph[5]) {
    case "I":
      return "indicative";
    case "S":
      return "subjunctive";
    case "D":
    case "M":
      return "imperative";
    case "O":
      return "optative";
    default:
      return null;
  }
}

// Same window as moodFromSourceMorph, but participles carry "-" where a
// finite verb has its person digit, and mood 'P' instead of I/S/D/M/O.
function isParticipleSourceMorph(sourceMorph: string): boolean {
  return sourceMorph.startsWith("V-") && sourceMorph[5] === "P";
}

function setsMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

// setsMatch already handles this correctly on its own: when groundTruth is
// empty (e.g. Titus has no optative verbs at all), an untouched marked set
// is the *correct* state, not an unearned one — there's nothing to find, so
// nothing marked is nothing missed. The checkmark should reflect that from
// the start, not sit permanently unconfirmed for a brick with no answer to
// find. A mismarked token (marked non-empty, groundTruth empty) still
// correctly fails, since the sizes won't match.
function brickConfirmed(marked: Set<string>, groundTruth: Set<string>): boolean {
  return setsMatch(marked, groundTruth);
}

function tokenText(token: GreekToken): string {
  return stripCriticalMarks(token.surface);
}

function tokenLabel(token: GreekToken): string {
  return `${tokenText(token)} ${token.rmac}`;
}

function isFiniteMoodParticipation(participation: ParticipationMode): boolean {
  return (
    participation === "mood-commands" ||
    participation === "mood-statements" ||
    participation === "mood-subjunctive" ||
    participation === "mood-optative"
  );
}

function personNumberMeaning(rmac: string): string | null {
  const match = rmac.match(/^V-[A-Z]{3}-(1|2|3)(S|P)$/);
  if (!match) return null;

  const [, person, number] = match;
  const meanings: Record<string, string> = {
    "1S": "I",
    "1P": "we",
    "2S": "you (singular)",
    "2P": "you (plural)",
    "3S": "he/she/it",
    "3P": "they"
  };

  const code = `${person}${number}`;
  return `${code} means ${meanings[code]}`;
}

function BrickCheck({ confirmed }: { confirmed: boolean }) {
  if (!confirmed) return null;
  return (
    <span className="brick-check" aria-label="Confirmed against the source text">
      ✓
    </span>
  );
}

interface GreekTokenButtonProps {
  disabled?: boolean;
  isPressed: boolean;
  markClassName: string;
  onToggle: (token: GreekToken, verse: GreekVerse) => void;
  token: GreekToken;
  verse: GreekVerse;
  strongs?: string;
  gloss?: string;
}

// Reference (lemma/Strong's/morph description/gloss) lives on the same
// button a student clicks to mark — a hover/focus popover, not a second
// click state, so checking a word's full interlinear detail never competes
// with the marking click itself. Per interlinear-correction-spec.md: this
// replaces the standalone Interlinear screen, folded into the one place
// Brick 1-4 marking already happens instead of a separate destination.
const GreekTokenButton = memo(function GreekTokenButton({
  disabled = false,
  isPressed,
  markClassName,
  onToggle,
  token,
  verse,
  strongs,
  gloss
}: GreekTokenButtonProps) {
  return (
    <button
      type="button"
      className={`greek-token${markClassName ? ` ${markClassName}` : ""}`}
      disabled={disabled}
      onClick={() => onToggle(token, verse)}
      aria-pressed={isPressed}
      aria-label={tokenLabel(token)}
      data-token-id={token.id}
    >
      <span className="token-surface">{token.surface}</span>
      <span className="token-morph">{token.rmac}</span>
      <span className="token-detail-popover" role="tooltip">
        {token.lemma !== token.surface ? <span className="token-detail-lemma">{token.lemma}</span> : null}
        <span className="token-detail-codes">
          {strongs ? <span className="token-detail-strongs">{strongs}</span> : null}
          {token.rmac ? <span className="token-detail-rmac">{token.rmac}</span> : null}
        </span>
        <span className="token-detail-morph-desc">{describeRmac(token.rmac)}</span>
        {gloss ? <span className="token-detail-gloss">{gloss}</span> : null}
      </span>
    </button>
  );
});

export default function OPrototype() {
  const data = useMemo(() => loadTitusData(), []);
  const [participation, setParticipation] = useState<ParticipationMode>("finite");
  const [finiteMarkedIds, setFiniteMarkedIds] = useState<Set<string>>(
    () => new Set(readMarks(MARKS_KEY))
  );
  const [commandMarkedIds, setCommandMarkedIds] = useState<Set<string>>(
    () => new Set(readMarks(COMMAND_MARKS_KEY))
  );
  const [statementMarkedIds, setStatementMarkedIds] = useState<Set<string>>(
    () => new Set(readMarks(STATEMENT_MARKS_KEY))
  );
  const [subjunctiveMarkedIds, setSubjunctiveMarkedIds] = useState<Set<string>>(
    () => new Set(readMarks(SUBJUNCTIVE_MARKS_KEY))
  );
  const [optativeMarkedIds, setOptativeMarkedIds] = useState<Set<string>>(
    () => new Set(readMarks(OPTATIVE_MARKS_KEY))
  );
  const [participleMarkedIds, setParticipleMarkedIds] = useState<Set<string>>(
    () => new Set(readMarks(PARTICIPLE_MARKS_KEY))
  );
  const [commandRecipientGroups, setCommandRecipientGroups] = useState<CommandRecipientGroup[]>(
    readCommandRecipientGroups
  );
  const [statementLens, setStatementLens] = useState<StatementLens>("All finite verbs");
  const [recipientLens, setRecipientLens] = useState("All Commands");
  const [draftGroupTokenIds, setDraftGroupTokenIds] = useState<string[]>([]);
  const [draftRecipient, setDraftRecipient] = useState(RECIPIENTS[0]);
  const tokenById = useMemo(() => {
    const index = new Map<string, GreekToken>();
    for (const [, verses] of data.greek) {
      for (const verse of verses) {
        for (const token of verse.tokens) {
          index.set(token.id, token);
        }
      }
    }
    return index;
  }, [data.greek]);
  const [activeVerse, setActiveVerse] = useState<GreekVerse | null>(
    () => data.greek[0]?.[1][0] ?? null
  );

  // Ground truth, derived purely from the Greek morphology already loaded —
  // never shown directly, only used to silently confirm a brick once the
  // student's own marks exactly match it. See moodFromSourceMorph/brickConfirmed.
  const groundTruth = useMemo(() => {
    const finiteIds = new Set<string>();
    const byMood: Record<VerbMood, Set<string>> = {
      indicative: new Set(),
      subjunctive: new Set(),
      imperative: new Set(),
      optative: new Set()
    };
    const participleIds = new Set<string>();
    for (const [, verses] of data.greek) {
      for (const verse of verses) {
        for (const token of verse.tokens) {
          const mood = moodFromSourceMorph(token.sourceMorph);
          if (mood) {
            finiteIds.add(token.id);
            byMood[mood].add(token.id);
          } else if (isParticipleSourceMorph(token.sourceMorph)) {
            participleIds.add(token.id);
          }
        }
      }
    }
    return { finiteIds, byMood, participleIds };
  }, [data.greek]);

  const brick1Confirmed = brickConfirmed(finiteMarkedIds, groundTruth.finiteIds);
  const brick2Confirmed = brickConfirmed(commandMarkedIds, groundTruth.byMood.imperative);
  const brick2cConfirmed = brickConfirmed(statementMarkedIds, groundTruth.byMood.indicative);
  const brick3Confirmed = brickConfirmed(subjunctiveMarkedIds, groundTruth.byMood.subjunctive);
  const brick3cConfirmed = brickConfirmed(optativeMarkedIds, groundTruth.byMood.optative);
  const brick4Confirmed = brickConfirmed(participleMarkedIds, groundTruth.participleIds);

  // Mood is mutually exclusive — toggleToken below already prevents a NEW
  // conflict (assigning a mood clears the other three), but that guard only
  // runs on click. Saved progress from before that fix existed (or a hand-
  // edited import) could still carry a token in two mood buckets at once;
  // this surfaces that rather than letting it silently persist (see
  // titus-audit-corrections.md item 1).
  const moodConflictIds = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
    commandMarkedIds.forEach(bump);
    statementMarkedIds.forEach(bump);
    subjunctiveMarkedIds.forEach(bump);
    optativeMarkedIds.forEach(bump);
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
  }, [commandMarkedIds, optativeMarkedIds, statementMarkedIds, subjunctiveMarkedIds]);

  useEffect(() => {
    window.localStorage.setItem(MARKS_KEY, JSON.stringify(Array.from(finiteMarkedIds)));
  }, [finiteMarkedIds]);

  useEffect(() => {
    window.localStorage.setItem(COMMAND_MARKS_KEY, JSON.stringify(Array.from(commandMarkedIds)));
  }, [commandMarkedIds]);

  useEffect(() => {
    window.localStorage.setItem(STATEMENT_MARKS_KEY, JSON.stringify(Array.from(statementMarkedIds)));
  }, [statementMarkedIds]);

  useEffect(() => {
    window.localStorage.setItem(SUBJUNCTIVE_MARKS_KEY, JSON.stringify(Array.from(subjunctiveMarkedIds)));
  }, [subjunctiveMarkedIds]);

  useEffect(() => {
    window.localStorage.setItem(OPTATIVE_MARKS_KEY, JSON.stringify(Array.from(optativeMarkedIds)));
  }, [optativeMarkedIds]);

  useEffect(() => {
    window.localStorage.setItem(PARTICIPLE_MARKS_KEY, JSON.stringify(Array.from(participleMarkedIds)));
  }, [participleMarkedIds]);

  useEffect(() => {
    window.localStorage.setItem(COMMAND_RECIPIENTS_KEY, JSON.stringify(commandRecipientGroups));
  }, [commandRecipientGroups]);

  const spanishVerse = useMemo(() => {
    if (!activeVerse) return null;
    return data.spanish.find(
      verse => verse.chapter === activeVerse.chapter && verse.verse === activeVerse.verse
    );
  }, [activeVerse, data.spanish]);

  const activeMarkedIds =
    participation === "finite"
      ? finiteMarkedIds
      : participation === "mood-statements"
        ? statementMarkedIds
        : participation === "mood-subjunctive"
          ? subjunctiveMarkedIds
          : participation === "mood-optative"
            ? optativeMarkedIds
            : participation === "participles"
              ? participleMarkedIds
              : commandMarkedIds;
  const activeLabel =
    participation === "finite"
      ? "Finite verbs"
      : participation === "mood-commands"
        ? "Commands"
        : participation === "mood-statements"
          ? "Statements"
          : participation === "mood-subjunctive"
            ? "Subjunctive"
            : participation === "mood-optative"
              ? "Optative"
              : participation === "participles"
                ? "Participles"
                : "Command groups";

  const commandTokens = useMemo(() => {
    const ordered: GreekToken[] = [];
    for (const [, verses] of data.greek) {
      for (const verse of verses) {
        for (const token of verse.tokens) {
          if (commandMarkedIds.has(token.id)) ordered.push(token);
        }
      }
    }
    return ordered;
  }, [commandMarkedIds, data.greek]);

  const commandTokenIndex = useMemo(() => {
    const index = new Map<string, number>();
    commandTokens.forEach((token, position) => index.set(token.id, position));
    return index;
  }, [commandTokens]);

  const allAssignedCommandTokenIds = useMemo(() => {
    const assigned = new Set<string>();
    for (const group of commandRecipientGroups) {
      group.tokenIds.forEach(tokenId => assigned.add(tokenId));
    }
    return assigned;
  }, [commandRecipientGroups]);

  // No source-text ground truth for recipients (it's a judgment call, not a
  // fact to check against) — "confirmed" here just means every marked
  // command has been assigned to some recipient group.
  const brick2bConfirmed = brickConfirmed(allAssignedCommandTokenIds, commandMarkedIds);

  const displayedCommandTokens = useMemo(() => {
    if (recipientLens === "All Commands") return commandTokens;

    const visibleIds = new Set<string>();
    for (const group of commandRecipientGroups) {
      if (group.recipient !== recipientLens) continue;
      group.tokenIds.forEach(tokenId => visibleIds.add(tokenId));
    }
    return commandTokens.filter(token => visibleIds.has(token.id));
  }, [commandRecipientGroups, commandTokens, recipientLens]);

  const groupedTokenIds = useMemo(() => {
    const grouped = new Set<string>();
    for (const group of commandRecipientGroups) {
      if (recipientLens !== "All Commands" && group.recipient !== recipientLens) continue;
      group.tokenIds.forEach(tokenId => grouped.add(tokenId));
    }
    return grouped;
  }, [commandRecipientGroups, recipientLens]);

  const selectedTokens = useMemo(() => {
    return Array.from(activeMarkedIds)
      .map(id => tokenById.get(id))
      .filter((token): token is GreekToken => Boolean(token));
  }, [activeMarkedIds, tokenById]);

  const draftGroupTokens = useMemo(() => {
    return draftGroupTokenIds
      .map(id => tokenById.get(id))
      .filter((token): token is GreekToken => Boolean(token));
  }, [draftGroupTokenIds, tokenById]);

  const draftPersonNumberNotes = useMemo(() => {
    const notes = new Map<string, string>();
    for (const token of draftGroupTokens) {
      const meaning = personNumberMeaning(token.rmac);
      if (meaning) notes.set(token.rmac, meaning);
    }
    return Array.from(notes.entries()).map(([rmac, meaning]) => ({ rmac, meaning }));
  }, [draftGroupTokens]);

  // The isolated verb + its person/number ("2S means you singular") can't
  // say who "you" actually is — that needs the words around it. Pulls in
  // the whole verse, per token, from the new interlinear.txt chapter files.
  // The verse just before is included too (unhighlighted, read-only context)
  // since who's being addressed often carries over from what came before.
  const draftVerseContexts = useMemo(() => {
    interface VerseContext {
      key: string;
      reference: string;
      tokens: VerseInterlinearToken[];
      selectedIndexes: Set<number>;
      isPriorContext: boolean;
    }
    const contexts: VerseContext[] = [];
    const contextByKey = new Map<string, VerseContext>();

    for (const token of draftGroupTokens) {
      const key = `${token.chapter}:${token.verse}`;
      let context = contextByKey.get(key);
      if (!context) {
        if (token.verse > 1) {
          const priorKey = `${token.chapter}:${token.verse - 1}`;
          if (!contextByKey.has(priorKey)) {
            const priorTokens = getVerseInterlinear(token.chapter, token.verse - 1);
            if (priorTokens.length) {
              const priorContext: VerseContext = {
                key: priorKey,
                reference: `Tito ${token.chapter}:${token.verse - 1}`,
                tokens: priorTokens,
                selectedIndexes: new Set(),
                isPriorContext: true
              };
              contexts.push(priorContext);
              contextByKey.set(priorKey, priorContext);
            }
          }
        }
        context = {
          key,
          reference: `Tito ${token.chapter}:${token.verse}`,
          tokens: getVerseInterlinear(token.chapter, token.verse),
          selectedIndexes: new Set(),
          isPriorContext: false
        };
        contexts.push(context);
        contextByKey.set(key, context);
      }
      context.selectedIndexes.add(token.token - 1);
    }
    return contexts;
  }, [draftGroupTokens]);

  const focusCommandToken = useCallback((token: GreekToken) => {
    const verse = data.greek
      .flatMap(([, verses]) => verses)
      .find(candidate => candidate.chapter === token.chapter && candidate.verse === token.verse);
    if (verse) setActiveVerse(verse);

    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-token-id="${token.id}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      target?.focus({ preventScroll: true });
    }, 40);
  }, [data.greek]);

  useEffect(() => {
    if (participation !== "command-recipients" || !commandTokens.length) return;
    const firstUnassigned = commandTokens.find(token => !allAssignedCommandTokenIds.has(token.id));
    // No fallback to commandTokens[0]: once every command has a recipient,
    // there's nothing left to steer the student toward, so saving the last
    // assignment shouldn't yank them back to the first command in the book.
    if (firstUnassigned) focusCommandToken(firstUnassigned);
  }, [allAssignedCommandTokenIds, commandTokens, focusCommandToken, participation]);

  // The Recipient card lives in a long sidebar — starting a new draft group
  // opens it below the fold with nothing indicating it appeared at all.
  // Only fires on 0 -> non-zero, so building out a multi-token selection
  // doesn't keep yanking the scroll position around.
  const previousDraftLengthRef = useRef(0);
  useEffect(() => {
    if (draftGroupTokenIds.length > 0 && previousDraftLengthRef.current === 0) {
      // The whole page is one long, unpaginated document (the full Greek
      // text of Titus renders in one flow), so the card can be tens of
      // thousands of pixels down. Double-rAF waits for the browser to
      // actually finish laying out this render before measuring/scrolling —
      // a fixed setTimeout delay wasn't reliably long enough for that.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.querySelector(".recipient-card")?.scrollIntoView({ behavior: "auto", block: "start" });
        });
      });
    }
    previousDraftLengthRef.current = draftGroupTokenIds.length;
  }, [draftGroupTokenIds.length]);

  const toggleToken = useCallback((token: GreekToken, verse: GreekVerse) => {
    setActiveVerse(verse);
    const updateMarks = (current: Set<string>) => {
      const next = new Set(current);
      if (next.has(token.id)) {
        next.delete(token.id);
      } else {
        next.add(token.id);
      }
      return next;
    };
    const discardMark = (current: Set<string>) => {
      if (!current.has(token.id)) return current;
      const next = new Set(current);
      next.delete(token.id);
      return next;
    };

    if (participation === "finite") {
      setFiniteMarkedIds(updateMarks);
    } else if (participation === "participles") {
      // Independent of finite-verb marking — participles are a separate
      // grammatical category, not a mood of an already-marked finite verb.
      setParticipleMarkedIds(updateMarks);
    } else if (finiteMarkedIds.has(token.id)) {
      // A finite verb has exactly one mood — marking it here must clear any
      // mark left over from the other three mood bricks, or a verb could
      // silently sit in two moods at once with nothing in the UI showing it.
      if (participation === "mood-statements") {
        setStatementMarkedIds(updateMarks);
        setSubjunctiveMarkedIds(discardMark);
        setOptativeMarkedIds(discardMark);
        setCommandMarkedIds(discardMark);
      } else if (participation === "mood-subjunctive") {
        setSubjunctiveMarkedIds(updateMarks);
        setStatementMarkedIds(discardMark);
        setOptativeMarkedIds(discardMark);
        setCommandMarkedIds(discardMark);
      } else if (participation === "mood-optative") {
        setOptativeMarkedIds(updateMarks);
        setStatementMarkedIds(discardMark);
        setSubjunctiveMarkedIds(discardMark);
        setCommandMarkedIds(discardMark);
      } else {
        setCommandMarkedIds(updateMarks);
        setStatementMarkedIds(discardMark);
        setSubjunctiveMarkedIds(discardMark);
        setOptativeMarkedIds(discardMark);
      }
    }
  }, [finiteMarkedIds, participation]);

  const selectCommandGroupToken = useCallback((token: GreekToken, verse: GreekVerse) => {
    setActiveVerse(verse);
    if (!commandMarkedIds.has(token.id)) return;

    setDraftGroupTokenIds(current => {
      if (!current.length) return [token.id];
      const start = commandTokenIndex.get(current[0]);
      const end = commandTokenIndex.get(token.id);
      if (start === undefined || end === undefined) return [token.id];
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      return commandTokens.slice(low, high + 1).map(commandToken => commandToken.id);
    });
  }, [commandMarkedIds, commandTokenIndex, commandTokens]);

  const clearMarks = useCallback(() => {
    if (participation === "finite") {
      setFiniteMarkedIds(new Set());
    } else if (participation === "mood-commands") {
      setCommandMarkedIds(new Set());
    } else if (participation === "mood-statements") {
      setStatementMarkedIds(new Set());
      setStatementLens("All finite verbs");
    } else if (participation === "mood-subjunctive") {
      setSubjunctiveMarkedIds(new Set());
    } else if (participation === "mood-optative") {
      setOptativeMarkedIds(new Set());
    } else {
      if (draftGroupTokenIds.length) {
        setDraftGroupTokenIds([]);
      } else {
        setCommandRecipientGroups([]);
        setRecipientLens("All Commands");
      }
    }
  }, [draftGroupTokenIds.length, participation]);

  const saveCommandRecipientGroup = useCallback(() => {
    if (!draftGroupTokenIds.length) return;
    const selectedIds = new Set(draftGroupTokenIds);
    setCommandRecipientGroups(current => {
      const withoutSelected = current
        .map(group => ({
          ...group,
          tokenIds: group.tokenIds.filter(tokenId => !selectedIds.has(tokenId))
        }))
        .filter(group => group.tokenIds.length);

      return [
        ...withoutSelected,
        {
          id: makeLocalId("command-group"),
          recipient: draftRecipient,
          tokenIds: draftGroupTokenIds
        }
      ];
    });
    setDraftGroupTokenIds([]);
    setRecipientLens(draftRecipient);
    // Otherwise the radio stays on whatever was last picked, so the next
    // command silently opens pre-selected to that same recipient instead of
    // defaulting back to Titus — an easy way to mass-mislabel commands
    // without noticing.
    setDraftRecipient(RECIPIENTS[0]);
  }, [draftGroupTokenIds, draftRecipient]);

  const cancelCommandRecipientGroup = useCallback(() => {
    setDraftGroupTokenIds([]);
    setDraftRecipient(RECIPIENTS[0]);
  }, []);

  const getTokenMarkClassName = useCallback(
    (token: GreekToken) => {
      if (participation === "finite") {
        return finiteMarkedIds.has(token.id) ? "greek-token--finite-marked" : "";
      }

      if (participation === "command-recipients") {
        return [
          commandMarkedIds.has(token.id) ? "greek-token--command-marked" : "",
          groupedTokenIds.has(token.id) ? "greek-token--recipient-grouped" : "",
          draftGroupTokenIds.includes(token.id) ? "greek-token--recipient-draft" : ""
        ].filter(Boolean).join(" ");
      }

      if (participation === "mood-statements") {
        if (!finiteMarkedIds.has(token.id)) return "";
        if (statementLens === "Statements only") {
          return statementMarkedIds.has(token.id) ? "greek-token--statement-marked" : "";
        }
        if (statementLens === "Commands only") {
          return commandMarkedIds.has(token.id) ? "greek-token--command-marked" : "";
        }
        return [
          "greek-token--finite-candidate",
          commandMarkedIds.has(token.id) ? "greek-token--command-marked" : "",
          statementMarkedIds.has(token.id) ? "greek-token--statement-marked" : ""
        ].filter(Boolean).join(" ");
      }

      if (participation === "mood-subjunctive") {
        if (!finiteMarkedIds.has(token.id)) return "";
        return [
          "greek-token--finite-candidate",
          commandMarkedIds.has(token.id) ? "greek-token--command-marked" : "",
          statementMarkedIds.has(token.id) ? "greek-token--statement-marked" : "",
          subjunctiveMarkedIds.has(token.id) ? "greek-token--subjunctive-marked" : ""
        ].filter(Boolean).join(" ");
      }

      if (participation === "mood-optative") {
        if (!finiteMarkedIds.has(token.id)) return "";
        return [
          "greek-token--finite-candidate",
          commandMarkedIds.has(token.id) ? "greek-token--command-marked" : "",
          statementMarkedIds.has(token.id) ? "greek-token--statement-marked" : "",
          subjunctiveMarkedIds.has(token.id) ? "greek-token--subjunctive-marked" : "",
          optativeMarkedIds.has(token.id) ? "greek-token--optative-marked" : ""
        ].filter(Boolean).join(" ");
      }

      if (participation === "participles") {
        return participleMarkedIds.has(token.id) ? "greek-token--participle-marked" : "";
      }

      return [
        finiteMarkedIds.has(token.id) ? "greek-token--finite-candidate" : "",
        commandMarkedIds.has(token.id) ? "greek-token--command-marked" : ""
      ].filter(Boolean).join(" ");
    },
    [
      commandMarkedIds,
      draftGroupTokenIds,
      finiteMarkedIds,
      groupedTokenIds,
      optativeMarkedIds,
      participation,
      participleMarkedIds,
      statementLens,
      statementMarkedIds,
      subjunctiveMarkedIds
    ]
  );

  return (
    <main className="o-shell">
      <header className="o-header">
        <div>
          <p className="o-kicker">O Prototype 0.2</p>
          <h1>Greek Participation Environment</h1>
        </div>
      </header>

      {moodConflictIds.length ? (
        <section className="clause-unresolved-participles o-mood-conflict" aria-label="Mood conflict">
          <h3>
            Data problem — {moodConflictIds.length} verb{moodConflictIds.length === 1 ? "" : "s"} marked with two moods at once
          </h3>
          <p className="clause-section-note">
            Mood is mutually exclusive — a finite verb is one mood, never two. Re-mark{" "}
            {moodConflictIds.length === 1 ? "it" : "each one"} in whichever mood view is correct (checking the
            morphology tag), which will clear it from the other bucket. Reference id{moodConflictIds.length === 1 ? "" : "s"}:{" "}
            {moodConflictIds.map(id => tokenById.get(id)?.surface ?? id).join(", ")}
          </p>
        </section>
      ) : null}

      <section className="o-layout">
        <article
          className="greek-panel"
          aria-label="Greek text of Titus"
        >
          <div className="participation-switch" aria-label="Participation">
            <button
              type="button"
              className={`participation-option${
                participation === "finite" ? " participation-option--active" : ""
              }`}
              onClick={() => setParticipation("finite")}
              aria-pressed={participation === "finite"}
            >
              Brick 1 — Finite Verbs
              <BrickCheck confirmed={brick1Confirmed} />
            </button>
            <button
              type="button"
              className={`participation-option${
                participation === "mood-commands" ? " participation-option--active" : ""
              }`}
              onClick={() => setParticipation("mood-commands")}
              aria-pressed={participation === "mood-commands"}
            >
              Brick 2 — Commands
              <BrickCheck confirmed={brick2Confirmed} />
            </button>
            <button
              type="button"
              className={`participation-option${
                participation === "mood-statements" ? " participation-option--active" : ""
              }`}
              disabled={!finiteMarkedIds.size}
              onClick={() => setParticipation("mood-statements")}
              aria-pressed={participation === "mood-statements"}
            >
              Brick 2C — Statements
              <BrickCheck confirmed={brick2cConfirmed} />
            </button>
            <button
              type="button"
              className={`participation-option${
                participation === "command-recipients" ? " participation-option--active" : ""
              }`}
              disabled={!commandMarkedIds.size}
              onClick={() => setParticipation("command-recipients")}
              aria-pressed={participation === "command-recipients"}
            >
              Brick 2B — Recipients
              <BrickCheck confirmed={brick2bConfirmed} />
            </button>
            <button
              type="button"
              className={`participation-option${
                participation === "mood-subjunctive" ? " participation-option--active" : ""
              }`}
              disabled={!finiteMarkedIds.size}
              onClick={() => setParticipation("mood-subjunctive")}
              aria-pressed={participation === "mood-subjunctive"}
            >
              Brick 3 — Subjunctive
              <BrickCheck confirmed={brick3Confirmed} />
            </button>
            <button
              type="button"
              className={`participation-option${
                participation === "mood-optative" ? " participation-option--active" : ""
              }`}
              disabled={!finiteMarkedIds.size}
              onClick={() => setParticipation("mood-optative")}
              aria-pressed={participation === "mood-optative"}
            >
              Brick 3C — Optative
              <BrickCheck confirmed={brick3cConfirmed} />
            </button>
            <button
              type="button"
              className={`participation-option${
                participation === "participles" ? " participation-option--active" : ""
              }`}
              onClick={() => setParticipation("participles")}
              aria-pressed={participation === "participles"}
            >
              Brick 4 — Participles
              <BrickCheck confirmed={brick4Confirmed} />
            </button>
          </div>

          {data.greek.map(([chapter, verses]) => (
              <section className="greek-chapter" key={chapter} aria-labelledby={`o-chapter-${chapter}`}>
                <h2 id={`o-chapter-${chapter}`}>{chapter}</h2>
                {verses.map(verse => (
                  <section
                    className={`greek-verse${
                      activeVerse?.chapter === verse.chapter && activeVerse?.verse === verse.verse
                        ? " greek-verse--active"
                        : ""
                    }`}
                    key={verse.label}
                  >
                    <button
                      type="button"
                      className="verse-label"
                      onClick={() => setActiveVerse(verse)}
                      aria-label={`Show Spanish result for ${verse.label}`}
                    >
                      {verse.verse}
                    </button>
                    <div className="token-flow">
                      {(() => {
                        const interlinear = getVerseInterlinear(verse.chapter, verse.verse);
                        return verse.tokens.map(token => (
                          <GreekTokenButton
                            disabled={
                              (isFiniteMoodParticipation(participation) && !finiteMarkedIds.has(token.id)) ||
                              (participation === "command-recipients" && !commandMarkedIds.has(token.id))
                            }
                            key={token.id}
                            isPressed={activeMarkedIds.has(token.id)}
                            markClassName={getTokenMarkClassName(token)}
                            onToggle={participation === "command-recipients" ? selectCommandGroupToken : toggleToken}
                            token={token}
                            verse={verse}
                            strongs={interlinear[token.token - 1]?.strongs}
                            gloss={interlinear[token.token - 1]?.gloss}
                          />
                        ));
                      })()}
                    </div>
                  </section>
                ))}
              </section>
          ))}
        </article>

        <aside className="result-panel" aria-label="Participation result">
          {participation === "mood-commands" && (
            <section className="result-card participation-card">
              <p className="result-label">Current Participation</p>
              <h2>Brick 2 — Commands</h2>
              <p className="participation-note">Find every finite verb that is a command.</p>
              {commandMarkedIds.size > 0 && (
                <p className="terminology-note">Term: imperative mood</p>
              )}
            </section>
          )}

          {participation === "mood-statements" && (
            <section className="result-card participation-card">
              <p className="result-label">Current Participation</p>
              <h2>Brick 2C — Statements</h2>
              <p className="participation-note">Find the finite verbs that make statements.</p>
              {statementMarkedIds.size > 0 && (
                <>
                  <p className="terminology-note">These statement verbs are called Indicatives.</p>
                  <div className="lens-control" aria-label="Statement view">
                    {STATEMENT_LENSES.map(option => (
                      <button
                        type="button"
                        className={statementLens === option ? "lens-option lens-option--active" : "lens-option"}
                        key={option}
                        onClick={() => setStatementLens(option)}
                        aria-pressed={statementLens === option}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {participation === "command-recipients" && (
            <section className="result-card participation-card">
              <p className="result-label">Current Participation</p>
              <h2>Brick 2B — Who receives these commands?</h2>
              <div className="lens-control" aria-label="Command recipient view">
                {["All Commands", ...RECIPIENTS].map(option => (
                  <button
                    type="button"
                    className={recipientLens === option ? "lens-option lens-option--active" : "lens-option"}
                    key={option}
                    onClick={() => setRecipientLens(option)}
                    aria-pressed={recipientLens === option}
                  >
                    {option === "All Commands" ? option : `Commands to ${option}`}
                  </button>
                ))}
              </div>
              <div className="command-jump-list" aria-label="Command verbs">
                {displayedCommandTokens.length ? (
                  displayedCommandTokens.map(token => (
                    <button
                      type="button"
                      className={
                        allAssignedCommandTokenIds.has(token.id)
                          ? "command-jump command-jump--assigned"
                          : "command-jump"
                      }
                      key={token.id}
                      onClick={() => focusCommandToken(token)}
                    >
                      {stripCriticalMarks(token.surface)}
                    </button>
                  ))
                ) : (
                  <p className="result-placeholder">No commands assigned here yet.</p>
                )}
              </div>
            </section>
          )}

          {participation === "mood-subjunctive" && (
            <section className="result-card participation-card">
              <p className="result-label">Current Participation</p>
              <h2>Brick 3 — Subjunctive</h2>
              <p className="participation-note">Find the finite verbs that are subjunctive.</p>
              {subjunctiveMarkedIds.size > 0 && (
                <p className="terminology-note">Term: subjunctive mood</p>
              )}
            </section>
          )}

          {participation === "mood-optative" && (
            <section className="result-card participation-card">
              <p className="result-label">Current Participation</p>
              <h2>Brick 3C — Optative</h2>
              <p className="participation-note">Find the finite verbs that are optative.</p>
              {optativeMarkedIds.size > 0 && (
                <p className="terminology-note">Term: optative mood</p>
              )}
            </section>
          )}

          {participation === "participles" && (
            <section className="result-card participation-card">
              <p className="result-label">Current Participation</p>
              <h2>Brick 4 — Participles</h2>
              <p className="participation-note">Find every participle — a verb form with no person of its own, agreeing in case, number, and gender like an adjective instead.</p>
              {participleMarkedIds.size > 0 && (
                <p className="terminology-note">Sorting each one (attributive, substantival, circumstantial) happens later, in the Clause Workspace.</p>
              )}
            </section>
          )}

          {participation === "command-recipients" && draftGroupTokenIds.length > 0 && (
            <section className="result-card recipient-card">
              <p className="result-label">Recipient</p>
              <div className="draft-command-group" aria-label="Selected command group">
                {draftGroupTokens.map(token => (
                  <span className="marked-token" key={token.id}>
                    {stripCriticalMarks(token.surface)}
                  </span>
                ))}
              </div>
              {draftPersonNumberNotes.length > 0 && (
                <div className="person-number-reference" aria-label="Person and number">
                  <p className="result-label">Person / number</p>
                  {draftPersonNumberNotes.map(note => (
                    <p key={note.rmac}>
                      <span>{note.rmac}</span>
                      {note.meaning}
                    </p>
                  ))}
                </div>
              )}
              {draftVerseContexts.length > 0 && (
                <div className="recipient-verse-context" aria-label="Verse context">
                  <p className="result-label">Verse context</p>
                  {draftVerseContexts.map(context => (
                    <p
                      className={context.isPriorContext ? "interlinear-verse-line interlinear-verse-line--prior" : "interlinear-verse-line"}
                      key={context.key}
                    >
                      <span className="interlinear-verse-ref">{context.reference}</span>
                      {context.tokens.map((token, index) => (
                        <span
                          className={
                            context.selectedIndexes.has(index)
                              ? "interlinear-token interlinear-token--selected"
                              : "interlinear-token"
                          }
                          key={index}
                        >
                          <span className="interlinear-token-gloss">{token.gloss}</span>
                          <span className="interlinear-token-greek">{stripCriticalMarks(token.surface)}</span>
                        </span>
                      ))}
                    </p>
                  ))}
                </div>
              )}
              <fieldset className="recipient-options">
                {RECIPIENTS.map(recipient => (
                  <label key={recipient}>
                    <input
                      type="radio"
                      name="command-recipient"
                      value={recipient}
                      checked={draftRecipient === recipient}
                      onChange={() => setDraftRecipient(recipient)}
                    />
                    {recipient}
                  </label>
                ))}
              </fieldset>
              <div className="recipient-actions">
                <button type="button" onClick={cancelCommandRecipientGroup}>
                  Cancel
                </button>
                <button type="button" className="recipient-save" onClick={saveCommandRecipientGroup}>
                  Save
                </button>
              </div>
            </section>
          )}

          <section className="result-card">
            <p className="result-label">Current passage</p>
            <h2>{activeVerse?.label ?? "Tito"}</h2>
            <p className="spanish-result">
              {spanishVerse ? spanishVerse.text : "Select a Greek verse to see the Spanish result."}
            </p>
          </section>

          <section className="result-card">
            <div className="marked-heading">
              <div>
                <p className="result-label">Student markings</p>
                <h2>{activeLabel}</h2>
                <p className="result-count">
                  {participation === "command-recipients"
                    ? `${commandRecipientGroups.length} assigned`
                    : `${activeMarkedIds.size} marked`}
                </p>
              </div>
              <button
                type="button"
                onClick={clearMarks}
                disabled={
                  participation === "command-recipients"
                    ? !draftGroupTokenIds.length && !commandRecipientGroups.length
                    : !activeMarkedIds.size
                }
              >
                Clear
              </button>
            </div>
            <div className="marked-list">
              {participation === "finite" && selectedTokens.length ? (
                selectedTokens.map(token => (
                  <span className="marked-token" key={token.id}>
                    {tokenText(token)}
                  </span>
                ))
              ) : participation === "mood-commands" && selectedTokens.length ? (
                selectedTokens.map(token => (
                  <span className="marked-token" key={token.id}>
                    {tokenText(token)}
                  </span>
                ))
              ) : participation === "mood-statements" && selectedTokens.length ? (
                selectedTokens.map(token => (
                  <span className="marked-token statement-token" key={token.id}>
                    {tokenText(token)}
                  </span>
                ))
              ) : participation === "mood-subjunctive" && selectedTokens.length ? (
                selectedTokens.map(token => (
                  <span className="marked-token subjunctive-token" key={token.id}>
                    {tokenText(token)}
                  </span>
                ))
              ) : participation === "mood-optative" && selectedTokens.length ? (
                selectedTokens.map(token => (
                  <span className="marked-token optative-token" key={token.id}>
                    {tokenText(token)}
                  </span>
                ))
              ) : participation === "command-recipients" && commandRecipientGroups.length ? (
                commandRecipientGroups
                  .filter(group => recipientLens === "All Commands" || group.recipient === recipientLens)
                  .map(group => (
                    <span className="marked-token recipient-token" key={group.id}>
                      {group.recipient}: {group.tokenIds.length}
                    </span>
                  ))
              ) : (
                <p>
                  {participation === "finite"
                    ? "No finite verbs marked yet."
                    : participation === "mood-commands"
                      ? "No commands marked yet."
                    : participation === "mood-statements"
                      ? "No statements marked yet."
                      : participation === "mood-subjunctive"
                        ? "No subjunctives marked yet."
                      : participation === "mood-optative"
                        ? "No optatives marked yet."
                        : "No recipients assigned yet."}
                </p>
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
