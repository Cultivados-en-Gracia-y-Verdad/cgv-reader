/**
 * Coordinate inheritance copies Q1–Q3 from the previous dependent.
 * It must not wipe fields the operator already set (Keep nested, frameType).
 */
export function mergeInheritedObservation<T extends object>(
  current: T | undefined,
  patch: Partial<T>
): T {
  return { ...(current ?? ({} as T)), ...patch };
}
