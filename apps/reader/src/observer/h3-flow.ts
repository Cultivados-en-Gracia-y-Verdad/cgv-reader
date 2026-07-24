import {
  buildH3UnitSignals,
  transitionBetween,
  type H2Transition,
  type H3UnitSignals,
  type H2MovementInput
} from "./h2-movements";

export type H3FlowState = {
  /** Split after these root finiteVerbIds (next H3 starts a new development). */
  breaksAfter: string[];
  /** Suggestion after these H3s is hidden. */
  ignoredSuggestions: string[];
  /** Optional human name keyed by the first H3 id of a development. */
  labels: Record<string, string>;
};

export type H3FlowSuggestion = {
  afterH3Id: string;
  transition: H2Transition;
};

export type H3FlowDevelopment = {
  h3Ids: string[];
  units: H3UnitSignals[];
  label: string | null;
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

/** Drop breaks / ignores / labels that no longer match the current outline. */
export function reconcileH3FlowState(state: H3FlowState, h3Ids: string[]): H3FlowState {
  const idSet = new Set(h3Ids);
  const breaksAfter = state.breaksAfter.filter(id => idSet.has(id) && h3Ids[h3Ids.length - 1] !== id);
  const ignoredSuggestions = state.ignoredSuggestions.filter(id => idSet.has(id));
  const labels: Record<string, string> = {};
  for (const [key, label] of Object.entries(state.labels)) {
    if (idSet.has(key)) labels[key] = label;
  }
  return { breaksAfter, ignoredSuggestions, labels };
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

export function buildH3FlowDevelopments(
  input: H2MovementInput,
  state: H3FlowState
): H3FlowDevelopment[] {
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

/** Open suggestions between consecutive H3s (not yet accepted or ignored). */
export function buildH3FlowSuggestions(
  input: H2MovementInput,
  state: H3FlowState
): H3FlowSuggestion[] {
  const units = buildH3UnitSignals(input);
  const h3Ids = units.map(unit => unit.finiteVerbId);
  const reconciled = reconcileH3FlowState(state, h3Ids);
  const breakSet = new Set(reconciled.breaksAfter);
  const ignored = new Set(reconciled.ignoredSuggestions);
  const out: H3FlowSuggestion[] = [];
  for (let i = 0; i < units.length - 1; i += 1) {
    const prev = units[i]!;
    const next = units[i + 1]!;
    if (breakSet.has(prev.finiteVerbId) || ignored.has(prev.finiteVerbId)) continue;
    const transition = transitionBetween(prev, next);
    if (!transition) continue;
    out.push({ afterH3Id: prev.finiteVerbId, transition });
  }
  return out;
}

export function acceptH3FlowBreak(state: H3FlowState, afterH3Id: string): H3FlowState {
  const breaksAfter = state.breaksAfter.includes(afterH3Id)
    ? state.breaksAfter
    : [...state.breaksAfter, afterH3Id];
  const ignoredSuggestions = state.ignoredSuggestions.filter(id => id !== afterH3Id);
  return { ...state, breaksAfter, ignoredSuggestions };
}

export function ignoreH3FlowSuggestion(state: H3FlowState, afterH3Id: string): H3FlowState {
  const ignoredSuggestions = state.ignoredSuggestions.includes(afterH3Id)
    ? state.ignoredSuggestions
    : [...state.ignoredSuggestions, afterH3Id];
  return { ...state, ignoredSuggestions };
}

export function clearH3FlowBreak(state: H3FlowState, afterH3Id: string): H3FlowState {
  return {
    ...state,
    breaksAfter: state.breaksAfter.filter(id => id !== afterH3Id)
  };
}
