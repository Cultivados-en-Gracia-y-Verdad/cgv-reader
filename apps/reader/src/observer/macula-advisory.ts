import type { ReaderBookId } from "@cgv/core";
import type { ClauseAssignment, ClauseObservation } from "./clause-data";
import type { FrameType } from "./clause-signals";

export const MACULA_ADVISORY_SCHEMA = "cgv.macula-advisory";
export const MACULA_ADVISORY_SCHEMA_VERSION = 1;

const TOKEN_ID = /^\d+:\d+:\d+$/;
const SHA_40 = /^[0-9a-f]{40}$/;
const FRAME_TYPES = new Set<FrameType>(["time", "reason", "condition", "purpose", "result"]);
const CLAUSE_ROLES = new Set<MaculaClauseRole>(["adv", "o", "s", "p", "io", "v", "vc", "unknown"]);

export type MaculaClauseRole = "adv" | "o" | "s" | "p" | "io" | "v" | "vc" | "unknown";
export type MaculaStanding = "independent" | "dependent" | "unknown";
export type MaculaProposalKind = "root" | "describes" | "content" | "frame";

export interface MaculaTokenRange {
  startTokenId: string;
  endTokenId: string;
}

export interface MaculaMarkerEvidence {
  tokenId: string;
  lemma: string;
  frameType?: FrameType;
}

/**
 * Normalized, read-only evidence published by cgv-data. The source tree remains
 * the witness; these fields do not represent a student's saved answer.
 */
export interface MaculaClauseEvidence {
  finiteVerbId: string;
  /** Narrow candidate shaped for CGV's finite-clause exercise. */
  exerciseSpan: MaculaTokenRange;
  /** MACULA's broader syntactic constituent, when it differs from exerciseSpan. */
  constituentSpan?: MaculaTokenRange;
  standing: MaculaStanding;
  role?: MaculaClauseRole;
  rule?: string;
  clauseType?: string;
  relativeTokenId?: string;
  marker?: MaculaMarkerEvidence;
  parentFiniteVerbId?: string;
  inheritsFromFiniteVerbId?: string;
}

export interface MaculaAdvisoryDataset {
  schema: typeof MACULA_ADVISORY_SCHEMA;
  schemaVersion: typeof MACULA_ADVISORY_SCHEMA_VERSION;
  datasetId: string;
  datasetVersion: string;
  bookId: ReaderBookId;
  source: {
    repository: string;
    commit: string;
    edition: string;
    license: string;
  };
  tokenSpine: {
    datasetId: string;
    sha256: string;
  };
  clauses: Record<string, MaculaClauseEvidence>;
}

export interface MaculaProposal {
  kind: MaculaProposalKind | null;
  frameType?: FrameType;
  parentFiniteVerbId?: string;
  reason: string;
}

export type MaculaVerificationStatus =
  | "unanswered"
  | "agrees"
  | "partly-agrees"
  | "conflicts"
  | "cannot-compare";

export interface MaculaVerification {
  status: MaculaVerificationStatus;
  proposal: MaculaProposal;
  studentKind: MaculaProposalKind | null;
  relationMatches: boolean | null;
  frameTypeMatches: boolean | null;
  parentMatches: boolean | null;
  spanMatches: boolean | null;
  startMatches: boolean | null;
  endMatches: boolean | null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid MACULA advisory ${label}: expected object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid MACULA advisory ${label}: expected non-empty string.`);
  }
  return value;
}

function tokenId(value: unknown, label: string): string {
  const result = text(value, label);
  if (!TOKEN_ID.test(result)) throw new Error(`Invalid MACULA advisory ${label}: ${result}.`);
  return result;
}

function optionalTokenId(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : tokenId(value, label);
}

function range(value: unknown, label: string): MaculaTokenRange {
  const candidate = record(value, label);
  const result = {
    startTokenId: tokenId(candidate.startTokenId, `${label}.startTokenId`),
    endTokenId: tokenId(candidate.endTokenId, `${label}.endTokenId`)
  };
  const start = result.startTokenId.split(":").map(Number);
  const end = result.endTokenId.split(":").map(Number);
  const ordered = start[0] < end[0] ||
    (start[0] === end[0] && start[1] < end[1]) ||
    (start[0] === end[0] && start[1] === end[1] && start[2] <= end[2]);
  if (!ordered) throw new Error(`Invalid MACULA advisory ${label}: range runs backward.`);
  return result;
}

function optionalRange(value: unknown, label: string): MaculaTokenRange | undefined {
  return value === undefined ? undefined : range(value, label);
}

function standing(value: unknown, label: string): MaculaStanding {
  if (value === "independent" || value === "dependent" || value === "unknown") return value;
  throw new Error(`Invalid MACULA advisory ${label}: ${String(value)}.`);
}

function optionalRole(value: unknown, label: string): MaculaClauseRole | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && CLAUSE_ROLES.has(value as MaculaClauseRole)) {
    return value as MaculaClauseRole;
  }
  throw new Error(`Invalid MACULA advisory ${label}: ${String(value)}.`);
}

function optionalFrameType(value: unknown, label: string): FrameType | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && FRAME_TYPES.has(value as FrameType)) return value as FrameType;
  throw new Error(`Invalid MACULA advisory ${label}: ${String(value)}.`);
}

function marker(value: unknown, label: string): MaculaMarkerEvidence | undefined {
  if (value === undefined) return undefined;
  const candidate = record(value, label);
  return {
    tokenId: tokenId(candidate.tokenId, `${label}.tokenId`),
    lemma: text(candidate.lemma, `${label}.lemma`),
    ...(candidate.frameType === undefined
      ? {}
      : { frameType: optionalFrameType(candidate.frameType, `${label}.frameType`) })
  };
}

function clause(value: unknown, key: string): MaculaClauseEvidence {
  const candidate = record(value, `clauses.${key}`);
  const finiteVerbId = tokenId(candidate.finiteVerbId, `clauses.${key}.finiteVerbId`);
  if (finiteVerbId !== key) {
    throw new Error(`Invalid MACULA advisory clauses.${key}: finiteVerbId does not match its key.`);
  }
  return {
    finiteVerbId,
    exerciseSpan: range(candidate.exerciseSpan, `clauses.${key}.exerciseSpan`),
    ...(candidate.constituentSpan === undefined
      ? {}
      : { constituentSpan: optionalRange(candidate.constituentSpan, `clauses.${key}.constituentSpan`) }),
    standing: standing(candidate.standing, `clauses.${key}.standing`),
    ...(candidate.role === undefined ? {} : { role: optionalRole(candidate.role, `clauses.${key}.role`) }),
    ...(typeof candidate.rule === "string" ? { rule: candidate.rule } : {}),
    ...(typeof candidate.clauseType === "string" ? { clauseType: candidate.clauseType } : {}),
    ...(candidate.relativeTokenId === undefined
      ? {}
      : { relativeTokenId: optionalTokenId(candidate.relativeTokenId, `clauses.${key}.relativeTokenId`) }),
    ...(candidate.marker === undefined ? {} : { marker: marker(candidate.marker, `clauses.${key}.marker`) }),
    ...(candidate.parentFiniteVerbId === undefined
      ? {}
      : { parentFiniteVerbId: optionalTokenId(candidate.parentFiniteVerbId, `clauses.${key}.parentFiniteVerbId`) }),
    ...(candidate.inheritsFromFiniteVerbId === undefined
      ? {}
      : {
          inheritsFromFiniteVerbId: optionalTokenId(
            candidate.inheritsFromFiniteVerbId,
            `clauses.${key}.inheritsFromFiniteVerbId`
          )
        })
  };
}

/** Strict parser: unsupported or incomplete published schemas fail closed. */
export function parseMaculaAdvisoryDataset(
  raw: string,
  expectedBookId: ReaderBookId,
  expectedTokenSpineSha256: string
): MaculaAdvisoryDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid MACULA advisory JSON.");
  }
  const candidate = record(parsed, "dataset");
  if (candidate.schema !== MACULA_ADVISORY_SCHEMA) {
    throw new Error(`Unsupported MACULA advisory schema: ${String(candidate.schema)}.`);
  }
  if (candidate.schemaVersion !== MACULA_ADVISORY_SCHEMA_VERSION) {
    throw new Error(`Unsupported MACULA advisory schema version: ${String(candidate.schemaVersion)}.`);
  }
  if (candidate.bookId !== expectedBookId) {
    throw new Error(`MACULA advisory book mismatch: expected ${expectedBookId}, got ${String(candidate.bookId)}.`);
  }

  const source = record(candidate.source, "source");
  const commit = text(source.commit, "source.commit");
  if (!SHA_40.test(commit)) throw new Error(`Invalid MACULA advisory source.commit: ${commit}.`);
  const tokenSpine = record(candidate.tokenSpine, "tokenSpine");
  const tokenSpineDatasetId = text(tokenSpine.datasetId, "tokenSpine.datasetId");
  if (tokenSpineDatasetId !== "cgv-data") {
    throw new Error(`MACULA advisory token spine dataset mismatch: ${tokenSpineDatasetId}.`);
  }
  const tokenSpineSha256 = text(tokenSpine.sha256, "tokenSpine.sha256");
  if (!/^[0-9a-f]{64}$/.test(tokenSpineSha256)) {
    throw new Error(`Invalid MACULA advisory tokenSpine.sha256: ${tokenSpineSha256}.`);
  }
  if (tokenSpineSha256 !== expectedTokenSpineSha256) {
    throw new Error(
      `MACULA advisory token spine mismatch: expected ${expectedTokenSpineSha256}, got ${tokenSpineSha256}.`
    );
  }

  const rawClauses = record(candidate.clauses, "clauses");
  const clauses = Object.fromEntries(Object.entries(rawClauses).map(([key, value]) => [key, clause(value, key)]));
  return {
    schema: MACULA_ADVISORY_SCHEMA,
    schemaVersion: MACULA_ADVISORY_SCHEMA_VERSION,
    datasetId: text(candidate.datasetId, "datasetId"),
    datasetVersion: text(candidate.datasetVersion, "datasetVersion"),
    bookId: expectedBookId,
    source: {
      repository: text(source.repository, "source.repository"),
      commit,
      edition: text(source.edition, "source.edition"),
      license: text(source.license, "source.license")
    },
    tokenSpine: {
      datasetId: tokenSpineDatasetId,
      sha256: tokenSpineSha256
    },
    clauses
  };
}

export function deriveMaculaProposal(evidence: MaculaClauseEvidence): MaculaProposal {
  if (evidence.relativeTokenId) {
    return {
      kind: "describes",
      parentFiniteVerbId: evidence.parentFiniteVerbId,
      reason: "MACULA places a relative form inside this clause."
    };
  }
  if (evidence.marker?.frameType || evidence.role === "adv") {
    return {
      kind: "frame",
      ...(evidence.marker?.frameType ? { frameType: evidence.marker.frameType } : {}),
      parentFiniteVerbId: evidence.parentFiniteVerbId,
      reason: evidence.marker
        ? `MACULA records “${evidence.marker.lemma}” as this clause's subordinating evidence.`
        : "MACULA gives this clause an adverbial role."
    };
  }
  if (evidence.role === "o" || evidence.role === "s" || evidence.role === "p") {
    return {
      kind: "content",
      parentFiniteVerbId: evidence.parentFiniteVerbId,
      reason: `MACULA gives this clause the syntactic role “${evidence.role}”.`
    };
  }
  if (evidence.standing === "independent") {
    return { kind: "root", reason: "MACULA does not place this finite under a dependent clause role." };
  }
  return {
    kind: null,
    parentFiniteVerbId: evidence.parentFiniteVerbId,
    reason: "MACULA supplies structure here, but the CGV relation cannot be mapped safely."
  };
}

function studentKind(observation: ClauseObservation | undefined): MaculaProposalKind | null {
  if (!observation) return null;
  if (observation.describesNoun === "yes") return "describes";
  if (observation.isWhatWasExpressed === "yes") return "content";
  if (observation.tellsWhenOrIf === "yes") return "frame";
  if (
    observation.describesNoun === "no" &&
    observation.isWhatWasExpressed === "no" &&
    observation.tellsWhenOrIf === "no"
  ) {
    return "root";
  }
  return null;
}

function studentParent(observation: ClauseObservation | undefined, kind: MaculaProposalKind | null): string | null {
  if (!observation || !kind) return null;
  if (kind === "content") return observation.expressedParentClauseId || null;
  if (kind === "frame") return observation.whenIfParentClauseId || null;
  return null;
}

/** Compare only; this function never mutates or returns replacement progress. */
export function verifyWithMacula(
  evidence: MaculaClauseEvidence,
  assignment: ClauseAssignment | undefined,
  observation: ClauseObservation | undefined
): MaculaVerification {
  const proposal = deriveMaculaProposal(evidence);
  const answeredKind = studentKind(observation);
  const hasSpan = Boolean(assignment?.greekStartTokenId && assignment?.greekEndTokenId);
  if (!answeredKind && !hasSpan) {
    return {
      status: "unanswered",
      proposal,
      studentKind: null,
      relationMatches: null,
      frameTypeMatches: null,
      parentMatches: null,
      spanMatches: null,
      startMatches: null,
      endMatches: null
    };
  }

  const relationMatches = answeredKind && proposal.kind ? answeredKind === proposal.kind : null;
  const frameTypeMatches =
    answeredKind === "frame" && proposal.kind === "frame" && observation?.frameType && proposal.frameType
      ? observation.frameType === proposal.frameType
      : null;
  const recordedParent = studentParent(observation, answeredKind);
  const parentMatches = recordedParent && proposal.parentFiniteVerbId
    ? recordedParent === proposal.parentFiniteVerbId
    : null;
  const startMatches = hasSpan
    ? assignment?.greekStartTokenId === evidence.exerciseSpan.startTokenId
    : null;
  const endMatches = hasSpan
    ? assignment?.greekEndTokenId === evidence.exerciseSpan.endTokenId
    : null;
  const spanMatches = hasSpan ? startMatches === true && endMatches === true : null;

  const hardConflict = relationMatches === false || frameTypeMatches === false || parentMatches === false;
  const hasComparableEvidence = [relationMatches, frameTypeMatches, parentMatches, spanMatches].some(value => value !== null);
  const allComparableAgree = [relationMatches, frameTypeMatches, parentMatches, spanMatches]
    .filter((value): value is boolean => value !== null)
    .every(Boolean);
  const status: MaculaVerificationStatus = hardConflict
    ? "conflicts"
    : !hasComparableEvidence
      ? "cannot-compare"
      : allComparableAgree
        ? "agrees"
        : "partly-agrees";

  return {
    status,
    proposal,
    studentKind: answeredKind,
    relationMatches,
    frameTypeMatches,
    parentMatches,
    spanMatches,
    startMatches,
    endMatches
  };
}
