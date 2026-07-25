import {
  buildH3UnitSignals,
  type H3UnitSignals,
  type H2MovementInput
} from "./h2-movements";

export type H3FlowState = {
  /**
   * User-placed H2 starts: after these root finiteVerbIds, the next H3 begins
   * a new continuous movement. The student decides; the app never proposes Accept/Ignore.
   */
  breaksAfter: string[];
  /**
   * Legacy field from Accept/Ignore UI. Kept for storage sanitize only; unused.
   * @deprecated
   */
  ignoredSuggestions: string[];
  /** Optional human name keyed by the first H3 id of an H2. */
  labels: Record<string, string>;
};

export type H3FlowMovement = {
  h3Ids: string[];
  units: H3UnitSignals[];
  label: string | null;
};

/** Short observation labels that may support a user-placed H2 start (never decide it). */
export type H3FlowSupport = {
  afterH3Id: string;
  observations: string[];
};

export const EMPTY_H3_FLOW_STATE: H3FlowState = {
  breaksAfter: [],
  ignoredSuggestions: [],
  labels: {}
};

export function sanitizeH3FlowState(value: unknown): H3FlowState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_H3_FLOW_STATE };
  const row = value as Record<string, unknown>;
  const breaksAfter = Array.isArray(row.breaksAfter)
    ? row.breaksAfter.filter((id): id is string => typeof id === "string")
    : [];
  const ignoredSuggestions = Array.isArray(row.ignoredSuggestions)
    ? row.ignoredSuggestions.filter((id): id is string => typeof id === "string")
    : [];
  const labels: Record<string, string> = {};
  if (row.labels && typeof row.labels === "object" && !Array.isArray(row.labels)) {
    for (const [key, label] of Object.entries(row.labels as Record<string, unknown>)) {
      if (typeof label === "string" && label.trim()) labels[key] = label.trim();
    }
  }
  return { breaksAfter, ignoredSuggestions, labels };
}

/** Drop breaks / labels that no longer match the current outline. */
export function reconcileH3FlowState(state: H3FlowState, h3Ids: string[]): H3FlowState {
  const idSet = new Set(h3Ids);
  const breaksAfter = state.breaksAfter.filter(id => idSet.has(id) && h3Ids[h3Ids.length - 1] !== id);
  const labels: Record<string, string> = {};
  for (const [key, label] of Object.entries(state.labels)) {
    if (idSet.has(key)) labels[key] = label;
  }
  // Drop legacy ignores; they are not part of the user-led model.
  return { breaksAfter, ignoredSuggestions: [], labels };
}

export function partitionH3Ids(h3Ids: string[], breaksAfter: Iterable<string>): string[][] {
  const breakSet = new Set(breaksAfter);
  if (!h3Ids.length) return [];
  const runs: string[][] = [];
  let current: string[] = [];
  for (const id of h3Ids) {
    current.push(id);
    if (breakSet.has(id)) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

export function buildH3FlowMovements(
  input: H2MovementInput,
  state: H3FlowState
): H3FlowMovement[] {
  const units = buildH3UnitSignals(input);
  const h3Ids = units.map(unit => unit.finiteVerbId);
  const reconciled = reconcileH3FlowState(state, h3Ids);
  const unitById = new Map(units.map(unit => [unit.finiteVerbId, unit]));
  return partitionH3Ids(h3Ids, reconciled.breaksAfter).map(runIds => {
    const first = runIds[0] ?? "";
    return {
      h3Ids: runIds,
      units: runIds.map(id => unitById.get(id)!).filter(Boolean),
      label: first ? reconciled.labels[first] ?? null : null
    };
  });
}

/** @deprecated Use buildH3FlowMovements */
export const buildH3FlowDevelopments = buildH3FlowMovements;

/**
 * Observations that support a boundary *after* `prev` (before `next`).
 * All measurable signals that apply — assistant evidence, not a prompt to decide.
 */
export function supportingObservationsBetween(
  prev: H3UnitSignals,
  next: H3UnitSignals
): string[] {
  const out: string[] = [];
  if (
    prev.dominantActor &&
    next.dominantActor &&
    prev.dominantActor.toLowerCase() !== next.dominantActor.toLowerCase()
  ) {
    out.push(`New dominant actor (${prev.dominantActor} → ${next.dominantActor})`);
  }
  if (
    (prev.mood === "statement" && next.mood === "imperative") ||
    (prev.mood === "imperative" && next.mood === "statement")
  ) {
    if (prev.mood === "statement" && next.mood === "imperative") {
      out.push("First imperative after statements");
    } else {
      out.push("Mood shifts from commands to statements");
    }
  }
  if (prev.recipient && next.recipient && prev.recipient !== next.recipient) {
    out.push(`New recipient (${prev.recipient} → ${next.recipient})`);
  } else if (!prev.recipient && next.recipient) {
    out.push(`Recipient begins (${next.recipient})`);
  }
  return out;
}

/** Supporting observations for each user-placed H2 start. */
export function buildH3FlowSupports(
  input: H2MovementInput,
  state: H3FlowState
): H3FlowSupport[] {
  const units = buildH3UnitSignals(input);
  const h3Ids = units.map(unit => unit.finiteVerbId);
  const reconciled = reconcileH3FlowState(state, h3Ids);
  const breakSet = new Set(reconciled.breaksAfter);
  const out: H3FlowSupport[] = [];
  for (let i = 0; i < units.length - 1; i += 1) {
    const prev = units[i]!;
    const next = units[i + 1]!;
    if (!breakSet.has(prev.finiteVerbId)) continue;
    out.push({
      afterH3Id: prev.finiteVerbId,
      observations: supportingObservationsBetween(prev, next)
    });
  }
  return out;
}

/** Place an H2 start so the next H3 begins a new movement. */
export function startH2After(state: H3FlowState, afterH3Id: string): H3FlowState {
  const breaksAfter = state.breaksAfter.includes(afterH3Id)
    ? state.breaksAfter
    : [...state.breaksAfter, afterH3Id];
  return { ...state, breaksAfter, ignoredSuggestions: [] };
}

/** Remove a user-placed H2 start. */
export function clearH2Start(state: H3FlowState, afterH3Id: string): H3FlowState {
  return {
    ...state,
    breaksAfter: state.breaksAfter.filter(id => id !== afterH3Id),
    ignoredSuggestions: []
  };
}

/** @deprecated Use startH2After */
export const acceptH3FlowBreak = startH2After;

/** @deprecated No-op in user-led model */
export function ignoreH3FlowSuggestion(state: H3FlowState, _afterH3Id: string): H3FlowState {
  return state;
}

/** @deprecated Use clearH2Start */
export const clearH3FlowBreak = clearH2Start;
