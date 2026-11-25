import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClauseBeginningToken } from "./clause-data.ts";
import {
  buildClauseChoiceGuidance,
  detectClauseMarker,
  detectClauseSignal,
  detectLeadingFrameType,
  findLeadingMarkerToken,
  findSubordinatorPastLeadingWindow,
  isLikelyContentParent,
  type ClauseSignalInput
} from "./clause-signals.ts";

function token(
  id: string,
  greek: string,
  lemma: string,
  morph: string
): ClauseBeginningToken {
  return { id, greek, lemma, morph, ble: "" };
}

function clause(
  finiteVerbId: string,
  beginningTokens: ClauseBeginningToken[],
  finiteVerbLemma?: string,
  verse = 1
): ClauseSignalInput {
  return { finiteVerbId, chapter: 1, verse, finiteVerbLemma, beginningTokens };
}

test("Hebrew relative morphology proposes a relative clause", () => {
  const current = clause("1:1:2", [
    token("1:1:1", "אֲשֶׁר", "834", "HTr"),
    token("1:1:2", "עָשָׂה", "6213", "HVqp3ms")
  ]);

  const signal = detectClauseSignal(current, [current]);
  assert.equal(signal.kind, "confident");
  if (signal.kind === "confident") assert.equal(signal.choice, "describes");
});

test("Hebrew frame particles use OSHB morphology and Strong's heads", () => {
  const previous = clause("1:1:1", [token("1:1:1", "הָלַךְ", "1980", "HVqp3ms")], "1980", 1);
  const current = clause("1:2:2", [
    token("1:2:1", "אִם", "518", "HTc"),
    token("1:2:2", "תֵּלֵךְ", "1980", "HVqi2ms")
  ], undefined, 2);

  const signal = detectClauseSignal(current, [previous, current]);
  assert.equal(signal.kind, "confident");
  if (signal.kind === "confident") {
    assert.equal(signal.choice, "frame");
    if (signal.choice === "frame") assert.equal(signal.frameType, "condition");
  }
  assert.equal(detectLeadingFrameType(current.beginningTokens, current.finiteVerbId), "condition");
});

test("Hebrew lexical subordinators work even when OSHB retains a preposition tag", () => {
  const tokens = [
    token("1:2:1", "לְמַעַן", "4616", "HR"),
    token("1:2:2", "תִּחְיֶה", "2421", "HVqi2ms")
  ];

  assert.equal(detectLeadingFrameType(tokens, "1:2:2"), "purpose");
});

test("Greek hosper proposes a comparison and targets its houtos correlative", () => {
  const comparison = clause("1:1:5", [
    token("1:1:1", "ὥσπερ", "ὥσπερ", "C---------"),
    token("1:1:2", "γὰρ", "γάρ", "C---------"),
    token("1:1:5", "ἠπειθήσατε", "ἀπειθέω", "V-2AAI-P--")
  ], "ἀπειθέω", 1);
  const coordinated = clause("1:1:10", [
    token("1:1:9", "δὲ", "δέ", "C---------"),
    token("1:1:10", "ἠλεήθητε", "ἐλεάω", "V-2API-P--")
  ], "ἐλεάω", 1);
  const correlative = clause("1:2:5", [
    token("1:2:1", "οὕτως", "οὕτως", "D---------"),
    token("1:2:5", "ἠπείθησαν", "ἀπειθέω", "V-3AAI-P--")
  ], "ἀπειθέω", 2);

  const signal = detectClauseSignal(comparison, [comparison, coordinated, correlative]);
  assert.equal(signal.kind, "confident");
  if (signal.kind === "confident" && signal.choice === "frame") {
    assert.equal(signal.frameType, "comparison");
    assert.equal(signal.target, correlative.finiteVerbId);
  } else {
    assert.fail("Expected a confident comparison-frame signal");
  }
  assert.equal(detectLeadingFrameType(comparison.beginningTokens, comparison.finiteVerbId), "comparison");
});

test("Greek achri hou is temporal as a compound and not an ordinary relative", () => {
  const previous = clause("1:1:10", [token("1:1:10", "γέγονεν", "γίνομαι", "V-3RAI-S--")]);
  const current = clause("1:1:15", [
    token("1:1:11", "ἄχρι", "ἄχρι", "R---------"),
    token("1:1:12", "οὗ", "ὅς", "RR----GSM-"),
    token("1:1:15", "εἰσέλθῃ", "εἰσέρχομαι", "V-3AAS-S--")
  ]);
  const signal = detectClauseSignal(current, [previous, current]);
  assert.equal(signal.kind, "confident");
  if (signal.kind === "confident" && signal.choice === "frame") {
    assert.equal(signal.frameType, "time");
    assert.equal(signal.target, previous.finiteVerbId);
  } else {
    assert.fail("Expected a confident temporal-frame signal");
  }
  assert.equal(detectLeadingFrameType(current.beginningTokens, current.finiteVerbId), "time");
});

test("a matrix verb after an embedded condition is not itself classified as conditional", () => {
  const child = clause("1:1:5", [
    token("1:1:3", "ἐὰν", "ἐάν", "C---------"),
    token("1:1:4", "μὴ", "μή", "D---------"),
    token("1:1:5", "ἐπιμένωσι", "ἐπιμένω", "V-3PAS-P--")
  ]);
  const matrix = clause("1:1:8", [
    token("1:1:2", "δέ", "δέ", "C---------"),
    token("1:1:3", "ἐὰν", "ἐάν", "C---------"),
    token("1:1:4", "μὴ", "μή", "D---------"),
    token("1:1:5", "ἐπιμένωσι", "ἐπιμένω", "V-3PAS-P--"),
    token("1:1:8", "ἐγκεντρισθήσονται", "ἐγκεντρίζω", "V-3FPI-P--")
  ]);
  assert.equal(detectClauseSignal(matrix, [child, matrix]).kind, "none");
});

test("Hebrew ki remains ambiguous but leans content after a saying verb", () => {
  const previous = clause("1:1:1", [token("1:1:1", "אָמַר", "559", "HVqp3ms")], "559", 1);
  const current = clause("1:2:2", [
    token("1:2:1", "כִּי", "3588", "HC"),
    token("1:2:2", "טוֹב", "2896", "HAamsa")
  ], undefined, 2);
  const all = [previous, current];

  const signal = detectClauseSignal(current, all);
  assert.equal(signal.kind, "uncertain");
  assert.match(signal.reason, /content of what was said or thought/);
  assert.match(signal.reason, /saying\/knowing\/perceiving verb/);
  assert.equal(buildClauseChoiceGuidance(current, signal, all).suggested, "content");
  assert.equal(detectLeadingFrameType(current.beginningTokens, current.finiteVerbId), "reason");
  assert.equal(isLikelyContentParent(previous), true);
  assert.deepEqual(
    detectClauseMarker(current.beginningTokens, "content", undefined, current.finiteVerbId),
    { word: "כִּי", lemma: "כִּי", type: "subordinating", subtype: "contenido" }
  );
});

test("buried-marker audit recognizes Hebrew subordinators", () => {
  const tokens = [
    token("1:3:1", "דָּבָר", "1697", "HNcmsa"),
    token("1:3:2", "אֶחָד", "259", "HAcmsa"),
    token("1:3:3", "מְאֹד", "3966", "HD"),
    token("1:3:4", "שָׁם", "8033", "HD"),
    token("1:3:5", "כַּאֲשֶׁר", "k/834", "HC/Tr"),
    token("1:3:6", "בָּא", "935", "HVqp3ms")
  ];

  assert.equal(findSubordinatorPastLeadingWindow(tokens, "1:3:6")?.role, "a time particle");
});

test("prefixed Hebrew waw is exposed as a relational connector on a root", () => {
  const tokens = [token("1:1:1", "וַ/יֹּאמֶר", "c/559", "HC/Vqw3ms")];

  assert.equal(findLeadingMarkerToken(tokens, "1:1:1").kind, "connector");
  assert.deepEqual(detectClauseMarker(tokens, "root", undefined, "1:1:1"), {
    word: "וַ/יֹּאמֶר",
    lemma: "ו",
    type: "relational",
    subtype: "adición"
  });
});

test("Greek coordinators continue to produce relational connectors", () => {
  const tokens = [
    token("1:1:1", "καί", "καί", "C---------"),
    token("1:1:2", "λέγει", "λέγω", "V-3PAI-S--")
  ];

  assert.deepEqual(detectClauseMarker(tokens, "root", undefined, "1:1:2"), {
    word: "καί",
    lemma: "καί",
    type: "relational",
    subtype: "adición"
  });
});

test("standalone Hebrew discourse connectors retain their connector force", () => {
  const tokens = [
    token("1:1:1", "אֲבָל", "61", "HD"),
    token("1:1:2", "אָמַר", "559", "HVqp3ms")
  ];

  assert.deepEqual(detectClauseMarker(tokens, "root", undefined, "1:1:2"), {
    word: "אֲבָל",
    lemma: "אֲבָל",
    type: "relational",
    subtype: "contraste"
  });
});
