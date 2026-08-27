export type OutlineHoistStanding = "h4" | "dependent";

/**
 * Keep nested applies to incoming roots too. hoistOutlineH4s only lifts
 * children; it never demotes a root. Park these before hoist so a Q2
 * infinitive (or a cycle-broken child) is not emitted as ####.
 */
export function partitionRootsByOutlineStanding<T extends { finiteVerbId: string }>(
  roots: T[],
  standingOf: (id: string) => OutlineHoistStanding
): { units: T[]; nested: T[] } {
  const units: T[] = [];
  const nested: T[] = [];
  for (const root of roots) {
    if (standingOf(root.finiteVerbId) === "dependent") nested.push(root);
    else units.push(root);
  }
  return { units, nested };
}

/**
 * Lift outline-H4 dependents out of the grammatical tree so they become
 * sibling units. Incoming roots stay units unless partitionRootsByOutlineStanding
 * already parked them. Children that remain dependent travel with the unit
 * that still owns them.
 */
export function hoistOutlineH4s<T extends { finiteVerbId: string; children: T[] }>(
  roots: T[],
  standingOf: (id: string) => OutlineHoistStanding
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
