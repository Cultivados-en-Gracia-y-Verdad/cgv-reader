export interface ReaderTextSegment {
  text: string;
  emphasized: boolean;
}

// Reader sources use both paired Markdown emphasis (`*están*`) and NBLA's
// postfix supplied-word marker (`dijo*`). These are presentation markers, not
// literal characters. Keep the conversion in Reader rendering so canonical
// dataset text remains unchanged and alignment continues to use the source.
// A paired opener cannot immediately follow a letter; that distinction keeps
// two NBLA postfix markers (`dijo*: ... vio*`) from becoming one large span.
const READER_EMPHASIS =
  /(?<![\p{L}\p{M}])\*([^*\n]+?)\*|([\p{L}\p{M}]+(?:[’'\-][\p{L}\p{M}]+)*)\*/gu;

export function splitReaderEmphasis(text: string): ReaderTextSegment[] {
  const segments: ReaderTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(READER_EMPHASIS)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ text: text.slice(cursor, start), emphasized: false });
    segments.push({ text: match[1] ?? match[2], emphasized: true });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), emphasized: false });
  return segments.length ? segments : [{ text, emphasized: false }];
}

export function readerDisplayText(text: string): string {
  return splitReaderEmphasis(text).map(segment => segment.text).join("");
}

const TRAILING_PUNCTUATION = /^([,.;:!?…»”’\)\]\}]+)/u;

export function takeTrailingPunctuation(text: string): {
  punctuation: string;
  remainder: string;
} {
  const match = text.match(TRAILING_PUNCTUATION);
  const punctuation = match?.[1] ?? "";
  return { punctuation, remainder: text.slice(punctuation.length) };
}
