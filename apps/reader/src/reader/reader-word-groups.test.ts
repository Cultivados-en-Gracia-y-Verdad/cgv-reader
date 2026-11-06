import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReaderVersePart } from "./reader-data.ts";
import { groupReaderHoverParts } from "./reader-word-groups.ts";

test("contiguous Spanish words sharing one Hebrew token become one hover unit", () => {
  const parts: ReaderVersePart[] = [
    { text: "me", wordIndex: 2, sourceTokenIds: ["h35001003002"] },
    { text: " " },
    { text: "haces", wordIndex: 3, sourceTokenIds: ["h35001003002"] },
    { text: " " },
    { text: "ver", wordIndex: 4, sourceTokenIds: ["h35001003003"] },
    { text: "." }
  ];

  const groups = groupReaderHoverParts(parts);

  assert.equal(groups[0].anchor?.text, "me haces");
  assert.deepEqual(groups[0].anchor?.sourceTokenIds, ["h35001003002"]);
  assert.equal(groups[0].parts.length, 3);
  assert.equal(groups[2].anchor?.text, "ver");
});

test("words with different source tokens stay as separate hover units", () => {
  const parts: ReaderVersePart[] = [
    { text: "por", wordIndex: 0, sourceTokenIds: ["h1"] },
    { text: " " },
    { text: "qué", wordIndex: 1, sourceTokenIds: ["h2"] }
  ];

  const groups = groupReaderHoverParts(parts);
  assert.equal(groups.filter(group => group.anchor).length, 2);
});
