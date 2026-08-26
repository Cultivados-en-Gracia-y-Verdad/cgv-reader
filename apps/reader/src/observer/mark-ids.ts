/**
 * Observer NT tokens use MorphGNT line ids (`270101-4`).
 * Jason / Compiler / progress JSON use alignment ids (`1:1:5`).
 * OT tokens already use alignment ids, so this remap is a no-op there.
 */

export function tokenAlignmentId(token: {
  chapter: number;
  verse: number;
  token: number;
}): string {
  return `${token.chapter}:${token.verse}:${token.token}`;
}

export function buildAlignmentToTokenIdMap(
  tokens: Iterable<{ id: string; chapter: number; verse: number; token: number }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const token of tokens) {
    map.set(tokenAlignmentId(token), token.id);
  }
  return map;
}

export function resolveObserverMarkId(
  id: string,
  tokenIds: { has(id: string): boolean },
  alignmentToTokenId: ReadonlyMap<string, string>
): string {
  // Alignment ids (`1:1:5`) must remap even when they also exist as
  // secondary lookup keys. Checking tokenIds first left Jason marks as
  // `ch:vs:tok` while ground truth is MorphGNT `270101-4`, so chips
  // selected and Brick ✓ never matched.
  const remapped = alignmentToTokenId.get(id);
  if (remapped) return remapped;
  if (tokenIds.has(id)) return id;
  return id;
}

export function normalizeObserverMarkIds(
  ids: Iterable<string>,
  tokenIds: { has(id: string): boolean },
  alignmentToTokenId: ReadonlyMap<string, string>
): Set<string> {
  const next = new Set<string>();
  for (const id of ids) {
    next.add(resolveObserverMarkId(id, tokenIds, alignmentToTokenId));
  }
  return next;
}
