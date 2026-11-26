import assert from "node:assert/strict";
import test from "node:test";
import {
  isSpanishCopularForm,
  isStoredSpanConfirmation,
  readGreekPredicateVoice,
  suggestCopularRoles,
  suggestSpanishPredicateMode
} from "./grammar-suggestions.ts";

test("does not call an unsaved default verb suggestion confirmed", () => {
  const suggestion = ["11:20:16"];
  assert.equal(isStoredSpanConfirmation(undefined, suggestion), false);
  assert.equal(isStoredSpanConfirmation([], suggestion), false);
  assert.equal(isStoredSpanConfirmation(suggestion, suggestion), true);
});

test("suggests a Spanish copular predicate from the published LPF surface", () => {
  assert.deepEqual(suggestSpanishPredicateMode("seas arrogante"), {
    mode: "copular",
    evidence: "target-copular-surface",
    targetSurface: "seas arrogante",
    verbSurface: "seas"
  });
  assert.equal(isSpanishCopularForm("seas"), true);
  assert.equal(isSpanishCopularForm("será"), true);
  assert.equal(isSpanishCopularForm("está"), true);
  assert.equal(isSpanishCopularForm("esta"), false);
});

test("does not turn Greek active voice into a Spanish predicate-mode answer", () => {
  assert.equal(suggestSpanishPredicateMode("pienses con arrogancia"), null);
  assert.equal(readGreekPredicateVoice("V-2PAD-S--"), "active");
});

test("proposes confirmable target roles for the aligned copular phrase", () => {
  assert.deepEqual(
    suggestCopularRoles("seas arrogante", [
      { id: "11:20:15", text: "No" },
      { id: "11:20:16", text: "seas" },
      { id: "11:20:17", text: "arrogante" }
    ]),
    {
      verbWordIds: ["11:20:16"],
      predicateAttributeWordIds: ["11:20:17"],
      subjectImplicit: true
    }
  );
});

test("does not propose an implicit subject when an explicit pronoun is present", () => {
  assert.deepEqual(
    suggestCopularRoles("seas arrogante", [
      { id: "11:20:8", text: "tú" },
      { id: "11:20:9", text: "no" },
      { id: "11:20:10", text: "seas" },
      { id: "11:20:11", text: "arrogante" }
    ]),
    {
      verbWordIds: ["11:20:10"],
      predicateAttributeWordIds: ["11:20:11"],
      subjectImplicit: false
    }
  );
});

test("does not guess across ser/ir ambiguity or prepositional predicates", () => {
  for (const surface of ["fui a Roma", "fue a Jerusalén", "está en casa"]) {
    assert.equal(suggestSpanishPredicateMode(surface), null, surface);
    assert.equal(suggestCopularRoles(surface, []), null, surface);
  }
});

test("does not relabel passive or progressive-looking Spanish as copular", () => {
  for (const surface of ["es amado", "sea bendecido", "está andando"]) {
    assert.equal(suggestSpanishPredicateMode(surface), null, surface);
    assert.equal(suggestCopularRoles(surface, []), null, surface);
  }
});

test("accepts both published Greek finite tag forms as source evidence", () => {
  assert.equal(readGreekPredicateVoice("V-1PAI-S--"), "active");
  assert.equal(readGreekPredicateVoice("V-PAI-1S"), "active");
  assert.equal(readGreekPredicateVoice("V-2PAD-S--"), "active");
  assert.equal(readGreekPredicateVoice("V-PAM-2S"), "active");
  assert.equal(readGreekPredicateVoice("V-1PMI-S--"), "middle");
  assert.equal(readGreekPredicateVoice("V-PMI-1S"), "middle");
  assert.equal(readGreekPredicateVoice("V-3FPI-P--"), "passive");
  assert.equal(readGreekPredicateVoice("V-FPI-3P"), "passive");
});

test("rejects non-finite or unsupported Greek morphology as voice evidence", () => {
  assert.equal(readGreekPredicateVoice("V--PAN----"), null);
  assert.equal(readGreekPredicateVoice("N-----NSM-"), null);
  assert.equal(readGreekPredicateVoice(""), null);
});
