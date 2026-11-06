import assert from "node:assert/strict";
import { test } from "node:test";
import { readerDisplayText, splitReaderEmphasis } from "./reader-emphasis.ts";

test("NBLA postfix markers become emphasized words without visible asterisks", () => {
  assert.deepEqual(splitReaderEmphasis("Jesús les dijo*: Ven y vio* la casa."), [
    { text: "Jesús les ", emphasized: false },
    { text: "dijo", emphasized: true },
    { text: ": Ven y ", emphasized: false },
    { text: "vio", emphasized: true },
    { text: " la casa.", emphasized: false }
  ]);
});

test("unmarked text stays unchanged", () => {
  assert.deepEqual(splitReaderEmphasis("La gracia sea con ustedes."), [
    { text: "La gracia sea con ustedes.", emphasized: false }
  ]);
});

test("plain display text removes only postfix presentation markers", () => {
  assert.equal(readerDisplayText("podría* contener los libros"), "podría contener los libros");
});
