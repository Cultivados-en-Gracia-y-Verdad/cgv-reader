// Compiler — manual skeleton generator. Reads O's live data (same localStorage
// O itself reads/writes — see clause-data.ts's ClauseObservations/
// ParticipleObservations exports) and mechanically produces a markdown
// skeleton: structure, Scripture text, and grammatical explanations, ready
// for a human writer to add commentary to. Never writes theological or
// interpretive content — only what's already been observed in O.
//
// Per the confirmed spec: YAML frontmatter is separate metadata (form on the
// right). H1/H2 are context only (not the outline). The outline is the
// skeleton: "####" / "-" / "+" / "*" — indentation (left→right) shows
// structural depth. Presentation rule: every blank line starts a new slide.
// H3 line carries the unit claim (reference — root clause) on its own slide
// (blank after H3). Reading quotes follow as the next slide. Each ####/-/+/ *
// is its own slide; gathering comments each get their own slide too.

import {
  formatClauseSpan,
  getClauseBeginningTokens,
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
import { createDefaultManualMeta, formatYamlFrontmatter, type ManualMeta } from "./compiler-meta";
import { readReaderNotes, readerNoteCommentLines, verseKeysFromNoteTarget } from "./compiler-gathering";

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

/**
 * Scripture-only surface (locked): markdown italics `*…*`.
 * Reserved for H3 claim, reading quotes, #### / - / +, and antecedent lines.
 * Grammar-note lines still open with `* ` (marker + space) and stay roman;
 * metalinguistic tokens there use straight "…". Scripture named inside a note
 * also uses `*…*` (same reserved style).
 */
function scripture(text: string): string {
  return `*${text.trim()}*`;
}

/** One presentation slide: marker (or heading) line, optional comment lines, then a blank. */
function slide(markerLine: string, comments: string[] = []): string[] {
  return [markerLine, ...comments, ""];
}

/** Emit `*` slides; drop identical back-to-back explanations. */
function starSlides(indent: string, explanations: string[]): string[] {
  const lines: string[] = [];
  let previous = "";
  for (const explanation of explanations) {
    const normalized = explanation.trim();
    if (!normalized || normalized === previous) continue;
    previous = normalized;
    lines.push(...slide(`${indent}* ${normalized}`));
  }
  return lines;
}

/** Each plain comment on its own slide — keeps presentation slides short. */
function commentSlides(comments: string[]): string[] {
  const lines: string[] = [];
  for (const comment of comments) {
    const normalized = comment.trimEnd();
    if (!normalized.trim()) continue;
    lines.push(...slide(normalized));
  }
  return lines;
}

/** Grammar labels: Spanish first, then Greek in parentheses when available. */
function labeledWord(spanish: string, greek?: string | null): string {
  const es = spanish.trim();
  const gr = (greek ?? "").trim();
  if (gr && gr !== es) return `"${es}" (${gr})`;
  return `"${es}"`;
}

/** Relative markers commonly visible in LBF Spanish when Greek range starts late. */
function spanishRelativeFromText(text: string): string | null {
  const match = text.match(/\b(la cual|el cual|los cuales|las cuales|quienes|quien)\b/i);
  return match ? match[1] : null;
}

/**
 * Parked Q1 spans sometimes include the antecedent noun at the front
 * ("vida eterna, la cual…"). Strip that prefix so the `-` line is the clause
 * and the antecedent sits on its own Scripture line underneath.
 */
function stripLeadingAntecedent(spanText: string, antecedent: string): string {
  const span = spanText.trim();
  const ant = antecedent.trim();
  if (!ant || !span.toLowerCase().startsWith(ant.toLowerCase())) return span;
  const stripped = span.slice(ant.length).replace(/^[\s,;:]+/, "").trim();
  return stripped || span;
}

// Grammar notes are for Spanish-speaking readers/writers. Keep them in plain
// language (roughly 5th-grade Spanish): state what the word is doing and why
// that is certain from the grammar — never theology or "what this means for us."
// Every "{word}" is the Spanish alignment for that Greek token (via BLE), never
// the Greek surface — except coordinate-inheritance's shared particle, which
// names a DIFFERENT clause's marker and must stay Greek to identify it.
function relationalConnectorLine(spanish: string, lemma: string, greek?: string | null): string {
  const word = labeledWord(spanish, greek);
  switch (lemma) {
    case "καί":
      return `${word} une esta frase a la anterior. Solo suma; no cambia el sentido ni da una razón.`;
    case "ἀλλά":
      return `${word} marca un giro: lo que sigue va en otra dirección respecto a lo anterior.`;
    case "γάρ":
    case "διότι":
      return `${word} da la razón de lo que se dijo antes.`;
    case "οὖν":
      return `${word} saca una conclusión de lo que se dijo antes.`;
    case "δέ":
      return `${word} sigue la idea anterior y la une a esta frase.`;
    default:
      return `${word} une esta frase a la anterior.`;
  }
}

const ASYNDETON_LINE =
  "Esta frase empieza sola, sin una palabra de enlace (como «y» o «porque»).";

function subordinatingLine(
  frameType: FrameType | undefined,
  isContent: boolean,
  isDescribes: boolean,
  spanish: string,
  greek: string | null,
  parentVerbText: string | null,
  describedNounText: string | null
): string {
  const word = labeledWord(spanish, greek);
  if (isContent) {
    return `${word} abre lo que se dice o se piensa en la frase anterior — el contenido de esa idea.`;
  }
  if (isDescribes) {
    const noun = describedNounText ? scripture(describedNounText) : "alguien o algo mencionado antes";
    return `${word} abre una frase que habla más de ${noun}.`;
  }
  const parent = parentVerbText?.trim() || "la frase anterior";
  switch (frameType) {
    case "purpose":
      return `${word} dice el propósito de «${parent}» — para qué se hace esa acción.`;
    case "reason":
      return `${word} da el motivo de la frase anterior — por qué se dijo eso.`;
    case "condition":
      return `${word} pone una condición: «si esto…», entonces aplica lo de la frase anterior.`;
    case "time":
      return `${word} dice el momento relacionado con la frase anterior — cuándo.`;
    default:
      return ASYNDETON_LINE;
  }
}

function inheritanceLine(sharedParticleGreek: string, connectorSpanish: string, relationKey: string): string {
  const gender = RELATION_TYPE_GENDER[relationKey] ?? RELATION_TYPE_GENDER.reason;
  return (
    `Esta frase va unida con «${connectorSpanish}» y sigue bajo el mismo «${sharedParticleGreek}» ` +
    `de la frase anterior. No abre ${gender.indefiniteArticle} ${gender.noun} nuev${gender.adjectiveEnding}; ` +
    `continúa ${gender.definiteArticle} mism${gender.adjectiveEnding}.`
  );
}

function participleLine(
  classification: "attributive" | "substantival" | "circumstantial",
  spanish: string,
  greek: string | null,
  describedNounText: string | null,
  finiteVerbText: string | null
): string {
  const word = labeledWord(spanish, greek);
  if (classification === "attributive") {
    const noun = describedNounText ? scripture(describedNounText) : "alguien o algo cercano";
    return `${word} describe a ${noun}. No es el verbo principal; añade detalle sobre esa persona o cosa.`;
  }
  if (classification === "substantival") {
    return `${word} funciona como un nombre: señala a una persona o cosa (quién / qué), no solo describe a otra.`;
  }
  const host = finiteVerbText?.trim() || "el verbo principal cercano";
  return (
    `${word} va junto a «${host}». No es el verbo principal; muestra algo que ocurre ` +
    `al mismo tiempo o en relación con esa acción.`
  );
}

/** Complement infinitive under its host finite — names the chain in plain language. */
function infinitiveLine(
  spanish: string,
  greek: string | null,
  hostSpanish: string | null,
  hostGreek: string | null
): string {
  const word = labeledWord(spanish, greek);
  if (hostSpanish?.trim()) {
    const host = labeledWord(hostSpanish, hostGreek);
    return `${word} completa a ${host}: dice *qué* se debe hacer o qué acción sigue.`;
  }
  return `${word} nombra una acción que depende de un verbo cercano (como «debe» o «pide»).`;
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
export function generateManualSkeleton(meta?: ManualMeta): GeneratedDoc {
  const warnings: string[] = [];
  const verses = loadTitusClauseVerses();
  const assignments = readClauseAssignments();
  const observations = readClauseObservations();
  const participleObservations = readParticipleObservations();
  const readerNotes = readReaderNotes();
  // Reader notes emit once under the first parent that claims their verse.
  // Def/XRef pins attach after Generate; rematched by line text on regenerate
  // (see compiler-gathering).
  const emittedNoteIds = new Set<string>();

  function takeReaderNoteComments(chapter: number, verse: number, indent = ""): string[] {
    const verseKey = `${chapter}:${verse}`;
    const lines: string[] = [];
    for (const note of readerNotes) {
      if (!note.text.trim()) continue;
      if (!verseKeysFromNoteTarget(note.target).includes(verseKey)) continue;
      const id = `note:${note.id}`;
      if (emittedNoteIds.has(id)) continue;
      emittedNoteIds.add(id);
      for (const line of readerNoteCommentLines(chapter, verse, [note])) {
        lines.push(`${indent}${line}`);
      }
    }
    return lines;
  }

  const wordById = new Map<string, SpanishWord>();
  const wordsByVerse = new Map<string, SpanishWord[]>();
  const verseTextByKey = new Map<string, string>();
  const wordByParticipleId = new Map<string, SpanishWord>();
  const infinitiveWords: SpanishWord[] = [];
  for (const verse of verses) {
    wordsByVerse.set(`${verse.chapter}:${verse.verse}`, verse.words);
    verseTextByKey.set(`${verse.chapter}:${verse.verse}`, verse.text);
    for (const word of verse.words) {
      wordById.set(word.id, word);
      if (word.participleId) wordByParticipleId.set(word.participleId, word);
      if (word.infinitiveId) infinitiveWords.push(word);
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

  function participleExplanationsFor(
    finiteVerbId: string | null,
    verseKey: string | null,
    onlyWordIds?: Set<string> | null
  ): string[] {
    // Prefer clause attachment; verse-key is only for material with no clause row.
    // Never concatenate both lists — that duplicated the same participle note.
    const ids = finiteVerbId
      ? (participlesByClauseId.get(finiteVerbId) ?? [])
      : verseKey
        ? (participlesByVerseKey.get(verseKey) ?? [])
        : [];
    const seen = new Set<string>();
    const explanations: string[] = [];
    for (const participleId of ids) {
      if (seen.has(participleId)) continue;
      seen.add(participleId);
      const classification = resolveParticipleClassification(participleObservations[participleId]);
      if (!classification) continue;
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      if (onlyWordIds && !onlyWordIds.has(word.id)) continue;
      const observation = participleObservations[participleId];
      const describedNounText = spanTextAtItsOwnVerse(observation?.describedNounSpan);
      const ridingVerb =
        classification === "circumstantial" && observation?.ridingClauseId
          ? finiteVerbWordById.get(observation.ridingClauseId)?.text ?? null
          : null;
      const greek = word.participleSurface ?? word.greekSurface ?? null;
      explanations.push(participleLine(classification, word.text, greek, describedNounText, ridingVerb));
    }
    return explanations;
  }

  function emitParticipleSlides(
    indent: string,
    finiteVerbId: string | null,
    verseKey: string | null,
    onlyWordIds?: Set<string> | null
  ): string[] {
    // Antecedent noun is already named inside the `*` prose — do not emit a
    // second Scripture line after the note (that looked like a misplaced comment).
    return starSlides(indent, participleExplanationsFor(finiteVerbId, verseKey, onlyWordIds));
  }

  // Infinitives attach like participles: prefer the clause whose span contains
  // the infinitive word; else nearest same-verse clause; else verse-key for `+`.
  const infinitiveClauseAssignment = new Map<string, string | null>();
  for (const word of infinitiveWords) {
    const infinitiveId = word.infinitiveId;
    if (!infinitiveId) continue;
    const exactClauseId = wordIdToClauseId.get(word.id);
    if (exactClauseId) {
      infinitiveClauseAssignment.set(infinitiveId, exactClauseId);
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
    infinitiveClauseAssignment.set(infinitiveId, nearestId);
  }

  const infinitivesByClauseId = new Map<string, SpanishWord[]>();
  const infinitivesByVerseKey = new Map<string, SpanishWord[]>();
  for (const word of infinitiveWords) {
    const infinitiveId = word.infinitiveId;
    if (!infinitiveId) continue;
    const targetClauseId = infinitiveClauseAssignment.get(infinitiveId) ?? null;
    if (targetClauseId) {
      const list = infinitivesByClauseId.get(targetClauseId) ?? [];
      list.push(word);
      infinitivesByClauseId.set(targetClauseId, list);
    } else {
      const key = `${word.chapter}:${word.verse}`;
      const list = infinitivesByVerseKey.get(key) ?? [];
      list.push(word);
      infinitivesByVerseKey.set(key, list);
    }
  }

  function infinitiveExplanationsFor(
    finiteVerbId: string | null,
    verseKey: string | null,
    onlyWordIds?: Set<string> | null
  ): string[] {
    const words = finiteVerbId
      ? (infinitivesByClauseId.get(finiteVerbId) ?? [])
      : verseKey
        ? (infinitivesByVerseKey.get(verseKey) ?? [])
        : [];
    const hostWord = finiteVerbId ? finiteVerbWordById.get(finiteVerbId) ?? null : null;
    const hostSpanish = hostWord?.text ?? null;
    const hostGreek = hostWord?.greekSurface ?? null;
    const explanations: string[] = [];
    const seen = new Set<string>();
    for (const word of words) {
      if (!word.infinitiveId || seen.has(word.infinitiveId)) continue;
      seen.add(word.infinitiveId);
      if (onlyWordIds && !onlyWordIds.has(word.id)) continue;
      explanations.push(
        infinitiveLine(word.text, word.infinitiveSurface ?? word.greekSurface ?? null, hostSpanish, hostGreek)
      );
    }
    return explanations;
  }

  function emitInfinitiveSlides(
    indent: string,
    finiteVerbId: string | null,
    verseKey: string | null,
    onlyWordIds?: Set<string> | null
  ): string[] {
    return starSlides(indent, infinitiveExplanationsFor(finiteVerbId, verseKey, onlyWordIds));
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

  interface DependentRender {
    // Antecedent noun quoted as Scripture at the comment site — not only named
    // inside the grammatical prose — when Q1 describes a span outside this clause.
    antecedentText: string | null;
    explanations: string[];
  }

  function dependentRender(node: SkeletonNode, clause: CompilerClause): DependentRender {
    if (coordinateContinuationIds.has(node.finiteVerbId)) {
      const connectorMarker = findLeadingMarkerToken(clause.beginningTokens);
      const connectorWord = connectorMarker.kind === "coordinator" ? connectorMarker.token.ble : "";
      const origin = findOriginatingMarker(clause);
      if (origin && origin.marker.kind !== "none") {
        return { antecedentText: null, explanations: [inheritanceLine(origin.marker.token.greek, connectorWord, origin.relationKey)] };
      }
      warnings.push(`${node.reference} (${node.finiteVerbId}): coordinate-inherited but no originating marker found — check manually.`);
      return { antecedentText: null, explanations: [inheritanceLine("?", connectorWord, "reason")] };
    }

    let marker = findLeadingMarkerToken(clause.beginningTokens);
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

    // Common truncation (Tito 3:5:8): Spanish span is "hicimos…" but the
    // relative ἃ / "que" sits one token before the saved Greek start. Peek
    // slightly earlier so the explanation can still name the marker, and flag
    // the range for repair in O.
    if (marker.kind === "none" && isDescribes) {
      const assignment = assignments[clause.finiteVerbId];
      const startParts = assignment?.greekStartTokenId?.split(":").map(Number);
      if (assignment?.greekEndTokenId && startParts && startParts.length === 3 && startParts[2] > 1) {
        const expandedStart = `${startParts[0]}:${startParts[1]}:${Math.max(1, startParts[2] - 2)}`;
        const expandedTokens = getClauseBeginningTokens({
          greekStartTokenId: expandedStart,
          greekEndTokenId: assignment.greekEndTokenId
        });
        const retry = findLeadingMarkerToken(expandedTokens);
        if (retry.kind === "relative") {
          marker = retry;
          warnings.push(
            `${node.reference} (${node.finiteVerbId}): relative pronoun sits just outside the saved Greek start — expand the Greek range in O to include it.`
          );
        }
      }
    }

    if (marker.kind === "none") {
      // Real case in the data (Tito 2:14:13): O already resolved this as a
      // dependent clause (relation/frameType answered directly, not
      // inherited), but its own leading window doesn't carry a recognized
      // particle — likely marked before coordinate-inheritance existed, or a
      // stale Greek range. Distinct from root asyndeton (a genuine, expected
      // finding) — this is a gap to flag, not a normal outcome.
      warnings.push(`${node.reference} (${node.finiteVerbId}): no leading marker detected for a resolved dependent clause — check the Greek range and coordinate-inheritance status manually.`);
      return {
        antecedentText: describedNounText,
        explanations: [
          "No se ve al frente una palabra de enlace clara (como «para que», «porque» o «la cual»). Revise el rango griego en Observador."
        ]
      };
    }

    const spanish = marker.token.ble;
    const greek = marker.token.greek;
    return {
      antecedentText: isDescribes ? describedNounText : null,
      explanations: [
        subordinatingLine(node.frameType, isContent, isDescribes, spanish, greek, parentVerbText, describedNounText)
      ]
    };
  }

  function rootExplanationLines(clause: CompilerClause): string[] {
    const marker = findLeadingMarkerToken(clause.beginningTokens);
    if (marker.kind === "none") return [ASYNDETON_LINE];
    if (marker.kind === "relative") {
      // A relative pronoun opening what's already resolved as an independent
      // clause is the "relative of connection" idiom (see clause-signals.ts) —
      // functions as a connector, not a description, so it still gets a
      // relational line, using its own Spanish alignment.
      return [relationalConnectorLine(marker.token.ble, "δέ", marker.token.greek)];
    }
    if (marker.kind === "coordinator") {
      return [relationalConnectorLine(marker.token.ble, marker.lemma, marker.token.greek)];
    }
    if (marker.kind === "frame") {
      return [relationalConnectorLine(marker.token.ble, marker.token.lemma.trim(), marker.token.greek)];
    }
    return [ASYNDETON_LINE];
  }

  function renderNode(node: SkeletonNode, depth: number): string[] {
    const clause = clauseById.get(node.finiteVerbId);
    const lines: string[] = [];
    // Indent = structural depth (left→right outline). Children sit further right.
    const indent = "  ".repeat(depth);

    if (!clause) {
      lines.push(...slide(`${indent}- ${scripture(node.spanText || node.reference)}`));
      lines.push(...slide(`${indent}* Aún no está colocado en Observador — falta responder las preguntas de esta frase.`));
      warnings.push(`${node.reference} (${node.finiteVerbId}): no beginning-token data available — check manually.`);
      return lines;
    }

    const dependent = dependentRender(node, clause);
    // Clause slide: Scripture marker + at most the antecedent. Gathering notes
    // and `*` each get their own slide so one slide stays presentable.
    const antecedent = dependent.antecedentText ? [`${indent}${scripture(dependent.antecedentText)}`] : [];
    lines.push(...slide(`${indent}- ${scripture(node.spanText || clause.finiteVerbText)}`, antecedent));
    lines.push(...commentSlides(takeReaderNoteComments(clause.chapter, clause.verse, indent)));
    lines.push(...starSlides(indent, dependent.explanations));
    lines.push(...emitInfinitiveSlides(indent, node.finiteVerbId, null));
    lines.push(...emitParticipleSlides(indent, node.finiteVerbId, null));
    for (const child of node.children) {
      lines.push(...renderNode(child, depth + 1));
    }
    return lines;
  }

  // Every Spanish word not inside any finite-clause span must appear as `+`
  // (whole verbless verses and intra-verse gaps alike). Parked finite clauses
  // still fold in as `-` under the following root.
  type Orphan =
    | { kind: "phrase"; order: number; chapter: number; verse: number; text: string; wordIds: string[] }
    | { kind: "parked"; order: number; node: ParkedClause };

  const coveredWordIds = new Set<string>();
  for (const info of clauseSpanInfos) {
    for (const id of info.wordIds) coveredWordIds.add(id);
  }

  const phraseGaps: Extract<Orphan, { kind: "phrase" }>[] = [];
  for (const verse of verses) {
    const verseWords = verse.words;
    let run: SpanishWord[] = [];
    const flushRun = () => {
      if (!run.length) return;
      const wordIds = run.map(word => word.id);
      const text = formatClauseSpan(wordIds, verseWords, verse.text).trim();
      if (text) {
        phraseGaps.push({
          kind: "phrase",
          order: verse.chapter * 100000 + verse.verse * 1000 + run[0].index,
          chapter: verse.chapter,
          verse: verse.verse,
          text,
          wordIds
        });
      }
      run = [];
    };
    for (const word of verseWords) {
      if (coveredWordIds.has(word.id)) flushRun();
      else run.push(word);
    }
    flushRun();
  }

  const orphans: Orphan[] = [
    ...phraseGaps,
    ...skeleton.parked.map(node => ({
      kind: "parked" as const,
      order: clauseById.get(node.finiteVerbId)?.order ?? 0,
      node
    }))
  ].sort((a, b) => a.order - b.order);

  // deriveSkeleton already sorts topLevelIds by document order before
  // building nodes, so skeleton.roots is already in the right walk order.
  const roots = skeleton.roots;

  // Parked = Q1 describes a noun that isn't inside any clause row yet (often
  // verbless material). Compiler still places them chronologically in the
  // next root's unit as "-" — O must finish attachment; flags list each one.
  for (const parked of skeleton.parked) {
    warnings.push(
      `${parked.reference} (${parked.finiteVerbId}): parked in O — describes a noun not yet inside a clause row; emitted in document order under the following root until placed.`
    );
  }

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

  function renderOrphanBullet(orphan: Orphan, _governingText: string): string[] {
    if (orphan.kind === "phrase") {
      // "+" = Scripture not inside any finite-clause span (verbless verse or gap).
      const lines = slide(`+ ${scripture(orphan.text)}`);
      lines.push(...commentSlides(takeReaderNoteComments(orphan.chapter, orphan.verse)));
      const phraseWords = new Set(orphan.wordIds);
      lines.push(...emitInfinitiveSlides("", null, `${orphan.chapter}:${orphan.verse}`, phraseWords));
      lines.push(...emitParticipleSlides("", null, `${orphan.chapter}:${orphan.verse}`, phraseWords));
      return lines;
    }
    // Parked finite clause (Q1 noun not inside any clause row yet): still emit as "-"
    // in document order under this unit. Flagged in warnings — not restated in the body.
    // Always emit the relative-description `*` so the antecedent line is not left bare.
    const parkedClause = clauseById.get(orphan.node.finiteVerbId);
    const lines: string[] = [];
    const dependent = parkedClause ? dependentRender(orphan.node, parkedClause) : null;
    const antecedentText =
      dependent?.antecedentText ?? spanTextAtItsOwnVerse(orphan.node.describedNounSpan);
    const clauseText = antecedentText
      ? stripLeadingAntecedent(orphan.node.spanText, antecedentText)
      : orphan.node.spanText;
    const antecedent = antecedentText ? [scripture(antecedentText)] : [];
    lines.push(...slide(`- ${scripture(clauseText)}`, antecedent));
    if (parkedClause) {
      lines.push(...commentSlides(takeReaderNoteComments(parkedClause.chapter, parkedClause.verse)));
    }

    let explanations = dependent?.explanations ?? [];
    const relativeSpanish =
      spanishRelativeFromText(clauseText) ?? spanishRelativeFromText(orphan.node.spanText);
    const looksLikeDescribes =
      orphan.node.relation === "describes" || orphan.node.describedNounSpan.length > 0;
    if (looksLikeDescribes) {
      const noun = antecedentText ? scripture(antecedentText) : "un sustantivo anterior";
      if (relativeSpanish) {
        explanations = [`"${relativeSpanish}" abre una frase que habla más de ${noun}.`];
      } else if (!explanations.some(line => /habla más de|describe/i.test(line))) {
        explanations = [`Esta frase habla más de ${noun}.`, ...explanations];
      }
    }
    lines.push(...starSlides("", explanations));
    lines.push(...emitInfinitiveSlides("", orphan.node.finiteVerbId, null));
    lines.push(...emitParticipleSlides("", orphan.node.finiteVerbId, null));
    for (const child of orphan.node.children) lines.push(...renderNode(child, 1));
    return lines;
  }

  function childOrder(node: SkeletonNode): number {
    return clauseById.get(node.finiteVerbId)?.order ?? Infinity;
  }

  // Full-book verse list in document order — the reading spine walks this so
  // every LBF verse is quoted exactly once under whichever unit first needs it.
  const allBookVerses = verses
    .map(verse => ({
      chapter: verse.chapter,
      verse: verse.verse,
      order: verse.chapter * 100000 + verse.verse * 1000,
      text: verse.text
    }))
    .sort(byOrder);
  let readingCursor = 0;

  function collectTreeVerseOrders(node: SkeletonNode, into: number[]): void {
    const treeClause = clauseById.get(node.finiteVerbId);
    if (treeClause) into.push(treeClause.order);
    for (const child of node.children) collectTreeVerseOrders(child, into);
  }

  function flushReadingBlockThrough(maxOrder: number): string[] {
    const quotes: string[] = [];
    while (readingCursor < allBookVerses.length && allBookVerses[readingCursor].order <= maxOrder) {
      const entry = allBookVerses[readingCursor];
      readingCursor += 1;
      if (!entry.text.trim()) continue;
      quotes.push(scripture(entry.text.trim()));
    }
    if (!quotes.length) return [];
    // One slide with H3: no blank lines between verse quotes (blank = new slide).
    // Trailing blank ends this slide before the outline items.
    return [...quotes, ""];
  }

  // Tito 1:2:6 pattern: a relative pronoun opening a "root" that actually
  // describes a noun in still-unplaced material. Demonstratives alone are NOT
  // this pattern — Ταῦτα λάλει (2:15) and Τούτου χάριν (1:5) are ordinary
  // deictic openings of real independent clauses.
  function opensWithRelativePronoun(clause: CompilerClause): boolean {
    return findLeadingMarkerToken(clause.beginningTokens).kind === "relative";
  }

  for (const root of roots) {
    const clause = clauseById.get(root.finiteVerbId);
    if (!clause) {
      warnings.push(`${root.reference} (${root.finiteVerbId}): root clause missing beginning-token data — skipped.`);
      continue;
    }
    pendingOrphans = flushOrphansBefore(clause.order);

    // Orphans always precede this root by construction. Direct children may
    // too (e.g. a relative riding a noun earlier in the sentence). Outline
    // bullets stay in document order; the unit claim is on the H3 heading
    // line itself (reference — root clause), not a #### on that slide.
    const beforeChildren = root.children.filter(child => childOrder(child) < clause.order);
    const afterChildren = root.children.filter(child => childOrder(child) >= clause.order);

    const beforeItems = [
      ...pendingOrphans.map(orphan => ({
        order: orphan.order,
        render: () => renderOrphanBullet(orphan, root.spanText || clause.finiteVerbText)
      })),
      ...beforeChildren.map(child => ({ order: childOrder(child), render: () => renderNode(child, 0) }))
    ].sort((a, b) => a.order - b.order);

    if (opensWithRelativePronoun(clause) && pendingOrphans.length) {
      warnings.push(
        `${root.reference} (${root.finiteVerbId}): opens with a relative pronoun and sits next to unplaced material — verify this is really root, not a Q1 description of something in that material (the Tito 1:2:6 pattern).`
      );
    }

    const earliestVerse = beforeItems.length
      ? Math.min(
          clause.verse,
          ...pendingOrphans.map(orphan =>
            orphan.kind === "phrase"
              ? orphan.verse
              : clauseById.get(orphan.node.finiteVerbId)?.verse ?? clause.verse
          ),
          ...beforeChildren.map(child => clauseById.get(child.finiteVerbId)?.verse ?? clause.verse)
        )
      : clause.verse;

    const sectionOrders: number[] = [clause.order];
    for (const orphan of pendingOrphans) {
      sectionOrders.push(orphan.order);
      if (orphan.kind === "parked") collectTreeVerseOrders(orphan.node, sectionOrders);
    }
    collectTreeVerseOrders(root, sectionOrders);
    const sectionMaxOrder = Math.max(...sectionOrders);
    // sectionMaxOrder encodes chapter*100000+verse*1000 (+ token); recover chapter/verse for the heading end.
    const latestChapter = Math.floor(sectionMaxOrder / 100000) || clause.chapter;
    const latestVerseNumber = Math.floor((sectionMaxOrder % 100000) / 1000) || clause.verse;

    const reference =
      earliestVerse === latestVerseNumber && clause.chapter === latestChapter
        ? `Tito ${clause.chapter}:${clause.verse}`
        : earliestVerse === latestVerseNumber
          ? `Tito ${clause.chapter}:${earliestVerse}`
          : latestChapter === clause.chapter
            ? `Tito ${clause.chapter}:${earliestVerse}–${latestVerseNumber}`
            : `Tito ${clause.chapter}:${earliestVerse}–${latestChapter}:${latestVerseNumber}`;

    const rootQuote = scripture(root.spanText || clause.finiteVerbText);
    const block: string[] = [];
    // H3 unit claim on its own slide; reading quotes on the next slide.
    block.push(`### ${reference} — ${rootQuote}`);
    block.push("");
    block.push(...flushReadingBlockThrough(sectionMaxOrder));

    // Outline: dependents that precede the root in the text, then #### root,
    // then the rest — document order around the dissected root.
    for (const item of beforeItems) block.push(...item.render());

    block.push(...slide(`#### ${rootQuote}`));
    block.push(...commentSlides(takeReaderNoteComments(clause.chapter, clause.verse)));
    block.push(...starSlides("", rootExplanationLines(clause)));
    block.push(...emitInfinitiveSlides("", root.finiteVerbId, null));
    block.push(...emitParticipleSlides("", root.finiteVerbId, null));

    for (const child of afterChildren) block.push(...renderNode(child, 0));

    sections.push(block.join("\n"));
  }

  const leftoverOrphans = orphans.slice(orphanCursor);
  if (leftoverOrphans.length) {
    const leftoverOrders = leftoverOrphans.map(orphan => orphan.order);
    const leftoverMax = leftoverOrders.length ? Math.max(...leftoverOrders) : 0;
    const block: string[] = [];
    block.push("### Pendiente de colocación");
    if (leftoverMax) {
      const reading = flushReadingBlockThrough(leftoverMax);
      // Keep the note on the same slide as H3 + Scripture (before the trailing blank).
      if (reading.length && reading[reading.length - 1] === "") {
        block.push(...reading.slice(0, -1));
        block.push("_Material sin cláusula raíz posterior en el libro — pendiente de colocación manual._");
        block.push("");
      } else {
        block.push(...reading);
        block.push("_Material sin cláusula raíz posterior en el libro — pendiente de colocación manual._");
        block.push("");
      }
    } else {
      block.push("_Material sin cláusula raíz posterior en el libro — pendiente de colocación manual._");
      block.push("");
    }
    for (const orphan of leftoverOrphans) {
      block.push(...renderOrphanBullet(orphan, "(sin cláusula gobernante identificada)"));
    }
    sections.push(block.join("\n"));
    warnings.push(`${leftoverOrphans.length} orphan item(s) had no following root clause to fold into — placed in a final "Pendiente de colocación" section.`);
  }

  // Any trailing LBF verses not yet claimed by a unit — still must appear.
  const remainingVerseCount = allBookVerses.length - readingCursor;
  if (remainingVerseCount > 0) {
    const block: string[] = [];
    block.push("### Escritura restante");
    block.push(...flushReadingBlockThrough(Number.POSITIVE_INFINITY));
    sections.push(block.join("\n"));
    warnings.push(
      `${remainingVerseCount} verse(s) had no clause unit claiming them — emitted under "Escritura restante" so no Scripture is omitted.`
    );
  }

  const yaml = formatYamlFrontmatter(meta ?? createDefaultManualMeta());
  // H1/H2 = context only (same slide). Blank line before first H3 begins the outline.
  const markdown = [yaml, "", "# TODO: contexto", "## TODO: unidad", "", ...sections].join("\n");

  return {
    markdown,
    clauseCount: clauses.length,
    verblessCount: phraseGaps.length,
    pendingCount: skeleton.parked.length,
    warnings
  };
}
