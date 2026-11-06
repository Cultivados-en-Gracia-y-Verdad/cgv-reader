import type { ReaderVersePart } from "./reader-data";

export interface ReaderHoverGroup {
  parts: ReaderVersePart[];
  anchor?: ReaderVersePart;
}

function sharesAlignment(left: ReaderVersePart, right: ReaderVersePart): boolean {
  const rightSourceIds = new Set(right.sourceTokenIds ?? []);
  if ((left.sourceTokenIds ?? []).some(id => rightSourceIds.has(id))) return true;

  const rightUnitIds = new Set(right.alignmentUnitIds ?? []);
  return (left.alignmentUnitIds ?? []).some(id => rightUnitIds.has(id));
}

function wordParts(parts: ReaderVersePart[]): ReaderVersePart[] {
  return parts.filter(part => part.wordIndex !== undefined);
}

function makeAnchor(parts: ReaderVersePart[]): ReaderVersePart | undefined {
  const words = wordParts(parts);
  const first = words[0];
  if (!first) return undefined;
  const last = words[words.length - 1];
  const sourceTokenIds = Array.from(new Set(words.flatMap(word => word.sourceTokenIds ?? []))).sort();
  const alignmentUnitIds = Array.from(new Set(words.flatMap(word => word.alignmentUnitIds ?? []))).sort();

  return {
    text: parts
      .map(part => `${part.text}${part.wordIndex !== undefined && part !== last ? part.trailingPunctuation ?? "" : ""}`)
      .join(""),
    wordIndex: first.wordIndex,
    sourceTokenIds,
    alignmentUnitIds,
    trailingPunctuation: last?.trailingPunctuation
  };
}

/** Group contiguous Spanish words that share a published source token. */
export function groupReaderHoverParts(parts: ReaderVersePart[]): ReaderHoverGroup[] {
  const groups: ReaderHoverGroup[] = [];

  for (let index = 0; index < parts.length; ) {
    const first = parts[index];
    if (first.wordIndex === undefined) {
      groups.push({ parts: [first] });
      index += 1;
      continue;
    }

    const grouped = [first];
    let lastWord = first;
    let cursor = index + 1;

    while (cursor < parts.length) {
      const between: ReaderVersePart[] = [];
      while (cursor < parts.length && parts[cursor].wordIndex === undefined) {
        between.push(parts[cursor]);
        cursor += 1;
      }
      const nextWord = parts[cursor];
      if (!nextWord || !sharesAlignment(lastWord, nextWord)) break;
      grouped.push(...between, nextWord);
      lastWord = nextWord;
      cursor += 1;
    }

    groups.push({ parts: grouped, anchor: makeAnchor(grouped) });
    index += grouped.length;
  }

  return groups;
}
