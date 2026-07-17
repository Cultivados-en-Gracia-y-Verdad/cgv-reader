import type { FrameType } from "./clause-signals";

export type ClauseRelation = "describes" | "content" | "frame" | "root";

export interface ClauseSpanInfo {
  finiteVerbId: string;
  reference: string;
  spanText: string;
  wordIds: string[];
  /** Sortable book-order position (e.g. chapter*100000 + verse*1000 + wordIndex). */
  order: number;
}

export interface ClauseObservationLike {
  describesNoun?: "yes" | "no" | "unsure";
  describedNounSpan?: string[];
  isWhatWasExpressed?: "yes" | "no" | "unsure";
  expressedParentClauseId?: string;
  tellsWhenOrIf?: "yes" | "no" | "unsure";
  whenIfParentClauseId?: string;
  frameType?: FrameType;
}

export interface ResolvedClause {
  finiteVerbId: string;
  relation: ClauseRelation | null;
  parentClauseId: string | null;
  /** true when Q1 was "yes" but the described noun doesn't fall inside any indexed clause, or is ambiguous. */
  parked: boolean;
  describedNounSpan?: string[];
  frameType?: FrameType;
  /** Set instead of a single owner when the described noun falls inside more than one clause's span — not a guess, a genuine tie the student needs to break. */
  ambiguousOwnerIds?: string[];
}

export interface SkeletonNode {
  finiteVerbId: string;
  reference: string;
  spanText: string;
  /** null means this node is a placeholder — referenced as a parent but not yet classified itself. */
  relation: ClauseRelation | null;
  frameType?: FrameType;
  children: SkeletonNode[];
}

export interface ParkedClause extends SkeletonNode {
  describedNounSpan: string[];
  ambiguousOwnerIds?: string[];
}

export interface TelosCandidate {
  /**
   * The first purpose clause in book order, plus any sibling purpose clauses
   * attached to that same root (e.g. a coordinated ἵνα...καί... pair like
   * 1:5:10/1:5:12) — a purpose statement can span more than one clause, and
   * showing only the first half misrepresents what the text actually says.
   */
  purposeClauses: ClauseSpanInfo[];
  lastOutlineClause: ClauseSpanInfo | null;
}

/**
 * Resolves one clause's relation per the spec's three questions, first-yes-wins.
 * Q1's noun lookup is the one place a clause's "parent" isn't a direct pick: if the
 * described noun doesn't fall inside any existing clause's word span, this clause is
 * parked rather than forced onto the nearest available row.
 */
export function resolveClause(
  clause: ClauseSpanInfo,
  observation: ClauseObservationLike | undefined,
  allClauses: ClauseSpanInfo[]
): ResolvedClause {
  if (!observation) {
    return { finiteVerbId: clause.finiteVerbId, relation: null, parentClauseId: null, parked: false };
  }

  if (observation.describesNoun === "yes") {
    const nounIds = observation.describedNounSpan ?? [];
    // A described noun landing inside more than one clause's span is a
    // genuine tie, not something to silently resolve by taking whichever
    // candidate happens to come first — see titus-audit-corrections.md
    // item 2. Parked with the candidate list attached, rather than guessing.
    const owners = nounIds.length
      ? allClauses.filter(
          candidate => candidate.finiteVerbId !== clause.finiteVerbId && nounIds.some(id => candidate.wordIds.includes(id))
        )
      : [];
    if (owners.length > 1) {
      return {
        finiteVerbId: clause.finiteVerbId,
        relation: "describes",
        parentClauseId: null,
        parked: true,
        describedNounSpan: nounIds,
        ambiguousOwnerIds: owners.map(owner => owner.finiteVerbId)
      };
    }
    const owner = owners[0];
    return {
      finiteVerbId: clause.finiteVerbId,
      relation: "describes",
      parentClauseId: owner ? owner.finiteVerbId : null,
      parked: !owner,
      describedNounSpan: nounIds
    };
  }

  if (observation.isWhatWasExpressed === "yes" && observation.expressedParentClauseId) {
    return {
      finiteVerbId: clause.finiteVerbId,
      relation: "content",
      parentClauseId: observation.expressedParentClauseId,
      parked: false
    };
  }

  if (observation.tellsWhenOrIf === "yes" && observation.whenIfParentClauseId) {
    return {
      finiteVerbId: clause.finiteVerbId,
      relation: "frame",
      parentClauseId: observation.whenIfParentClauseId,
      parked: false,
      frameType: observation.frameType
    };
  }

  if (observation.describesNoun === "no" && observation.isWhatWasExpressed === "no" && observation.tellsWhenOrIf === "no") {
    return { finiteVerbId: clause.finiteVerbId, relation: "root", parentClauseId: null, parked: false };
  }

  return { finiteVerbId: clause.finiteVerbId, relation: null, parentClauseId: null, parked: false };
}

function byOrder(a: ClauseSpanInfo, b: ClauseSpanInfo): number {
  return a.order - b.order;
}

/**
 * The "zeroth question," asked before Q1/Q2/Q3 — see
 * coordinate-inheritance-spec.md. A clause flagged by the caller as a bare
 * coordinate continuation (opens with plain καί/δέ/ἤ, no dependency marker
 * of its own) inherits its relation/parent/frameType wholesale from the
 * clause immediately before it in book order, but only when that preceding
 * clause is itself already resolved as dependent (describes/content/frame) —
 * a coordinator joining two independent roots is ordinary coordination, not
 * inheritance. Returns an observations map augmented with synthesized
 * entries for inheriting clauses; the original observations (and thus
 * anything the student has actually recorded) are left untouched for
 * everyone else. Walks in book order so a chain of several coordinated
 * clauses sharing one marker (καί...καί...καί) resolves transitively.
 */
export function applyCoordinateInheritance(
  clauses: ClauseSpanInfo[],
  observations: Record<string, ClauseObservationLike>,
  coordinateContinuationIds: Set<string>
): Record<string, ClauseObservationLike> {
  if (!coordinateContinuationIds.size) return observations;

  const sorted = [...clauses].sort(byOrder);
  const augmented: Record<string, ClauseObservationLike> = { ...observations };

  for (let index = 1; index < sorted.length; index += 1) {
    const clause = sorted[index];
    if (!coordinateContinuationIds.has(clause.finiteVerbId)) continue;

    const previous = sorted[index - 1];
    const previousResolved = resolveClause(previous, augmented[previous.finiteVerbId], clauses);
    if (previousResolved.parked || previousResolved.relation === "root" || !previousResolved.relation) continue;

    if (previousResolved.relation === "describes") {
      augmented[clause.finiteVerbId] = {
        describesNoun: "yes",
        describedNounSpan: previousResolved.describedNounSpan
      };
    } else if (previousResolved.relation === "content" && previousResolved.parentClauseId) {
      augmented[clause.finiteVerbId] = {
        isWhatWasExpressed: "yes",
        expressedParentClauseId: previousResolved.parentClauseId
      };
    } else if (previousResolved.relation === "frame" && previousResolved.parentClauseId) {
      augmented[clause.finiteVerbId] = {
        tellsWhenOrIf: "yes",
        whenIfParentClauseId: previousResolved.parentClauseId,
        frameType: previousResolved.frameType
      };
    }
  }

  return augmented;
}

/**
 * Skeleton = every resolved clause, nested under its parent at the right depth.
 * A clause that's a parent but hasn't been classified itself still gets a node
 * (as a placeholder) so its children always have a visible home — nothing a
 * student has already decided disappears while the rest is unfinished.
 */
export function deriveSkeleton(
  clauses: ClauseSpanInfo[],
  observations: Record<string, ClauseObservationLike>
): { roots: SkeletonNode[]; parked: ParkedClause[] } {
  const byId = new Map(clauses.map(clause => [clause.finiteVerbId, clause]));
  const resolvedById = new Map<string, ResolvedClause>();
  for (const clause of clauses) {
    const resolved = resolveClause(clause, observations[clause.finiteVerbId], clauses);
    if (resolved.relation) resolvedById.set(clause.finiteVerbId, resolved);
  }

  const childrenMap = new Map<string, string[]>();
  const topLevelIds = new Set<string>();

  for (const [id, resolved] of resolvedById) {
    if (resolved.relation === "root") {
      topLevelIds.add(id);
    } else if (resolved.parentClauseId) {
      const list = childrenMap.get(resolved.parentClauseId) ?? [];
      list.push(id);
      childrenMap.set(resolved.parentClauseId, list);
    }
    // Parked "describes" clauses (no owning clause found) are surfaced separately below.
  }

  for (const parentId of childrenMap.keys()) {
    if (!resolvedById.has(parentId) && byId.has(parentId)) topLevelIds.add(parentId);
  }

  // Two (or more) clauses can point at each other as parent — e.g. a "describes"
  // answer and a "frame" answer that each name the other as their owner. Neither
  // is ever a root and neither is "parked" (each found a valid-looking owner),
  // so without this pass the whole cycle — and anything hanging off it — would
  // never be reached from topLevelIds and would silently vanish from the output.
  const reached = new Set<string>();
  function markReached(id: string): void {
    if (reached.has(id)) return;
    reached.add(id);
    for (const childId of childrenMap.get(id) ?? []) markReached(childId);
  }
  for (const id of topLevelIds) markReached(id);
  // Parked clauses already expose their own children via the `parked` array
  // below (buildNode pulls from childrenMap regardless of parked status), so
  // anything hanging off a parked clause is already accounted for and must
  // not also be treated as "unreached" here.
  for (const [id, resolved] of resolvedById) {
    if (resolved.parked) markReached(id);
  }

  const unreachedSet = new Set(
    clauses
      .map(c => c.finiteVerbId)
      .filter(id => resolvedById.has(id) && !reached.has(id))
  );

  const groupVisited = new Set<string>();
  for (const start of unreachedSet) {
    if (groupVisited.has(start)) continue;
    const stack = [start];
    const component: string[] = [];
    while (stack.length) {
      const current = stack.pop();
      if (!current || groupVisited.has(current)) continue;
      groupVisited.add(current);
      component.push(current);
      const parentId = resolvedById.get(current)?.parentClauseId;
      if (parentId && unreachedSet.has(parentId) && !groupVisited.has(parentId)) stack.push(parentId);
      for (const childId of childrenMap.get(current) ?? []) {
        if (unreachedSet.has(childId) && !groupVisited.has(childId)) stack.push(childId);
      }
    }
    const rootOfComponent = component
      .map(id => byId.get(id))
      .filter((c): c is ClauseSpanInfo => Boolean(c))
      .sort(byOrder)[0];
    if (rootOfComponent) topLevelIds.add(rootOfComponent.finiteVerbId);
  }

  function buildNode(id: string, ancestors: Set<string>): SkeletonNode {
    const clause = byId.get(id);
    if (!clause) throw new Error(`Unknown clause id in skeleton: ${id}`);
    const resolved = resolvedById.get(id);
    const nextAncestors = new Set(ancestors).add(id);
    const kids = (childrenMap.get(id) ?? [])
      .filter(childId => !ancestors.has(childId)) // breaks cycles instead of recursing forever
      .map(childId => byId.get(childId))
      .filter((c): c is ClauseSpanInfo => Boolean(c))
      .sort(byOrder)
      .map(c => buildNode(c.finiteVerbId, nextAncestors));

    return {
      finiteVerbId: id,
      reference: clause.reference,
      spanText: clause.spanText,
      relation: resolved?.relation ?? null,
      frameType: resolved?.frameType,
      children: kids
    };
  }

  const roots = Array.from(topLevelIds)
    .map(id => byId.get(id))
    .filter((c): c is ClauseSpanInfo => Boolean(c))
    .sort(byOrder)
    .map(c => buildNode(c.finiteVerbId, new Set()));

  // A parked clause can still be someone else's parent (e.g. a content/frame
  // clause correctly pointing at it) — buildNode already pulls children from
  // childrenMap regardless of the node's own relation, so reusing it here
  // means those children stay visible instead of silently disappearing.
  const parked: ParkedClause[] = clauses
    .filter(clause => resolvedById.get(clause.finiteVerbId)?.parked)
    .map(clause => ({
      ...buildNode(clause.finiteVerbId, new Set()),
      describedNounSpan: resolvedById.get(clause.finiteVerbId)?.describedNounSpan ?? [],
      ambiguousOwnerIds: resolvedById.get(clause.finiteVerbId)?.ambiguousOwnerIds
    }));

  return { roots, parked };
}

/** Outline = root clauses only, book order — what's left if you strip everything indented out of the skeleton. */
export function deriveOutline(
  clauses: ClauseSpanInfo[],
  observations: Record<string, ClauseObservationLike>
): ClauseSpanInfo[] {
  return clauses
    .filter(clause => resolveClause(clause, observations[clause.finiteVerbId], clauses).relation === "root")
    .sort(byOrder);
}

/**
 * Telos = the first purpose clause, in book order, shown next to the outline's
 * last root clause. The software never declares a match — just places the two
 * next to each other and leaves the judgment to the student.
 *
 * "Purpose clause" here means one attached directly to a root (independent)
 * clause — the book's actual stated aim. A purpose clause nested under a
 * description clause, or under another purpose clause, is a sub-purpose of
 * some dependent thought, not a telos candidate, even though it still carries
 * frameType "purpose".
 *
 * A purpose statement can be split across coordinated clauses sharing one
 * ἵνα (e.g. 1:5:10 "corrigieses lo que falta" and 1:5:12 "pusieses ancianos",
 * the second riding on the first via coordinate inheritance) — both are
 * equally part of what the root clause states its purpose to be, so every
 * purpose clause attached to the SAME root as the first one found belongs in
 * the candidate, not just whichever happens to come first in book order.
 */
export function deriveTelos(
  clauses: ClauseSpanInfo[],
  observations: Record<string, ClauseObservationLike>
): TelosCandidate | null {
  const byId = new Map(clauses.map(clause => [clause.finiteVerbId, clause]));

  const purposeEntries = clauses
    .map(clause => ({ clause, resolved: resolveClause(clause, observations[clause.finiteVerbId], clauses) }))
    .filter(({ resolved }) => {
      if (resolved.relation !== "frame" || resolved.frameType !== "purpose") return false;
      const parentClause = resolved.parentClauseId ? byId.get(resolved.parentClauseId) : undefined;
      if (!parentClause) return false;
      const parentResolved = resolveClause(parentClause, observations[parentClause.finiteVerbId], clauses);
      return parentResolved.relation === "root";
    })
    .sort((a, b) => byOrder(a.clause, b.clause));

  if (!purposeEntries.length) return null;

  const anchorParentId = purposeEntries[0].resolved.parentClauseId;
  const purposeClauses = purposeEntries
    .filter(entry => entry.resolved.parentClauseId === anchorParentId)
    .map(entry => entry.clause);

  const outline = deriveOutline(clauses, observations);
  return {
    purposeClauses,
    lastOutlineClause: outline.length ? outline[outline.length - 1] : null
  };
}

/**
 * Walks a clause's resolved parentClauseId chain up to its root ancestor —
 * used by the participle Flow view to tally circumstantial participles
 * against the root clause whose stretch of text they fall within, even when
 * the participle rides on a clause several levels deep in the skeleton.
 * Cycle-safe (mirrors deriveSkeleton's own guard against clauses that name
 * each other as parent) and returns null rather than guessing when a clause
 * is unknown, unclassified, or parked (no resolvable parent).
 */
export function findRootAncestor(
  startClauseId: string,
  clauses: ClauseSpanInfo[],
  observations: Record<string, ClauseObservationLike>
): string | null {
  const byId = new Map(clauses.map(clause => [clause.finiteVerbId, clause]));
  const visited = new Set<string>();
  let currentId: string | null = startClauseId;

  while (currentId) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);

    const clause = byId.get(currentId);
    if (!clause) return null;
    const resolved = resolveClause(clause, observations[currentId], clauses);
    if (resolved.relation === "root") return currentId;
    if (resolved.parked || !resolved.parentClauseId) return null;
    currentId = resolved.parentClauseId;
  }

  return null;
}
