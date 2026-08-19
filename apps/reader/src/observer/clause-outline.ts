import { findLeadingMarkerToken, type LeadingMarker } from "./clause-signals";
import type { ClauseRelation } from "./clause-tree";

type BeginningTokens = Parameters<typeof findLeadingMarkerToken>[0];

/**
 * Outline standing is not Q1–Q3.
 *
 * Q2 still means “this is what was said.” That answer stays honest in Greek
 * and Hebrew. H4 is a second question: does this clause stand in the manual
 * trunk? Compiler Generate and Observer Outline must use this file — one
 * function, both paths, no testament switch.
 */

export type OutlineStanding = "h4" | "dependent";
export type OutlineStandingOverride = "h4" | "dependent";
export type OutlineStandingSource = "override" | "root" | "command" | "quoted-main" | "grammar";

export interface OutlineStandingInput {
  relation: ClauseRelation | null;
  parked?: boolean;
  isCommand: boolean;
  leadingKind: LeadingMarker["kind"];
  override?: OutlineStandingOverride;
}

export interface OutlineStandingResult {
  standing: OutlineStanding;
  source: OutlineStandingSource;
}

export function leadingKindOf(
  beginningTokens: BeginningTokens,
  finiteVerbId?: string
): LeadingMarker["kind"] {
  return findLeadingMarkerToken(beginningTokens, finiteVerbId).kind;
}

/**
 * Command force → H4 even when Q2 is yes.
 * Q2 child with no complementizer / relative / frame in the leading window
 * (quoted main clause: asyndeton, *y* / καί) → H4.
 * ὅτι / כִּי-content and Q3 frames stay nested unless the human overrides.
 */
export function resolveOutlineStanding(input: OutlineStandingInput): OutlineStandingResult {
  if (input.override === "h4") return { standing: "h4", source: "override" };
  if (input.override === "dependent") return { standing: "dependent", source: "override" };
  if (input.parked) return { standing: "dependent", source: "grammar" };
  if (input.relation === "root") return { standing: "h4", source: "root" };
  if (input.relation === "content" && input.isCommand) {
    return { standing: "h4", source: "command" };
  }
  if (
    input.relation === "content" &&
    input.leadingKind !== "content" &&
    input.leadingKind !== "relative" &&
    input.leadingKind !== "frame"
  ) {
    return { standing: "h4", source: "quoted-main" };
  }
  return { standing: "dependent", source: "grammar" };
}

export function outlineStandingReason(source: OutlineStandingSource): string {
  switch (source) {
    case "override":
      return "You set outline standing. Grammar (Q1–Q3) is unchanged.";
    case "root":
      return "Q1–Q3 all no — grammatical independent, so it is an H4.";
    case "command":
      return "Command force. Still the content of a saying verb; it stands as H4 anyway.";
    case "quoted-main":
      return "Quoted main clause (no complementizer in the leading window). Still what was said; it stands as H4.";
    case "grammar":
      return "Stays nested: relative, complement (that / ὅτι / כִּי), or time/reason/condition/purpose/result.";
  }
}

export interface OutlineStandingContext {
  commandIds: ReadonlySet<string>;
  beginningTokensById: ReadonlyMap<string, BeginningTokens>;
}

export function standingForClause(
  finiteVerbId: string,
  relation: ClauseRelation | null,
  parked: boolean | undefined,
  override: OutlineStandingOverride | undefined,
  context: OutlineStandingContext
): OutlineStandingResult {
  const beginningTokens = context.beginningTokensById.get(finiteVerbId) ?? [];
  return resolveOutlineStanding({
    relation,
    parked,
    isCommand: context.commandIds.has(finiteVerbId),
    leadingKind: leadingKindOf(beginningTokens, finiteVerbId),
    override
  });
}

/**
 * Lift outline-H4 dependents out of the grammatical tree so they become
 * sibling units. Incoming roots stay units. Children that remain dependent
 * travel with the unit that still owns them.
 */
export function hoistOutlineH4s<T extends { finiteVerbId: string; children: T[] }>(
  roots: T[],
  standingOf: (id: string) => OutlineStanding
): T[] {
  const lifted: T[] = [];

  function hoistChildren(node: T): T {
    const keep: T[] = [];
    for (const child of node.children) {
      const processed = hoistChildren(child);
      if (standingOf(processed.finiteVerbId) === "h4") {
        lifted.push(processed);
      } else {
        keep.push(processed);
      }
    }
    return { ...node, children: keep };
  }

  const keptRoots = roots.map(hoistChildren);
  return [...keptRoots, ...lifted];
}
