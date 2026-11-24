import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveMaculaProposal,
  parseMaculaAdvisoryDataset,
  verifyWithMacula,
  type MaculaClauseEvidence
} from "./macula-advisory.ts";

const COMMIT = "8423afe47b9e8f24b7772e808af45c7159a6fe7e";
const SPINE = "d".repeat(64);

function dataset(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: "cgv.macula-advisory",
    schemaVersion: 1,
    datasetId: "macula-greek-sblgnt",
    datasetVersion: "1.0.0",
    bookId: "tito",
    source: {
      repository: "Clear-Bible/macula-greek",
      commit: COMMIT,
      edition: "SBLGNT lowfat",
      license: "CC BY 4.0"
    },
    tokenSpine: { datasetId: "cgv-data", sha256: SPINE },
    clauses: {
      "1:5:10": {
        finiteVerbId: "1:5:10",
        exerciseSpan: { startTokenId: "1:5:7", endTokenId: "1:5:10" },
        constituentSpan: { startTokenId: "1:5:7", endTokenId: "1:5:15" },
        standing: "dependent",
        role: "adv",
        marker: { tokenId: "1:5:7", lemma: "ἵνα", frameType: "purpose" },
        parentFiniteVerbId: "1:5:3"
      }
    },
    ...overrides
  });
}

function purposeEvidence(): MaculaClauseEvidence {
  return parseMaculaAdvisoryDataset(dataset(), "tito", SPINE).clauses["1:5:10"];
}

test("strictly accepts a pinned, matching advisory dataset", () => {
  const parsed = parseMaculaAdvisoryDataset(dataset(), "tito", SPINE);
  assert.equal(parsed.source.commit, COMMIT);
  assert.equal(parsed.clauses["1:5:10"].constituentSpan?.endTokenId, "1:5:15");
});

test("fails closed on unsupported schemas and token spines", () => {
  assert.throws(
    () => parseMaculaAdvisoryDataset(dataset({ schemaVersion: 2 }), "tito", SPINE),
    /Unsupported MACULA advisory schema version/
  );
  assert.throws(
    () => parseMaculaAdvisoryDataset(dataset(), "tito", "different-version"),
    /token spine mismatch/
  );
  assert.throws(
    () => parseMaculaAdvisoryDataset(dataset({ tokenSpine: { datasetId: "other", sha256: SPINE } }), "tito", SPINE),
    /token spine dataset mismatch/
  );
  assert.throws(
    () => parseMaculaAdvisoryDataset(dataset({ tokenSpine: { datasetId: "cgv-data", sha256: "not-a-sha" } }), "tito", SPINE),
    /tokenSpine.sha256/
  );
});

test("rejects malformed clause keys and backward ranges", () => {
  const clauses = {
    "1:5:10": {
      finiteVerbId: "1:5:11",
      exerciseSpan: { startTokenId: "1:5:10", endTokenId: "1:5:7" },
      standing: "dependent"
    }
  };
  assert.throws(
    () => parseMaculaAdvisoryDataset(dataset({ clauses }), "tito", SPINE),
    /finiteVerbId does not match its key/
  );

  clauses["1:5:10"].finiteVerbId = "1:5:10";
  assert.throws(
    () => parseMaculaAdvisoryDataset(dataset({ clauses }), "tito", SPINE),
    /range runs backward/
  );
});

test("derives CGV proposals from explicit evidence priority", () => {
  const purpose = purposeEvidence();
  assert.deepEqual(deriveMaculaProposal(purpose), {
    kind: "frame",
    frameType: "purpose",
    parentFiniteVerbId: "1:5:3",
    reason: "MACULA records “ἵνα” as this clause's subordinating evidence."
  });

  assert.equal(
    deriveMaculaProposal({ ...purpose, relativeTokenId: "1:5:7" }).kind,
    "describes"
  );
  assert.equal(
    deriveMaculaProposal({ ...purpose, marker: undefined, role: "o" }).kind,
    "content"
  );
  assert.equal(
    deriveMaculaProposal({ ...purpose, marker: undefined, role: undefined, standing: "independent" }).kind,
    "root"
  );
});

test("keeps advice hidden until the student has done work", () => {
  const result = verifyWithMacula(purposeEvidence(), undefined, undefined);
  assert.equal(result.status, "unanswered");
  assert.equal(result.studentKind, null);
});

test("reports agreement without returning replacement progress", () => {
  const result = verifyWithMacula(
    purposeEvidence(),
    {
      finiteVerbId: "1:5:10",
      selectedSpan: [],
      greekStartTokenId: "1:5:7",
      greekEndTokenId: "1:5:10"
    },
    {
      describesNoun: "no",
      isWhatWasExpressed: "no",
      tellsWhenOrIf: "yes",
      whenIfParentClauseId: "1:5:3",
      frameType: "purpose"
    }
  );
  assert.equal(result.status, "agrees");
  assert.equal(result.spanMatches, true);
  assert.equal("replacement" in result, false);
});

test("distinguishes boundary differences from grammatical conflicts", () => {
  const evidence = purposeEvidence();
  const boundary = verifyWithMacula(
    evidence,
    {
      finiteVerbId: "1:5:10",
      selectedSpan: [],
      greekStartTokenId: "1:5:8",
      greekEndTokenId: "1:5:10"
    },
    {
      describesNoun: "no",
      isWhatWasExpressed: "no",
      tellsWhenOrIf: "yes",
      whenIfParentClauseId: "1:5:3",
      frameType: "purpose"
    }
  );
  assert.equal(boundary.status, "partly-agrees");
  assert.equal(boundary.startMatches, false);
  assert.equal(boundary.endMatches, true);

  const grammar = verifyWithMacula(
    evidence,
    undefined,
    { describesNoun: "no", isWhatWasExpressed: "no", tellsWhenOrIf: "no" }
  );
  assert.equal(grammar.status, "conflicts");
  assert.equal(grammar.relationMatches, false);
});
