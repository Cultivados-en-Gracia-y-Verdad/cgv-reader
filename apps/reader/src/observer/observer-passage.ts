export interface ObserverVerseRef {
  chapter: number;
  verse: number;
}

export type ObserverPassage =
  | { kind: "book" }
  | { kind: "range"; start: ObserverVerseRef; end: ObserverVerseRef };

export const WHOLE_BOOK_PASSAGE: ObserverPassage = { kind: "book" };

export function compareObserverVerseRefs(a: ObserverVerseRef, b: ObserverVerseRef): number {
  return a.chapter - b.chapter || a.verse - b.verse;
}

export function observerPassageContains(
  passage: ObserverPassage,
  chapter: number,
  verse: number
): boolean {
  if (passage.kind === "book") return true;
  const candidate = { chapter, verse };
  return (
    compareObserverVerseRefs(candidate, passage.start) >= 0 &&
    compareObserverVerseRefs(candidate, passage.end) <= 0
  );
}

export function observerVerseRefKey(reference: ObserverVerseRef): string {
  return `${reference.chapter}:${reference.verse}`;
}

export function observerPassageKey(passage: ObserverPassage): string {
  return passage.kind === "book"
    ? "book"
    : `${observerVerseRefKey(passage.start)}-${observerVerseRefKey(passage.end)}`;
}

export function observerPassageLabel(passage: ObserverPassage): string {
  if (passage.kind === "book") return "";
  const start = observerVerseRefKey(passage.start);
  const end = observerVerseRefKey(passage.end);
  return start === end ? start : `${start}–${end}`;
}
