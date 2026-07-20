import {
  getReaderBookInfo,
  readReaderBook,
  type ReaderBookId,
  type ReaderBookInfo
} from "@cgv/core";

/**
 * Active Observer / Compiler book. Shells sync this from the shared Reader
 * preference so Mark / Structure / Generate follow book changes without
 * threading bookId through every helper.
 */
let activeBookId: ReaderBookId = "tito";

try {
  activeBookId = readReaderBook();
} catch {
  /* SSR / non-browser */
}

const listeners = new Set<(bookId: ReaderBookId) => void>();

export function getWorkshopBookId(): ReaderBookId {
  return activeBookId;
}

export function getWorkshopBookInfo(): ReaderBookInfo {
  return getReaderBookInfo(activeBookId);
}

export function setWorkshopBookId(bookId: ReaderBookId): void {
  if (activeBookId === bookId) return;
  activeBookId = bookId;
  for (const listener of listeners) listener(bookId);
}

export function subscribeWorkshopBook(listener: (bookId: ReaderBookId) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
