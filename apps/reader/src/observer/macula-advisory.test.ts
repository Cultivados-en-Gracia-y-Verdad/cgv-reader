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
const TARGET_TEXT = "e".repeat(64);

function dataset(overrides: Record<string, unknown> = {}): string {
  const schemaVersion = overrides.schemaVersion === 2 ? 2 : 1;
  return JSON.stringify({
    schema: "cgv.macula-advisory",
    schemaVersion,
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
    ...(schemaVersion === 2
      ? { targetText: { datasetId: "cgv-data", sha256: TARGET_TEXT } }
      : {}),
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

function versionTwoClause(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    finiteVerbId: "1:5:10",
    exerciseSpan: { startTokenId: "1:5:7", endTokenId: "1:5:10" },
    standing: "dependent",
    role: "adv",
    attachmentStatus: "exact",
    grammaticalRoles: [
      {
        role: "subject",
        targetWordIds: ["1:5:2", "1:5:3"],
        sourceRole: "s",
        sourceTokenIds: ["1:5:8", "1:5:9"]
      }
    ],
    ...overrides
  };
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
    () => parseMaculaAdvisoryDataset(dataset({ schemaVersion: 3 }), "tito", SPINE),
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

test("accepts reviewed TR1894 grammatical-role proposals in schema v2", () => {
  const parsed = parseMaculaAdvisoryDataset(
    dataset({
      schemaVersion: 2,
      clauses: { "1:5:10": versionTwoClause() }
    }),
    "tito",
    SPINE,
    TARGET_TEXT
  );
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.clauses["1:5:10"].attachmentStatus, "exact");
  assert.deepEqual(parsed.clauses["1:5:10"].grammaticalRoles?.[0], {
    role: "subject",
    targetWordIds: ["1:5:2", "1:5:3"],
    sourceRole: "s",
    sourceTokenIds: ["1:5:8", "1:5:9"]
  });
});

test("binds schema-v2 target word ids to the exact published LBF text", () => {
  const raw = dataset({
    schemaVersion: 2,
    clauses: { "1:5:10": versionTwoClause() }
  });
  assert.throws(
    () => parseMaculaAdvisoryDataset(raw, "tito", SPINE),
    /target text cannot be validated/
  );
  assert.throws(
    () => parseMaculaAdvisoryDataset(raw, "tito", SPINE, "f".repeat(64)),
    /target text mismatch/
  );
});

test("keeps v1 compatible but rejects v2 role fields disguised as v1", () => {
  assert.equal(parseMaculaAdvisoryDataset(dataset(), "tito", SPINE).schemaVersion, 1);
  assert.throws(
    () => parseMaculaAdvisoryDataset(
      dataset({ clauses: { "1:5:10": versionTwoClause() } }),
      "tito",
      SPINE
    ),
    /v2 fields require schemaVersion 2/
  );
});

test("fails closed on untraceable or contradictory grammatical-role proposals", () => {
  assert.throws(
    () => parseMaculaAdvisoryDataset(
      dataset({
        schemaVersion: 2,
        clauses: {
          "1:5:10": versionTwoClause({
            grammaticalRoles: [{ role: "subject", targetWordIds: ["1:5:2"] }]
          })
        }
      }),
      "tito",
      SPINE,
      TARGET_TEXT
    ),
    /require sourceRole and sourceTokenIds/
  );

  assert.throws(
    () => parseMaculaAdvisoryDataset(
      dataset({
        schemaVersion: 2,
        clauses: {
          "1:5:10": versionTwoClause({
            attachmentStatus: "adapted",
            textualDifference: undefined
          })
        }
      }),
      "tito",
      SPINE,
      TARGET_TEXT
    ),
    /requires textualDifference/
  );

  assert.throws(
    () => parseMaculaAdvisoryDataset(
      dataset({
        schemaVersion: 2,
        clauses: {
          "1:5:10": versionTwoClause({
            attachmentStatus: "no-macula-syntax"
          })
        }
      }),
      "tito",
      SPINE,
      TARGET_TEXT
    ),
    /cannot publish grammatical role proposals/
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
