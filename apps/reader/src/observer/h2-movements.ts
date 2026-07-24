import type { ClauseSpanInfo, SkeletonNode } from "./clause-tree";

export type UnitMood = "imperative" | "statement" | "unmarked";

export type H2TransitionKind = "actor" | "mood" | "recipient";

export type H2Transition = {
  kind: H2TransitionKind;
  /** Plain observation, e.g. `actor Dios → ustedes` or `mood declaraciones → mandatos`. */
  detail: string;
  /** Why this transition suggests a new H2 — observation only; never a development title. */
  reason: string;
};

export type H3UnitSignals = {
  finiteVerbId: string;
  reference: string;
  spanText: string;
  /** Majority Quién actúa across root + dependents; null if none observed. */
  dominantActor: string | null;
  mood: UnitMood;
  recipient: string | null;
  clauseIds: string[];
};

export type H2Movement = {
  units: H3UnitSignals[];
  /** Transition that opened this movement (null for the first). */
  openedBy: H2Transition | null;
};

export type H2MovementInput = {
  outline: ClauseSpanInfo[];
  skeletonRoots: SkeletonNode[];
  /** finiteVerbId → subject span text (already resolved). */
  subjectByClauseId: Map<string, string>;
  imperativeRootIds: Set<string>;
  statementRootIds: Set<string>;
  /** Brick 2B recipient label by root finiteVerbId. */
  recipientByRootId: Map<string, string>;
};

function collectSubtreeIds(node: SkeletonNode): string[] {
  return [node.finiteVerbId, ...node.children.flatMap(collectSubtreeIds)];
}

function majorityActor(clauseIds: string[], subjectByClauseId: Map<string, string>): string | null {
  const counts = new Map<string, { label: string; count: number }>();
  for (const id of clauseIds) {
    const subject = subjectByClauseId.get(id)?.trim();
    if (!subject) continue;
    const key = subject.toLowerCase();
    const row = counts.get(key) ?? { label: subject, count: 0 };
    row.count += 1;
    counts.set(key, row);
  }
  if (!counts.size) return null;
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  )[0]!.label;
}

function unitMood(finiteVerbId: string, imperativeRootIds: Set<string>, statementRootIds: Set<string>): UnitMood {
  if (imperativeRootIds.has(finiteVerbId)) return "imperative";
  if (statementRootIds.has(finiteVerbId)) return "statement";
  return "unmarked";
}

function moodLabel(mood: UnitMood): string {
  if (mood === "imperative") return "mandatos";
  if (mood === "statement") return "declaraciones";
  return "sin marca";
}

/**
 * First matching transition between consecutive H3 units, or null if none.
 * Order: actor → mood → recipient (strongest structural signals first).
 */
export function transitionBetween(prev: H3UnitSignals, next: H3UnitSignals): H2Transition | null {
  if (
    prev.dominantActor &&
    next.dominantActor &&
    prev.dominantActor.toLowerCase() !== next.dominantActor.toLowerCase()
  ) {
    return {
      kind: "actor",
      detail: `actor ${prev.dominantActor} → ${next.dominantActor}`,
      reason: `Quién actúa changed: the prior H3 unit was dominated by “${prev.dominantActor}”; this unit is dominated by “${next.dominantActor}”. That shift of attention ends one continuous development and is a candidate place to start a new H2.`
    };
  }

  if (
    (prev.mood === "statement" && next.mood === "imperative") ||
    (prev.mood === "imperative" && next.mood === "statement")
  ) {
    return {
      kind: "mood",
      detail: `mood ${moodLabel(prev.mood)} → ${moodLabel(next.mood)}`,
      reason: `Sentence type changed: ${moodLabel(prev.mood)} gave way to ${moodLabel(next.mood)} (${prev.reference} → ${next.reference}). A run of declarations turning into commands (or the reverse) ends one continuous development of H3s.`
    };
  }

  if (prev.recipient && next.recipient && prev.recipient !== next.recipient) {
    return {
      kind: "recipient",
      detail: `recipient ${prev.recipient} → ${next.recipient}`,
      reason: `Command recipient changed: imperatives addressed to “${prev.recipient}” are now addressed to “${next.recipient}”. Who is being spoken to is itself a section signal.`
    };
  }

  // Imperative run starts after non-imperative / different unmarked stretch.
  if (!prev.recipient && next.recipient) {
    return {
      kind: "recipient",
      detail: `recipient → ${next.recipient}`,
      reason: `An imperative addressed to “${next.recipient}” begins here after material without that recipient mark. The start of an addressed command run is a measurable break.`
    };
  }

  return null;
}

/** Build per-H3 unit signals (outline roots + skeleton dependents). */
export function buildH3UnitSignals(input: H2MovementInput): H3UnitSignals[] {
  const rootById = new Map(input.skeletonRoots.map(root => [root.finiteVerbId, root]));
  return input.outline.map(clause => {
    const rootNode = rootById.get(clause.finiteVerbId);
    const clauseIds = rootNode ? collectSubtreeIds(rootNode) : [clause.finiteVerbId];
    return {
      finiteVerbId: clause.finiteVerbId,
      reference: clause.reference,
      spanText: clause.spanText,
      dominantActor: majorityActor(clauseIds, input.subjectByClauseId),
      mood: unitMood(clause.finiteVerbId, input.imperativeRootIds, input.statementRootIds),
      recipient: input.recipientByRootId.get(clause.finiteVerbId) ?? null,
      clauseIds
    };
  });
}

/** Group consecutive H3 units into suggested H2 developments at each transition. */
export function deriveH2Movements(input: H2MovementInput): H2Movement[] {
  const units = buildH3UnitSignals(input);
  if (!units.length) return [];

  const movements: H2Movement[] = [{ units: [units[0]!], openedBy: null }];
  for (let i = 1; i < units.length; i += 1) {
    const prev = units[i - 1]!;
    const next = units[i]!;
    const transition = transitionBetween(prev, next);
    if (transition) {
      movements.push({ units: [next], openedBy: transition });
    } else {
      movements[movements.length - 1]!.units.push(next);
    }
  }
  return movements;
}

export function movementReferenceSpan(movement: H2Movement): string {
  const first = movement.units[0]?.reference ?? "";
  const last = movement.units[movement.units.length - 1]?.reference ?? "";
  if (!first) return "";
  if (!last || first === last) return first;
  // Prefer short "1:3–1:12" when both refs share a book prefix.
  const stripBook = (ref: string) => {
    const m = ref.match(/(\d+:\d+)\s*$/);
    return m ? m[1] : ref;
  };
  return `${stripBook(first)}–${stripBook(last)}`;
}
