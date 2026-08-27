import assert from "node:assert/strict";
import { test } from "node:test";
import {
  prefixRepeatsFiniteSurface,
  prefixWordIsFiniteHost,
  prefixWordIsParticipleScaffold,
  shouldPeelLeadingScaffolding
} from "./claim-peel.ts";

test("peel real leading participle scaffolding (ἐραυνῶντες…)", () => {
  assert.equal(
    shouldPeelLeadingScaffolding({
      isNominalHead: false,
      prefixWordCount: 4,
      claimWordCount: 6,
      prefixHasParticipleScaffold: true,
      prefixContainsFinite: false
    }),
    true
  );
});

test("do not peel Brick 1B / nominal heads (*bestia*, *ella*)", () => {
  assert.equal(
    shouldPeelLeadingScaffolding({
      isNominalHead: true,
      prefixWordCount: 5,
      claimWordCount: 1,
      prefixHasParticipleScaffold: true,
      prefixContainsFinite: false
    }),
    false
  );
});

test("do not peel when the prefix already holds a finite (*Cayó*, cayó)", () => {
  assert.equal(
    shouldPeelLeadingScaffolding({
      isNominalHead: false,
      prefixWordCount: 1,
      claimWordCount: 5,
      prefixHasParticipleScaffold: true,
      prefixContainsFinite: true
    }),
    false
  );
});

test("do not peel leftover 1–2 word stubs (*son*, *distancia*)", () => {
  assert.equal(
    shouldPeelLeadingScaffolding({
      isNominalHead: false,
      prefixWordCount: 8,
      claimWordCount: 1,
      prefixHasParticipleScaffold: true,
      prefixContainsFinite: false
    }),
    false
  );
});

test("a prefix word with finite morph is a finite host, not scaffolding", () => {
  assert.equal(
    prefixWordIsFiniteHost({
      greekMorph: "V-2AAI-3S",
      finiteVerbId: "14:8:7",
      currentFiniteVerbId: "14:8:7"
    }),
    true
  );
  assert.equal(
    prefixWordIsParticipleScaffold({
      markedAsParticiple: false,
      greekMorph: "V-PAPNSM",
      wordHasOwnFinite: true
    }),
    false
  );
});

test("do not peel when prefix repeats the finite surface (Cayó / cayó)", () => {
  assert.equal(prefixRepeatsFiniteSurface(["Cayó"], "cayó"), true);
  assert.equal(
    shouldPeelLeadingScaffolding({
      isNominalHead: false,
      prefixWordCount: 1,
      claimWordCount: 5,
      prefixHasParticipleScaffold: true,
      prefixContainsFinite: true
    }),
    false
  );
});
