import assert from "node:assert/strict";
import { test } from "node:test";
import { readerDisplayText, splitReaderEmphasis, takeTrailingPunctuation } from "./reader-emphasis.ts";

test("NBLA postfix markers become emphasized words without visible asterisks", () => {
  assert.deepEqual(splitReaderEmphasis("Jesús les dijo*: Ven y vio* la casa."), [
    { text: "Jesús les ", emphasized: false },
    { text: "dijo", emphasized: true },
    { text: ": Ven y ", emphasized: false },
    { text: "vio", emphasized: true },
    { text: " la casa.", emphasized: false }
  ]);
});

test("paired Markdown markers become emphasis without visible asterisks", () => {
  assert.deepEqual(splitReaderEmphasis("devastación y violencia *están* delante de mí"), [
    { text: "devastación y violencia ", emphasized: false },
    { text: "están", emphasized: true },
    { text: " delante de mí", emphasized: false }
  ]);
  assert.equal(
    readerDisplayText("devastación y violencia *están* delante de mí"),
    "devastación y violencia están delante de mí"
  );
});

test("unmarked text stays unchanged", () => {
  assert.deepEqual(splitReaderEmphasis("La gracia sea con ustedes."), [
    { text: "La gracia sea con ustedes.", emphasized: false }
  ]);
});

test("plain display text removes only postfix presentation markers", () => {
  assert.equal(readerDisplayText("podría* contener los libros"), "podría contener los libros");
});

test("trailing punctuation can stay attached to its preceding word", () => {
  assert.deepEqual(takeTrailingPunctuation(", ser no contenciosos"), {
    punctuation: ",",
    remainder: " ser no contenciosos"
  });
  assert.deepEqual(takeTrailingPunctuation("». Después"), {
    punctuation: "».",
    remainder: " Después"
  });
});
