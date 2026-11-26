import assert from "node:assert/strict";
import test from "node:test";
import { suggestPredicateMode } from "./grammar-suggestions.ts";

test("suggests copular for eimi instead of merely copying active voice", () => {
  assert.deepEqual(suggestPredicateMode("εἰμί", "V-1PAI-S--"), {
    mode: "copular",
    evidence: "copular-lemma"
  });
});

test("suggests finite predicate mode from Greek voice without saving an answer", () => {
  assert.deepEqual(suggestPredicateMode("λέγω", "V-1PAI-S--"), {
    mode: "active",
    evidence: "greek-voice",
    greekVoice: "active"
  });
  assert.deepEqual(suggestPredicateMode("καυχάομαι", "V-1PMI-S--"), {
    mode: "middle-reflexive",
    evidence: "greek-voice",
    greekVoice: "middle"
  });
  assert.deepEqual(suggestPredicateMode("σῴζω", "V-3FPI-P--"), {
    mode: "passive",
    evidence: "greek-voice",
    greekVoice: "passive"
  });
});

test("accepts the Robinson tags used by the Reader interlinear", () => {
  assert.deepEqual(suggestPredicateMode("λέγω", "V-PAI-1S"), {
    mode: "active",
    evidence: "greek-voice",
    greekVoice: "active"
  });
  assert.deepEqual(suggestPredicateMode("καυχάομαι", "V-PMI-1S"), {
    mode: "middle-reflexive",
    evidence: "greek-voice",
    greekVoice: "middle"
  });
  assert.deepEqual(suggestPredicateMode("σῴζω", "V-FPI-3P"), {
    mode: "passive",
    evidence: "greek-voice",
    greekVoice: "passive"
  });
});

test("does not guess from non-finite or unsupported morphology", () => {
  assert.equal(suggestPredicateMode("λέγω", "V--PAN----"), null);
  assert.equal(suggestPredicateMode("λέγω", "N-----NSM-"), null);
  assert.equal(suggestPredicateMode("λέγω", ""), null);
});
