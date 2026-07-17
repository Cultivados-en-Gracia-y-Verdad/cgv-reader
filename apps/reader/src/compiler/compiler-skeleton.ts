// Compiler — manual skeleton generator. Reads O's live data (same localStorage
// O itself reads/writes — see clause-data.ts's ClauseObservations/
// ParticipleObservations exports) and mechanically produces a markdown
// skeleton: structure, Scripture text, and grammatical explanations, ready
// for a human writer to add commentary to. Never writes theological or
// interpretive content — only what's already been observed in O.
//
// Per the confirmed spec: H1/H2 stay TODO placeholders (human-assigned). H3
// tracks the root clause's actual grammatical span (may pull in preceding
// verbless/unplaced material). H4 is the root's own quoted text. "-" lists a
// dependent clause's quoted text; nested "*" is its mechanical explanation;
// "+" is reserved for a human writer's own deep dive and is never generated.

import {
  formatClauseSpan,
  getClauseBeginningTokens,
  getVersesWithoutFiniteVerb,
  loadTitusClauseVerses,
  readClauseAssignments,
  readClauseObservations,
  readMarkedAlignmentIds,
  readParticipleObservations,
  resolveParticipleClassification,
  type ClauseBeginningToken,
  type SpanishWord
} from "../observer/clause-data";
import {
  detectClauseSignal,
  detectLeadingCoordinator,
  findLeadingMarkerToken,
  type ClauseSignalInput,
  type FrameType,
  type LeadingMarker
} from "../observer/clause-signals";
import {
  applyCoordinateInheritance,
  deriveSkeleton,
  resolveClause,
  type ClauseObservationLike,
  type ClauseSpanInfo,
  type ParkedClause,
  type SkeletonNode
} from "../observer/clause-tree";

const COMMAND_MARKS_KEY = "roots:titus:brick2:mood:imperativeCandidates";
const STATEMENT_MARKS_KEY = "roots:titus:brick2c:mood:statementCandidates";
const SUBJUNCTIVE_MARKS_KEY = "roots:titus:brick3:mood:subjunctiveCandidates";
const OPTATIVE_MARKS_KEY = "roots:titus:brick3c:mood:optativeCandidates";
const PARTICIPLE_MARKS_KEY = "roots:titus:brick4:participleCandidates";

interface GenderInfo {
  indefiniteArticle: string;
  definiteArticle: string;
  noun: string;
  adjectiveEnding: string;
}

// "un(a) {relation type} nuevo(a)" / "continúa el/la ya declarado(a)" — the
// coordinate-inheritance template needs the right gender for whichever
// relation type is being inherited. Content/describes included alongside the
// four frame types since applyCoordinateInheritance can inherit any of the
// three relations, not just frame.
const RELATION_TYPE_GENDER: Record<string, GenderInfo> = {
  purpose: { indefiniteArticle: "un", definiteArticle: "el", noun: "propósito", adjectiveEnding: "o" },
  reason: { indefiniteArticle: "una", definiteArticle: "la", noun: "razón", adjectiveEnding: "a" },
  condition: { indefiniteArticle: "una", definiteArticle: "la", noun: "condición", adjectiveEnding: "a" },
  time: { indefiniteArticle: "un", definiteArticle: "el", noun: "tiempo", adjectiveEnding: "o" },
  content: { indefiniteArticle: "un", definiteArticle: "el", noun: "contenido", adjectiveEnding: "o" },
  describes: { indefiniteArticle: "una", definiteArticle: "la", noun: "descripción", adjectiveEnding: "a" }
};

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}

function quote(text: string): string {
  return `“${text}”`;
}

// Every clause below is meant to be read by a Spanish-speaking writer, so
// every "{word}" filled into a template is the Spanish alignment for that one
// Greek token (already resolved onto ClauseBeginningToken.ble), never the
// Greek surface — the one deliberate exception is the coordinate-inheritance
// template's "shared particle," which names a DIFFERENT clause's own marker
// that isn't quoted anywhere in the current clause's text, so only the Greek
// unambiguously identifies it.
function relationalConnectorLine(word: string, lemma: string): string {
  switch (lemma) {
    case "καί":
      return `"${word}" es un conector relacional de adición — une esta declaración a la anterior sin introducir contraste ni motivo.`;
    case "ἀλλά":
      return `"${word}" es un conector relacional de contraste — presenta esta declaración como un giro respecto a la anterior.`;
    case "γάρ":
    case "διότι":
      return `"${word}" es un conector relacional que presenta esta declaración como razón o fundamento de la anterior.`;
    case "οὖν":
      return `"${word}" es un conector relacional que presenta esta declaración como una conclusión de la anterior.`;
    case "δέ":
      return `"${word}" es un conector relacional que conecta esta declaración con la anterior.`;
    default:
      return `"${word}" es un conector relacional que conecta esta declaración con la anterior.`;
  }
}

const ASYNDETON_LINE = "Esta cláusula no lleva conector — inicia sin partícula de enlace.";

function subordinatingLine(
  frameType: FrameType | undefined,
  isContent: boolean,
  isDescribes: boolean,
  word: string,
  parentVerbText: string | null,
  describedNounText: string | null
): string {
  if (isContent) {
    return `"${word}" introduce el contenido de lo que se afirma en la cláusula anterior.`;
  }
  if (isDescribes) {
    return `"${word}" introduce una cláusula que describe a "${describedNounText ?? "un sustantivo anterior"}," mencionado antes.`;
  }
  switch (frameType) {
    case "purpose":
      return `"${word}" es un marcador subordinante de propósito — introduce la meta hacia la cual se dirige la acción de "${parentVerbText ?? "la cláusula anterior"}."`;
    case "reason":
      // Not enumerated among the confirmed subordinating templates (only
      // relational/root-level "razón" was given) — filled in by direct
      // analogy with condición/tiempo's phrasing, since reason clauses do
      // occur as Q3 dependents in the real data (e.g. Tito 1:7's "porque").
      return `"${word}" es un marcador subordinante de razón — introduce el motivo o fundamento de la cláusula anterior.`;
    case "condition":
      return `"${word}" es un marcador subordinante de condición — introduce una condición para la cláusula anterior.`;
    case "time":
      return `"${word}" es un marcador subordinante de tiempo — conecta esta cláusula con un momento relacionado en la cláusula anterior.`;
    default:
      return ASYNDETON_LINE;
  }
}

function inheritanceLine(sharedParticleGreek: string, connectorSpanish: string, relationKey: string): string {
  const gender = RELATION_TYPE_GENDER[relationKey] ?? RELATION_TYPE_GENDER.reason;
  return (
    `Esta cláusula comparte el mismo "${sharedParticleGreek}" que la cláusula anterior, unida por "${connectorSpanish}" ` +
    `— no introduce ${gender.indefiniteArticle} ${gender.noun} nuev${gender.adjectiveEnding}, continúa ` +
    `${gender.definiteArticle} ya declarad${gender.adjectiveEnding}.`
  );
}

function participleLine(
  classification: "attributive" | "substantival" | "circumstantial",
  participleText: string,
  describedNounText: string | null,
  finiteVerbText: string | null
): string {
  if (classification === "attributive") {
    return `"${participleText}" es un participio atributivo que describe a "${describedNounText ?? "un sustantivo cercano"}."`;
  }
  if (classification === "substantival") {
    return `"${participleText}" es un participio sustantivado — funciona como el nombre de una persona o cosa, no describe algo más.`;
  }
  return `"${participleText}" es un participio circunstancial que acompaña la acción de "${finiteVerbText ?? "la cláusula que lo rige"}."`;
}

function verblessLine(governingClauseText: string): string {
  return `Esta expresión no tiene verbo finito propio (cláusula nominal) y se une aquí a "${governingClauseText}."`;
}

interface CompilerClause {
  finiteVerbId: string;
  chapter: number;
  verse: number;
  order: number;
  beginningTokens: ClauseBeginningToken[];
  finiteVerbText: string;
}

interface GeneratedDoc {
  markdown: string;
  clauseCount: number;
  verblessCount: number;
  pendingCount: number;
  warnings: string[];
}

/**
 * Reads O's current live data (Titus) and produces the markdown skeleton.
 * Pure, synchronous, read-only — never writes back to O's storage.
 */
export function generateManualSkeleton(): GeneratedDoc {
  const warnings: string[] = [];
  const verses = loadTitusClauseVerses();
  const assignments = readClauseAssignments();
  const observations = readClauseObservations();
  const participleObservations = readParticipleObservations();

  const wordById = new Map<string, SpanishWord>();
  const wordsByVerse = new Map<string, SpanishWord[]>();
  const verseTextByKey = new Map<string, string>();
  const wordByParticipleId = new Map<string, SpanishWord>();
  for (const verse of verses) {
    wordsByVerse.set(`${verse.chapter}:${verse.verse}`, verse.words);
    verseTextByKey.set(`${verse.chapter}:${verse.verse}`, verse.text);
    for (const word of verse.words) {
      wordById.set(word.id, word);
      if (word.participleId) wordByParticipleId.set(word.participleId, word);
    }
  }

  const finiteVerbs = verses.flatMap(verse => verse.words.filter(word => word.finiteVerbId));
  const finiteVerbWordById = new Map<string, SpanishWord>();
  for (const word of finiteVerbs) {
    if (word.finiteVerbId) finiteVerbWordById.set(word.finiteVerbId, word);
  }

  const moodReviewedVerbIds = new Set<string>();
  readMarkedAlignmentIds(COMMAND_MARKS_KEY).forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(STATEMENT_MARKS_KEY).forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(SUBJUNCTIVE_MARKS_KEY).forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(OPTATIVE_MARKS_KEY).forEach(id => moodReviewedVerbIds.add(id));
  const participleMarkedAlignmentIds = readMarkedAlignmentIds(PARTICIPLE_MARKS_KEY);

  const clauses: CompilerClause[] = [];
  for (const finiteVerb of finiteVerbs) {
    const finiteVerbId = finiteVerb.finiteVerbId;
    if (!finiteVerbId || !moodReviewedVerbIds.has(finiteVerbId)) continue;
    const assignment = assignments[finiteVerbId];
    if (!assignment || !assignment.selectedSpan.length) continue;
    const greekRange =
      assignment.greekStartTokenId && assignment.greekEndTokenId
        ? { greekStartTokenId: assignment.greekStartTokenId, greekEndTokenId: assignment.greekEndTokenId }
        : null;
    clauses.push({
      finiteVerbId,
      chapter: finiteVerb.chapter,
      verse: finiteVerb.verse,
      order: finiteVerb.chapter * 100000 + finiteVerb.verse * 1000 + finiteVerb.index,
      beginningTokens: getClauseBeginningTokens(greekRange),
      finiteVerbText: finiteVerb.text
    });
  }
  clauses.sort(byOrder);

  const clauseById = new Map(clauses.map(clause => [clause.finiteVerbId, clause]));

  function spanTextFor(finiteVerbId: string): string {
    const assignment = assignments[finiteVerbId];
    const clause = clauseById.get(finiteVerbId);
    if (!assignment || !clause) return "";
    const verseKey = `${clause.chapter}:${clause.verse}`;
    const verseWords = wordsByVerse.get(verseKey) ?? [];
    const verseText = verseTextByKey.get(verseKey) ?? "";
    return formatClauseSpan(assignment.selectedSpan, verseWords, verseText);
  }

  // A described-noun span (Q1) can point at a completely different verse
  // than the clause doing the describing (e.g. Tito 3:11:3 describes a noun
  // back in 3:10) — the verse to format against has to come from the span's
  // OWN first word, never assumed to match the describing clause's verse.
  function spanTextAtItsOwnVerse(span: string[] | undefined): string | null {
    if (!span?.length) return null;
    const firstWord = wordById.get(span[0]);
    if (!firstWord) return null;
    const verseKey = `${firstWord.chapter}:${firstWord.verse}`;
    return formatClauseSpan(span, wordsByVerse.get(verseKey) ?? [], verseTextByKey.get(verseKey) ?? "");
  }

  const clauseSignalInputs: ClauseSignalInput[] = clauses.map(clause => ({
    finiteVerbId: clause.finiteVerbId,
    chapter: clause.chapter,
    verse: clause.verse,
    beginningTokens: clause.beginningTokens
  }));

  // Coordinate inheritance's own "zeroth question" — identical logic to
  // SpanishClauseBuilder.tsx's coordinateContinuationIds, duplicated here
  // rather than shared since it's three lines over data this module already
  // has in a different shape.
  const coordinateContinuationIds = new Set<string>();
  for (const input of clauseSignalInputs) {
    if (detectClauseSignal(input, clauseSignalInputs).kind !== "none") continue;
    if (detectLeadingCoordinator(input.beginningTokens)) coordinateContinuationIds.add(input.finiteVerbId);
  }

  const clauseSpanInfos: ClauseSpanInfo[] = clauses.map(clause => ({
    finiteVerbId: clause.finiteVerbId,
    reference: `Tito ${clause.chapter}:${clause.verse}`,
    spanText: spanTextFor(clause.finiteVerbId),
    wordIds: (assignments[clause.finiteVerbId]?.selectedSpan ?? []).slice(),
    order: clause.order
  }));
  const clauseSpanInfoById = new Map(clauseSpanInfos.map(info => [info.finiteVerbId, info]));

  const observationLikeById: Record<string, ClauseObservationLike> = {};
  for (const [finiteVerbId, observation] of Object.entries(observations)) {
    observationLikeById[finiteVerbId] = observation;
  }

  const augmentedObservations = applyCoordinateInheritance(clauseSpanInfos, observationLikeById, coordinateContinuationIds);
  const skeleton = deriveSkeleton(clauseSpanInfos, augmentedObservations);

  // Participle attachment: exact clause if the participle's own word sits
  // inside a clause's selected span, else the positionally-nearest clause row
  // in the same verse, else null (a verbless verse has no clause to attach
  // to) — identical rule to SpanishClauseBuilder.tsx's participleClauseAssignment.
  const wordIdToClauseId = new Map<string, string>();
  for (const clause of clauses) {
    for (const id of assignments[clause.finiteVerbId]?.selectedSpan ?? []) {
      if (!wordIdToClauseId.has(id)) wordIdToClauseId.set(id, clause.finiteVerbId);
    }
  }
  const rowsByVerseKey = new Map<string, CompilerClause[]>();
  for (const clause of clauses) {
    const key = `${clause.chapter}:${clause.verse}`;
    const list = rowsByVerseKey.get(key) ?? [];
    list.push(clause);
    rowsByVerseKey.set(key, list);
  }
  const participleClauseAssignment = new Map<string, string | null>();
  for (const participleId of participleMarkedAlignmentIds) {
    const word = wordByParticipleId.get(participleId);
    if (!word) continue;
    const exactClauseId = wordIdToClauseId.get(word.id);
    if (exactClauseId) {
      participleClauseAssignment.set(participleId, exactClauseId);
      continue;
    }
    const candidates = rowsByVerseKey.get(`${word.chapter}:${word.verse}`) ?? [];
    let nearestId: string | null = null;
    let nearestDistance = Infinity;
    for (const candidate of candidates) {
      for (const id of assignments[candidate.finiteVerbId]?.selectedSpan ?? []) {
        const selected = wordById.get(id);
        if (!selected || selected.chapter !== word.chapter || selected.verse !== word.verse) continue;
        const distance = Math.abs(selected.index - word.index);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestId = candidate.finiteVerbId;
        }
      }
    }
    participleClauseAssignment.set(participleId, nearestId);
  }

  // Every participle attached to a given clause — atributivo/sustantivado use
  // participleClauseAssignment (nearest containing clause); circunstancial
  // uses its own explicit ridingClauseId when set (the clause its action
  // accompanies can be a different one than whichever clause it sits inside).
  const participlesByClauseId = new Map<string, string[]>();
  const participlesByVerseKey = new Map<string, string[]>();
  for (const participleId of participleMarkedAlignmentIds) {
    const classification = resolveParticipleClassification(participleObservations[participleId]);
    if (!classification) continue;
    const observation = participleObservations[participleId];
    const word = wordByParticipleId.get(participleId);
    const targetClauseId =
      classification === "circumstantial" && observation?.ridingClauseId
        ? observation.ridingClauseId
        : participleClauseAssignment.get(participleId) ?? null;
    if (targetClauseId) {
      const list = participlesByClauseId.get(targetClauseId) ?? [];
      list.push(participleId);
      participlesByClauseId.set(targetClauseId, list);
    } else if (word) {
      const key = `${word.chapter}:${word.verse}`;
      const list = participlesByVerseKey.get(key) ?? [];
      list.push(participleId);
      participlesByVerseKey.set(key, list);
    }
  }

  function participleLinesFor(finiteVerbId: string | null, verseKey: string | null): string[] {
    const ids = [
      ...(finiteVerbId ? participlesByClauseId.get(finiteVerbId) ?? [] : []),
      ...(verseKey ? participlesByVerseKey.get(verseKey) ?? [] : [])
    ];
    const lines: string[] = [];
    for (const participleId of ids) {
      const classification = resolveParticipleClassification(participleObservations[participleId]);
      if (!classification) continue;
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      const observation = participleObservations[participleId];
      const describedNounText = spanTextAtItsOwnVerse(observation?.describedNounSpan);
      const ridingVerb =
        classification === "circumstantial" && observation?.ridingClauseId
          ? finiteVerbWordById.get(observation.ridingClauseId)?.text ?? null
          : null;
      lines.push(participleLine(classification, word.text, describedNounText, ridingVerb));
    }
    return lines;
  }

  // Shared particle for a coordinate-inherited clause: walk back through
  // consecutive continuations (chained καί...καί...) to the first clause that
  // actually carries its own marker — matching applyCoordinateInheritance's
  // own "immediately preceding clause in document order" rule exactly, so a
  // multi-link chain always names the true originating particle, not
  // whichever bare coordinator happens to sit one clause back.
  function findOriginatingMarker(clause: CompilerClause): { marker: LeadingMarker; relationKey: string } | null {
    let index = clauses.findIndex(candidate => candidate.finiteVerbId === clause.finiteVerbId);
    while (index > 0) {
      index -= 1;
      const candidate = clauses[index];
      if (coordinateContinuationIds.has(candidate.finiteVerbId)) continue;
      const candidateInfo = clauseSpanInfoById.get(candidate.finiteVerbId);
      if (!candidateInfo) continue;
      const resolved = resolveClause(candidateInfo, augmentedObservations[candidate.finiteVerbId], clauseSpanInfos);
      const relationKey = resolved.frameType ?? (resolved.relation === "content" ? "content" : "describes");
      return { marker: findLeadingMarkerToken(candidate.beginningTokens), relationKey };
    }
    return null;
  }

  function dependentExplanationLines(node: SkeletonNode, clause: CompilerClause): string[] {
    if (coordinateContinuationIds.has(node.finiteVerbId)) {
      const connectorMarker = findLeadingMarkerToken(clause.beginningTokens);
      const connectorWord = connectorMarker.kind === "coordinator" ? connectorMarker.token.ble : "";
      const origin = findOriginatingMarker(clause);
      if (origin && origin.marker.kind !== "none") {
        return [inheritanceLine(origin.marker.token.greek, connectorWord, origin.relationKey)];
      }
      warnings.push(`${node.reference} (${node.finiteVerbId}): coordinate-inherited but no originating marker found — check manually.`);
      return [inheritanceLine("?", connectorWord, "reason")];
    }

    const marker = findLeadingMarkerToken(clause.beginningTokens);
    const isContent = node.relation === "content";
    const isDescribes = node.relation === "describes";

    let describedNounText: string | null = null;
    if (isDescribes) {
      describedNounText = spanTextAtItsOwnVerse(augmentedObservations[node.finiteVerbId]?.describedNounSpan);
    }

    let parentVerbText: string | null = null;
    if (node.relation === "frame") {
      const parentId = augmentedObservations[node.finiteVerbId]?.whenIfParentClauseId;
      if (parentId) parentVerbText = finiteVerbWordById.get(parentId)?.text ?? null;
    }

    if (marker.kind === "none") {
      // Real case in the data (Tito 2:14:13): O already resolved this as a
      // dependent clause (relation/frameType answered directly, not
      // inherited), but its own leading window doesn't carry a recognized
      // particle — likely marked before coordinate-inheritance existed, or a
      // stale Greek range. Distinct from root asyndeton (a genuine, expected
      // finding) — this is a gap to flag, not a normal outcome.
      warnings.push(`${node.reference} (${node.finiteVerbId}): no leading marker detected for a resolved dependent clause — check the Greek range and coordinate-inheritance status manually.`);
      return ["Esta cláusula no tiene un marcador inicial reconocido — revisar el rango griego manualmente."];
    }

    const word = marker.token.ble;
    return [subordinatingLine(node.frameType, isContent, isDescribes, word, parentVerbText, describedNounText)];
  }

  function rootExplanationLines(clause: CompilerClause): string[] {
    const marker = findLeadingMarkerToken(clause.beginningTokens);
    if (marker.kind === "none") return [ASYNDETON_LINE];
    if (marker.kind === "relative") {
      // A relative pronoun opening what's already resolved as an independent
      // clause is the "relative of connection" idiom (see clause-signals.ts) —
      // functions as a connector, not a description, so it still gets a
      // relational line, using its own Spanish alignment.
      return [relationalConnectorLine(marker.token.ble, "δέ")];
    }
    if (marker.kind === "coordinator") return [relationalConnectorLine(marker.token.ble, marker.lemma)];
    if (marker.kind === "frame") return [relationalConnectorLine(marker.token.ble, marker.token.lemma.trim())];
    return [ASYNDETON_LINE];
  }

  function renderNode(node: SkeletonNode, depth: number): string[] {
    const clause = clauseById.get(node.finiteVerbId);
    const lines: string[] = [];
    const indent = "  ".repeat(depth);
    const bulletIndent = "  ".repeat(depth + 1);

    if (!clause) {
      lines.push(`${indent}- ${quote(node.spanText || node.reference)}`);
      lines.push(`${bulletIndent}* Aún no clasificado en O (Q1/Q2/Q3 pendiente).`);
      warnings.push(`${node.reference} (${node.finiteVerbId}): no beginning-token data available — check manually.`);
      return lines;
    }

    lines.push(`${indent}- ${quote(node.spanText || clause.finiteVerbText)}`);
    for (const explanation of dependentExplanationLines(node, clause)) {
      lines.push(`${bulletIndent}* ${explanation}`);
    }
    for (const participleExplanation of participleLinesFor(node.finiteVerbId, null)) {
      lines.push(`${bulletIndent}* ${participleExplanation}`);
    }
    for (const child of node.children) {
      lines.push(...renderNode(child, depth + 1));
    }
    return lines;
  }

  // Merge roots, parked clauses, and verbless verses into one chronological
  // walk. Verbless material and parked clauses (a clause Q1 resolved as
  // "describes" but couldn't attach anywhere) both fold into whichever root
  // comes next — per skeleton-telos-spec.md / manual-markdown-format-spec.md's
  // Tito 1:1 discussion ("the whole 1:1–2 stretch belongs grammatically to
  // the one main verb that doesn't appear until 1:3"). Nothing here decides
  // WHAT a parked clause is (that's already recorded in O); it's surfaced,
  // visibly, as still pending placement — never silently dropped.
  type Orphan =
    | { kind: "verbless"; order: number; chapter: number; verse: number; text: string }
    | { kind: "parked"; order: number; node: ParkedClause };

  const verbless = Array.from(getVersesWithoutFiniteVerb())
    .map(key => {
      const [chapter, verse] = key.split(":").map(Number);
      return { chapter, verse, order: chapter * 100000 + verse * 1000, text: verseTextByKey.get(key) ?? "" };
    })
    .sort((a, b) => a.order - b.order);

  const orphans: Orphan[] = [
    ...verbless.map(entry => ({ kind: "verbless" as const, order: entry.order, chapter: entry.chapter, verse: entry.verse, text: entry.text })),
    ...skeleton.parked.map(node => ({ kind: "parked" as const, order: clauseById.get(node.finiteVerbId)?.order ?? 0, node }))
  ].sort((a, b) => a.order - b.order);

  // deriveSkeleton already sorts topLevelIds by document order before
  // building nodes, so skeleton.roots is already in the right walk order.
  const roots = skeleton.roots;

  const sections: string[] = [];
  let pendingOrphans: Orphan[] = [];
  let orphanCursor = 0;

  function flushOrphansBefore(order: number): Orphan[] {
    const collected: Orphan[] = [];
    while (orphanCursor < orphans.length && orphans[orphanCursor].order < order) {
      collected.push(orphans[orphanCursor]);
      orphanCursor += 1;
    }
    return collected;
  }

  function renderOrphanBullet(orphan: Orphan, governingText: string): string[] {
    if (orphan.kind === "verbless") {
      return [`- ${quote(orphan.text)}`, `  * ${verblessLine(governingText)}`, ...participleLinesFor(null, `${orphan.chapter}:${orphan.verse}`).map(line => `  * ${line}`)];
    }
    const parkedClause = clauseById.get(orphan.node.finiteVerbId);
    const lines: string[] = [];
    lines.push(`- ${quote(orphan.node.spanText)}`);
    if (parkedClause) {
      for (const explanation of dependentExplanationLines(orphan.node, parkedClause)) {
        lines.push(`  * ${explanation}`);
      }
    }
    lines.push(`  * Pendiente de colocación en O — el sustantivo que describe aún no está ubicado en el árbol de cláusulas.`);
    for (const child of orphan.node.children) lines.push(...renderNode(child, 1));
    return lines;
  }

  function childOrder(node: SkeletonNode): number {
    return clauseById.get(node.finiteVerbId)?.order ?? Infinity;
  }

  // A demonstrative (morph "RD...", e.g. Τούτου) opening a clause, same
  // tolerant leading-window check findLeadingMarkerToken already uses for
  // relative pronouns — Titus 1:5:3's "Τούτου χάριν" is a legitimate deictic
  // root, so this alone is never conclusive; it's a cheap tripwire, not a
  // grammatical verdict.
  function opensWithRelativeOrDemonstrative(clause: CompilerClause): boolean {
    if (findLeadingMarkerToken(clause.beginningTokens).kind === "relative") return true;
    return clause.beginningTokens.slice(0, 4).some(token => token.morph.startsWith("RD"));
  }

  for (const root of roots) {
    const clause = clauseById.get(root.finiteVerbId);
    if (!clause) {
      warnings.push(`${root.reference} (${root.finiteVerbId}): root clause missing beginning-token data — skipped.`);
      continue;
    }
    pendingOrphans = flushOrphansBefore(clause.order);

    // Per the spec: a dependent (or folded-in orphan) that textually precedes
    // the root itself renders before H4, in real document order — nesting
    // shows the relationship, vertical position follows the text. Orphans
    // are always "before" by construction (that's why they were still
    // buffered when this root was reached); a root's own direct children can
    // occasionally precede it too (e.g. a relative clause riding a noun
    // earlier in the same sentence).
    const beforeChildren = root.children.filter(child => childOrder(child) < clause.order);
    const afterChildren = root.children.filter(child => childOrder(child) >= clause.order);

    const beforeItems = [
      ...pendingOrphans.map(orphan => ({ order: orphan.order, render: () => renderOrphanBullet(orphan, root.spanText || clause.finiteVerbText) })),
      ...beforeChildren.map(child => ({ order: childOrder(child), render: () => renderNode(child, 0) }))
    ].sort((a, b) => a.order - b.order);

    if (opensWithRelativeOrDemonstrative(clause) && pendingOrphans.length) {
      warnings.push(
        `${root.reference} (${root.finiteVerbId}): opens with a relative pronoun or demonstrative and sits next to unplaced material — verify this is really root, not a Q1 description of something in that material (the Tito 1:2:6 pattern).`
      );
    }

    const earliestVerse = beforeItems.length
      ? Math.min(
          clause.verse,
          ...pendingOrphans.map(orphan => (orphan.kind === "verbless" ? orphan.verse : clauseById.get(orphan.node.finiteVerbId)?.verse ?? clause.verse)),
          ...beforeChildren.map(child => clauseById.get(child.finiteVerbId)?.verse ?? clause.verse)
        )
      : clause.verse;
    const reference = earliestVerse === clause.verse ? `Tito ${clause.chapter}:${clause.verse}` : `Tito ${clause.chapter}:${earliestVerse}–${clause.verse}`;

    const block: string[] = [];
    block.push(`### ${reference}`);
    block.push("");

    if (beforeItems.length) {
      for (const item of beforeItems) block.push(...item.render());
      block.push("");
    }

    block.push(`#### ${quote(root.spanText || clause.finiteVerbText)}`);
    for (const explanation of rootExplanationLines(clause)) {
      block.push(`* ${explanation}`);
    }
    for (const participleExplanation of participleLinesFor(root.finiteVerbId, null)) {
      block.push(`* ${participleExplanation}`);
    }

    if (afterChildren.length) {
      block.push("");
      for (const child of afterChildren) block.push(...renderNode(child, 0));
    }

    sections.push(block.join("\n"));
  }

  const leftoverOrphans = orphans.slice(orphanCursor);
  if (leftoverOrphans.length) {
    const block: string[] = [];
    block.push("### Pendiente de colocación");
    block.push("");
    block.push("_Material sin cláusula raíz posterior en el libro — pendiente de colocación manual._");
    block.push("");
    for (const orphan of leftoverOrphans) {
      block.push(...renderOrphanBullet(orphan, "(sin cláusula gobernante identificada)"));
    }
    sections.push(block.join("\n"));
    warnings.push(`${leftoverOrphans.length} orphan item(s) had no following root clause to fold into — placed in a final "Pendiente de colocación" section.`);
  }

  const header = ["# TODO: contexto", "", "## TODO: unidad", ""].join("\n");
  const markdown = [header, ...sections].join("\n\n");

  return {
    markdown,
    clauseCount: clauses.length,
    verblessCount: verbless.length,
    pendingCount: skeleton.parked.length,
    warnings
  };
}
