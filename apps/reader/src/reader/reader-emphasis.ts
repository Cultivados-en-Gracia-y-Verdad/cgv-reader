export interface ReaderTextSegment {
  text: string;
  emphasized: boolean;
}

// NBLA uses a postfix asterisk to identify a supplied word ("dijo*"). It is
// a presentation marker, not a literal character and not paired Markdown.
// Keep this conversion in Reader rendering so canonical dataset text remains
// unchanged and alignment continues to use the source string.
const SUPPLIED_WORD = /([\p{L}\p{M}]+(?:[’'\-][\p{L}\p{M}]+)*)\*/gu;

export function splitReaderEmphasis(text: string): ReaderTextSegment[] {
  const segments: ReaderTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SUPPLIED_WORD)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ text: text.slice(cursor, start), emphasized: false });
    segments.push({ text: match[1], emphasized: true });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), emphasized: false });
  return segments.length ? segments : [{ text, emphasized: false }];
}

export function readerDisplayText(text: string): string {
  return splitReaderEmphasis(text).map(segment => segment.text).join("");
}
