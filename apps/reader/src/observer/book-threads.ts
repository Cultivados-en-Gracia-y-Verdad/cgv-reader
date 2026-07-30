/**
 * Book threads — propose ordered waypoints for a student-named movement thread
 * (see book-threads-spec.md). Software proposes; student names. Never auto-themes.
 */

export type ThreadWaypointSource = "writing-purpose" | "opens" | "definition" | "manual";

export type ThreadWaypointProposal = {
  /** Stable proposal id for Add (not the stored step id). */
  id: string;
  verseKey: string;
  reference: string;
  source: Exclude<ThreadWaypointSource, "manual">;
  /** Trajectory / snippet — evidence only, never a step title. */
  evidence: string;
  seed?: string;
};

export type WritingPurposeWaypointInput = {
  finiteVerbId: string;
  reference: string;
  spanText: string;
  trajectory: string;
};

export type OpensWaypointInput = {
  verseKey: string;
  reference: string;
};

export type DefinitionWaypointInput = {
  hitId: string;
  verseKey: string;
  seed: string;
  snippet: string;
};

export type ThreadStepRef = {
  verseKey: string;
  source: ThreadWaypointSource;
};

function verseSortKey(verseKey: string): [number, number] {
  const [c, v] = verseKey.split(":").map(Number);
  return [Number.isFinite(c) ? c : 0, Number.isFinite(v) ? v : 0];
}

/** Extract chapter:verse from "1 Juan 2:1" or "2:1" or finiteVerbId "2:1:3". */
export function verseKeyFromReference(reference: string, finiteVerbId?: string): string {
  const fromRef = reference.trim().match(/(\d+)\s*:\s*(\d+)\s*$/);
  if (fromRef) return `${fromRef[1]}:${fromRef[2]}`;
  if (finiteVerbId) {
    const parts = finiteVerbId.split(":");
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  }
  return "";
}

/**
 * Propose waypoints in verse order from writing purposes, opens, and definition hits.
 * Skips pairs already present on the thread (same verseKey + source).
 */
export function proposeThreadWaypoints(input: {
  writingPurposes?: WritingPurposeWaypointInput[];
  opens?: OpensWaypointInput[];
  definitionHits?: DefinitionWaypointInput[];
  alreadyOnThread?: ThreadStepRef[];
  maxWaypoints?: number;
}): ThreadWaypointProposal[] {
  const max = input.maxWaypoints ?? 40;
  const taken = new Set(
    (input.alreadyOnThread ?? []).map(s => `${s.source}:${s.verseKey}`)
  );

  const out: ThreadWaypointProposal[] = [];

  for (const wp of input.writingPurposes ?? []) {
    const verseKey = verseKeyFromReference(wp.reference, wp.finiteVerbId);
    if (!verseKey) continue;
    const key = `writing-purpose:${verseKey}`;
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({
      id: `wp:${wp.finiteVerbId}`,
      verseKey,
      reference: wp.reference,
      source: "writing-purpose",
      evidence: wp.trajectory || wp.spanText
    });
  }

  for (const open of input.opens ?? []) {
    const verseKey = open.verseKey.trim();
    if (!verseKey) continue;
    const key = `opens:${verseKey}`;
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({
      id: `opens:${verseKey}`,
      verseKey,
      reference: open.reference,
      source: "opens",
      evidence: "opens"
    });
  }

  for (const hit of input.definitionHits ?? []) {
    const verseKey = hit.verseKey.trim();
    if (!verseKey) continue;
    const key = `definition:${verseKey}`;
    if (taken.has(key)) continue;
    taken.add(key);
    const snippet = hit.snippet.trim();
    out.push({
      id: `def:${hit.hitId}`,
      verseKey,
      reference: verseKey,
      source: "definition",
      evidence: snippet ? `${hit.seed}: ${snippet}` : hit.seed,
      seed: hit.seed
    });
  }

  out.sort((a, b) => {
    const [ac, av] = verseSortKey(a.verseKey);
    const [bc, bv] = verseSortKey(b.verseKey);
    if (ac !== bc || av !== bv) return ac - bc || av - bv;
    const rank = { "writing-purpose": 0, opens: 1, definition: 2 } as const;
    return rank[a.source] - rank[b.source];
  });

  return out.slice(0, max);
}
