// Compiler — manual skeleton generator. Reads O's live data (same localStorage
// O itself reads/writes — see clause-data.ts) and mechanically produces a
// markdown skeleton: structure, Scripture text, and grammatical explanations,
// ready for a human writer to add commentary to. Never writes theological or
// interpretive content — only what's already been observed in O.
//
// Per the confirmed spec: YAML frontmatter is separate metadata (form on the
// right). H1/H2 are context only (not the outline). Scripture outline:
//   #### independent (root) clauses
//   -  dependent clauses
//   +  phrases (every other scriptural word)
//   *  Observer mechanical inserts only
//   >  Writer entries (Reader notes, human commentary)
//   Def/XRef pins also use `*` (applied after Generate)
// Indentation (left→right) shows structural depth. Blank line = new slide.
// H3 = unit claim (reference — independent clause). No large reading-block
// verse quotes after H3 — the reference is enough for that. Outline #### /
// - / + still carry LBF span text.

import {
  getReaderBookInfo,
  workshopProgressKeys,
  type ReaderBookId
} from "@cgv/core";
import {
  describeParticipleReading,
  formatClauseSpan,
  getClauseBeginningTokens,
  loadClauseVerses,
  readClauseActors,
  readClauseAssignments,
  readClauseObservations,
  readMarkedAlignmentIds,
  readParticipleSubjectHosts,
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
import { getWorkshopBookId } from "../observer/workshop-book";
import { createDefaultManualMeta, formatYamlFrontmatter, type ManualMeta } from "./compiler-meta";
import { readReaderNotes, readerNoteCommentLines, verseKeysFromNoteTarget } from "./compiler-gathering";

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
 * Scripture surface (locked): markdown italics `*…*`.
 * Used for H3 claim, #### / - / +, antecedent lines, and short tokens inside
 * grammar notes. Large reading-block verse dumps after H3 are not emitted.
 * Greek confirmation in notes stays in parentheses: `*para que* (ἵνα)`.
 * Pedagogical non-passage examples use «…».
 */
function scripture(text: string): string {
  return `*${text.trim()}*`;
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

/**
 * Passage Spanish (italics) first, optional Greek confirmation in parentheses.
 * Never quote Scripture with "…" or «…» — those are not the locked surface.
 */
function labeledWord(spanish: string, greek?: string | null): string {
  const es = scripture(spanish);
  const gr = (greek ?? "").trim();
  if (gr && gr !== spanish.trim()) return `${es} (${gr})`;
  return es;
}

/** Relative markers commonly visible in LBF Spanish when Greek range starts late. */
function spanishRelativeFromText(text: string): string | null {
  const match = text.match(/\b(la cual|el cual|los cuales|las cuales|quienes|quien)\b/i);
  return match ? match[1] : null;
}

// Grammar notes are for Spanish-speaking readers/writers. Fully expound in
// plain 5th-grade Spanish: say what the word is, what it does in the sentence,
// and what it is not. Never theology or "what this means for us."
// Every "{word}" is the Spanish alignment for that Greek token (via BLE), never
// the Greek surface — except coordinate-inheritance's shared particle, which
// names a DIFFERENT clause's marker and must stay Greek to identify it.
function relationalConnectorLine(spanish: string, lemma: string, greek?: string | null): string {
  const word = labeledWord(spanish, greek);
  switch (lemma) {
    case "καί":
      return (
        `${word} es una palabra de enlace. Une esta frase a la frase de antes, ` +
        `como cuando en español decimos «y». Solo suma: añade otra idea a la misma línea. ` +
        `No da una razón, no pone un «pero», y no cambia el sentido de lo que ya se dijo.`
      );
    case "ἀλλά":
      return (
        `${word} es una palabra de contraste. Marca un giro: lo que sigue no sigue ` +
        `en la misma dirección que lo anterior. Es como decir «pero» o «sino»: ` +
        `presta atención, porque la idea nueva se aparta de la idea de antes.`
      );
    case "γάρ":
    case "διότι":
      return (
        `${word} da la razón de lo que se acaba de decir. Después de esta palabra ` +
        `viene el «por qué». No está empezando un tema nuevo: está explicando ` +
        `el fundamento de la frase anterior.`
      );
    case "οὖν":
      return (
        `${word} saca una conclusión de lo que se dijo antes. Es como decir ` +
        `«entonces» o «por eso»: lo siguiente nace de lo anterior. ` +
        `No es una razón nueva; es el siguiente paso lógico.`
      );
    case "δέ":
      return (
        `${word} sigue la idea anterior y la une a esta frase. A veces solo ` +
        `avanza la historia («y…»), y a veces marca un leve contraste («pero…»). ` +
        `En todo caso, no abre un tema suelto: esta frase sigue conectada a la de antes.`
      );
    default:
      return (
        `${word} une esta frase a la anterior. Es una palabra de enlace: ` +
        `muestra que lo que sigue no va solo, sino junto con lo que ya se dijo.`
      );
  }
}

const ASYNDETON_LINE =
  "Esta frase empieza sola, sin una palabra de enlace al frente (como «y», «pero» o «porque»). " +
  "Eso no significa que no tenga relación con lo anterior; solo que el griego no puso " +
  "una palabra de unión visible al comenzar. Léela como un nuevo paso que sigue el hilo, " +
  "aunque no diga «y» ni «entonces».";

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
    return (
      `${word} abre el contenido de la frase anterior: lo que se dice, se sabe o se piensa. ` +
      `Imagina que la frase de arriba es «él dijo…» o «sabemos…»; lo que sigue después de ${word} ` +
      `es precisamente ese mensaje o esa idea. No es una razón ni un «para qué»: ` +
      `es el qué — el contenido mismo.`
    );
  }
  if (isDescribes) {
    const noun = describedNounText ? scripture(describedNounText) : "alguien o algo mencionado antes";
    return (
      `${word} abre una frase que habla más de ${noun}. ` +
      `No es el verbo principal de la sección; es una frase colgada de ese nombre ` +
      `(o de esa persona o cosa). Todo lo que sigue bajo ${word} añade detalle: ` +
      `quién es, cómo es, o qué se dice de ${noun}.`
    );
  }
  const parent = parentVerbText?.trim()
    ? scripture(parentVerbText.trim())
    : "la frase anterior";
  switch (frameType) {
    case "purpose":
      return (
        `${word} dice el propósito de ${parent} — el «para qué» de esa acción. ` +
        `La frase de arriba nombra lo que se hace; esta frase, abierta por ${word}, ` +
        `nombra el fin que se busca. No explica el motivo pasado («porque…»); ` +
        `señala la meta hacia la que apunta la acción.`
      );
    case "reason":
      return (
        `${word} da el motivo de la frase anterior — el «por qué». ` +
        `Lo de arriba afirma algo; lo que sigue después de ${word} explica ` +
        `por qué se dijo o por qué es así. No es el propósito futuro («para que…»); ` +
        `es la razón o el fundamento.`
      );
    case "condition":
      return (
        `${word} pone una condición: «si esto…». ` +
        `Lo que sigue no se afirma como un hecho seguro por sí solo; ` +
        `depende de que se cumpla esa condición. Relaciónala con la frase anterior: ` +
        `bajo esa condición aplica lo que ya se dijo (o lo que sigue).`
      );
    case "time":
      return (
        `${word} marca el momento relacionado con la frase anterior — el «cuándo». ` +
        `No da la razón ni el propósito; ubica en el tiempo: ` +
        `cuándo ocurre, ocurrió u ocurrirá lo que se está diciendo.`
      );
    default:
      return ASYNDETON_LINE;
  }
}

function inheritanceLine(sharedParticleGreek: string, connectorSpanish: string, relationKey: string): string {
  const gender = RELATION_TYPE_GENDER[relationKey] ?? RELATION_TYPE_GENDER.reason;
  const connector = scripture(connectorSpanish);
  // Shared particle stays Greek (identifies a different clause's marker).
  return (
    `Esta frase va unida con ${connector} y sigue bajo el mismo «${sharedParticleGreek}» ` +
    `de la frase anterior. Eso importa: no está abriendo ${gender.indefiniteArticle} ${gender.noun} ` +
    `nuev${gender.adjectiveEnding} por su cuenta. Sigue dentro de ${gender.definiteArticle} mism${gender.adjectiveEnding} ` +
    `${gender.noun} que ya se abrió arriba. Léela como una continuación del mismo hilo, ` +
    `no como un tipo de frase distinto.`
  );
}

/**
 * Participle `*` note. With a noun host (under `+ *oro*`), keep the line short —
 * the nesting already shows the hang. Longer prose only when there is no host line.
 */
function participleLine(
  word: SpanishWord,
  nearbyWords: SpanishWord[],
  clauseHostSpanish: string | null,
  nounHostSpanish: string | null
): string {
  const reading = describeParticipleReading(word, nearbyWords);
  const label = labeledWord(reading.spanish, reading.greek);
  const whatIs =
    `${label} es un participio: una forma verbal que no actúa como el verbo principal ` +
    `de la frase. En español a menudo se parece a «-ando / -iendo» o a un adjetivo ` +
    `hecho de un verbo («amado», «venido»).`;

  // Nominatives: only a manual subject-host pick counts (auto CNG is unreliable).
  // Other cases: morph agreement noun when found.
  let nounText = nounHostSpanish?.trim() || null;
  if (!nounText && word.participleCase !== "N" && reading.hangNoun) {
    nounText = reading.hangNoun.text;
  }

  // Host line (`+ *oro*`) already names the noun — label only.
  if (nounText) {
    return `${label} - participio`;
  }

  if (word.participleCase === "N") {
    return (
      `${whatIs} Está en la forma que normalmente nombra quién hace o es algo ` +
      `(caso nominativo). Todavía falta señalar de quién habla: ` +
      `hasta que se elija ese nombre, no afirmes a quién describe.`
    );
  }

  if (clauseHostSpanish?.trim()) {
    return (
      `${whatIs} Va junto a la afirmación cuyo verbo es ${scripture(clauseHostSpanish)}. ` +
      `No reemplaza a ese verbo; añade acción o detalle ligado a esa misma afirmación ` +
      `(algo que ocurre con ella, alrededor de ella, o en relación con ella).`
    );
  }

  if (word.participleCase === "A") {
    return (
      `${whatIs} Está en acusativo (la forma que a menudo marca el objeto: ` +
      `a quién o qué alcanza la acción). Suele colgarse de ese objeto cercano, ` +
      `no del sujeto que hace la acción principal.`
    );
  }
  if (word.participleCase === "G" && word.participlePrecededByPreposition) {
    return (
      `${whatIs} Está en genitivo y viene después de una preposición. ` +
      `Léelo como parte de esa frase preposicional: no es el verbo principal; ` +
      `completa el sentido de la preposición y de lo que la acompaña.`
    );
  }
  if (word.participleCase === "G") {
    return (
      `${whatIs} Está en genitivo. Eso puede marcar una relación de «de…» ` +
      `(de quién / de qué) o, a veces, una escena aparte llamada absoluto. ` +
      `En todo caso, no es el verbo principal de la afirmación; añade detalle o trasfondo.`
    );
  }
  if (word.participleCase === "D") {
    return (
      `${whatIs} Está en dativo (la forma que a menudo marca «a / para / con» alguien o algo). ` +
      `No es el verbo principal; aporta detalle ligado a esa relación.`
    );
  }
  return (
    `${whatIs} Aparece en este versículo, pero aún no hay un nombre anfitrión claro ` +
    `al que colgarlo. No lo trates como verbo principal hasta ver de quién o de qué habla.`
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
    return (
      `${word} es un infinitivo: nombra una acción («hacer», «ser», «ir») sin decir ` +
      `quién la hace como verbo principal. Aquí completa a ${host}: ` +
      `ese verbo pide o espera un «qué» — qué se debe hacer, qué se pide, o qué acción sigue. ` +
      `Lee las dos piezas juntas: ${host} + ${word}.`
    );
  }
  return (
    `${word} es un infinitivo: nombra una acción sin ser el verbo principal de la frase. ` +
    `Depende de un verbo cercano (como «debe», «pide», «quiere» o «puede»). ` +
    `Busca ese verbo y lee ${word} como el «qué» de esa acción.`
  );
}

function describesRelativeLine(relativeSpanish: string, noun: string): string {
  const word = scripture(relativeSpanish);
  return (
    `${word} abre una frase que habla más de ${noun}. ` +
    `Es una frase de descripción: no es el verbo principal de la sección; ` +
    `está colgada de ese nombre (o de esa persona o cosa) para añadir detalle sobre ${noun}.`
  );
}

function describesPhraseLine(noun: string): string {
  return (
    `Esta frase habla más de ${noun}. ` +
    `No está afirmando una acción principal nueva; está añadiendo detalle ` +
    `sobre esa persona o cosa ya mencionada.`
  );
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

export interface GenerateManualOptions {
  meta?: ManualMeta;
  bookId?: ReaderBookId;
  /**
   * Optional Bible-version verse texts. Unused while reading-block quotes after
   * H3 are omitted; kept so CompilerShell call sites still type-check.
   */
  readingTextsByVerse?: Map<string, string> | Record<string, string>;
}

/**
 * Reads O's current live data and produces the markdown skeleton.
 * Pure, synchronous, read-only — never writes back to O's storage.
 */
export function generateManualSkeleton(metaOrOptions?: ManualMeta | GenerateManualOptions): GeneratedDoc {
  const options: GenerateManualOptions =
    metaOrOptions && ("meta" in metaOrOptions || "readingTextsByVerse" in metaOrOptions || "bookId" in metaOrOptions)
      ? metaOrOptions
      : { meta: metaOrOptions as ManualMeta | undefined };
  const meta = options.meta;
  const bookId = options.bookId ?? getWorkshopBookId();
  const progressKeys = workshopProgressKeys(bookId);
  const bookDisplayName = getReaderBookInfo(bookId).displayName;
  const warnings: string[] = [];
  const verses = loadClauseVerses(bookId);
  const assignments = readClauseAssignments(bookId);
  const observations = readClauseObservations(bookId);
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
  readMarkedAlignmentIds(progressKeys.commandMarks, bookId).forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(progressKeys.statementMarks, bookId).forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(progressKeys.subjunctiveMarks, bookId).forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(progressKeys.optativeMarks, bookId).forEach(id => moodReviewedVerbIds.add(id));
  const participleMarkedAlignmentIds = readMarkedAlignmentIds(progressKeys.participleMarks, bookId);
  const participleSubjectHosts = readParticipleSubjectHosts(bookId);

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
    reference: `${bookDisplayName} ${clause.chapter}:${clause.verse}`,
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

  // Participle emission: same-verse clause attachment only (mechanical).
  // No student classification — every Brick-4-marked participle is emitted.
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
    const exactClauseId = wordIdToClauseId.get(word.id) ?? null;
    // Same-verse span membership only — never nearest-neighbor scoop from
    // elsewhere in the verse (1 Pet 1:7 oro-participles ≠ sea-hallada span).
    if (
      exactClauseId &&
      exactClauseId.startsWith(`${word.chapter}:${word.verse}:`)
    ) {
      participleClauseAssignment.set(participleId, exactClauseId);
    } else {
      participleClauseAssignment.set(participleId, null);
    }
  }

  const participlesByClauseId = new Map<string, string[]>();
  const participlesByVerseKey = new Map<string, string[]>();
  for (const participleId of participleMarkedAlignmentIds) {
    const word = wordByParticipleId.get(participleId);
    if (!word) continue;
    const targetClauseId = participleClauseAssignment.get(participleId) ?? null;
    if (targetClauseId) {
      const list = participlesByClauseId.get(targetClauseId) ?? [];
      list.push(participleId);
      participlesByClauseId.set(targetClauseId, list);
    } else {
      const key = `${word.chapter}:${word.verse}`;
      const list = participlesByVerseKey.get(key) ?? [];
      list.push(participleId);
      participlesByVerseKey.set(key, list);
    }
  }

  /** Manual nominative subject-host span text (clause id or verse key). */
  function subjectHostText(hostKey: string | null): string | null {
    if (!hostKey) return null;
    const ids = participleSubjectHosts[hostKey] ?? [];
    if (!ids.length) return null;
    const first = wordById.get(ids[0]);
    if (!first) return null;
    return (
      formatClauseSpan(
        ids,
        wordsByVerse.get(`${first.chapter}:${first.verse}`) ?? [],
        verseTextByKey.get(`${first.chapter}:${first.verse}`) ?? ""
      ).trim() || null
    );
  }

  function resolveParticipleNounHost(
    word: SpanishWord,
    nearby: SpanishWord[],
    subjectHostKey: string | null
  ): string | null {
    if (word.participleCase === "N") return subjectHostText(subjectHostKey);
    const reading = describeParticipleReading(word, nearby);
    return reading.hangNoun?.text?.trim() || null;
  }

  interface ParticipleNote {
    nounHost: string | null;
    explanation: string;
  }

  function participleNotesFor(
    finiteVerbId: string | null,
    verseKey: string | null,
    onlyWordIds?: Set<string> | null
  ): ParticipleNote[] {
    const ids = finiteVerbId
      ? (participlesByClauseId.get(finiteVerbId) ?? [])
      : verseKey
        ? (participlesByVerseKey.get(verseKey) ?? [])
        : [];
    // Same keys O uses for subject-host picks: clause id, or verse for orphans.
    const subjectHostKey = finiteVerbId ?? verseKey;
    const seen = new Set<string>();
    const notes: ParticipleNote[] = [];
    for (const participleId of ids) {
      if (seen.has(participleId)) continue;
      seen.add(participleId);
      const word = wordByParticipleId.get(participleId);
      if (!word) continue;
      if (onlyWordIds && !onlyWordIds.has(word.id)) continue;
      const hostId = participleClauseAssignment.get(participleId);
      const hostSpanish = hostId ? finiteVerbWordById.get(hostId)?.text ?? null : null;
      const nearby = wordsByVerse.get(`${word.chapter}:${word.verse}`) ?? [];
      const nounHost = resolveParticipleNounHost(word, nearby, subjectHostKey);
      notes.push({
        nounHost,
        explanation: participleLine(word, nearby, hostSpanish, nounHost)
      });
    }
    return notes;
  }

  function nounHostKey(text: string | null | undefined): string | null {
    const trimmed = text?.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }

  /**
   * One presentation slide: noun host as `+` + nested `*` notes (no blank between).
   * `+` keeps the host in the outline marker family (formats like other phrases).
   * Blank line = new slide — so host and hangers must share a slide, or the
   * host appears alone (useless) and the note loses its visual anchor.
   */
  function emitNounHostGroupSlide(
    indent: string,
    hostText: string,
    explanations: string[]
  ): string[] {
    const nested = `${indent}  `;
    const comments = explanations
      .map(text => text.trim())
      .filter(Boolean)
      .filter((text, index, all) => text !== all[index - 1])
      .map(text => `${nested}* ${text}`);
    if (!comments.length) return [];
    return slide(`${indent}+ ${scripture(hostText)}`, comments);
  }

  /** Group participle notes by noun host — each host group is one slide. */
  function emitParticipleGroups(indent: string, notes: ParticipleNote[]): string[] {
    const lines: string[] = [];
    let index = 0;
    while (index < notes.length) {
      const note = notes[index];
      const hostKey = nounHostKey(note.nounHost);
      if (hostKey && note.nounHost) {
        const batch = [note.explanation];
        let next = index + 1;
        while (next < notes.length && nounHostKey(notes[next].nounHost) === hostKey) {
          batch.push(notes[next].explanation);
          next += 1;
        }
        lines.push(...emitNounHostGroupSlide(indent, note.nounHost, batch));
        index = next;
        continue;
      }
      lines.push(...starSlides(indent, [note.explanation]));
      index += 1;
    }
    return lines;
  }

  function emitParticipleSlides(
    indent: string,
    finiteVerbId: string | null,
    verseKey: string | null,
    onlyWordIds?: Set<string> | null
  ): string[] {
    return emitParticipleGroups(indent, participleNotesFor(finiteVerbId, verseKey, onlyWordIds));
  }

  function nearestClauseIdInVerse(word: SpanishWord): string | null {
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
    return nearestId;
  }

  // Infinitives: emit under the clause only when the Spanish word sits in that
  // clause's span. If the word is in a `+` gap, emit the `*` after that `+`
  // (document order) — still name the nearest finite as host in the template.
  // (Previously "nearest clause" pulled gap-infinitives onto the host clause,
  // so `*` appeared before `+ *a ser prudentes*`.)
  const infinitiveClauseAssignment = new Map<string, string | null>();
  const infinitiveHostById = new Map<string, string | null>();
  for (const word of infinitiveWords) {
    const infinitiveId = word.infinitiveId;
    if (!infinitiveId) continue;
    const exactClauseId = wordIdToClauseId.get(word.id) ?? null;
    const hostId = exactClauseId ?? nearestClauseIdInVerse(word);
    infinitiveHostById.set(infinitiveId, hostId);
    // Only bucket onto a clause for emission when the word is inside its span.
    infinitiveClauseAssignment.set(infinitiveId, exactClauseId);
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
    const explanations: string[] = [];
    const seen = new Set<string>();
    for (const word of words) {
      if (!word.infinitiveId || seen.has(word.infinitiveId)) continue;
      seen.add(word.infinitiveId);
      if (onlyWordIds && !onlyWordIds.has(word.id)) continue;
      const hostId = finiteVerbId ?? infinitiveHostById.get(word.infinitiveId) ?? null;
      const hostWord = hostId ? finiteVerbWordById.get(hostId) ?? null : null;
      explanations.push(
        infinitiveLine(
          word.text,
          word.infinitiveSurface ?? word.greekSurface ?? null,
          hostWord?.text ?? null,
          hostWord?.greekSurface ?? null
        )
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

  /** One dependent `-` plus its notes — children are emitted by the unit timeline. */
  function renderDependentOnly(node: SkeletonNode, depth: number): string[] {
    const clause = clauseById.get(node.finiteVerbId);
    const lines: string[] = [];
    const indent = "  ".repeat(depth);

    if (!clause) {
      lines.push(...slide(`${indent}- ${scripture(node.spanText || node.reference)}`));
      lines.push(...slide(`${indent}* Aún no está colocado en Observador — falta responder las preguntas de esta frase.`));
      warnings.push(`${node.reference} (${node.finiteVerbId}): no beginning-token data available — check manually.`);
      return lines;
    }

    const dependent = dependentRender(node, clause);
    lines.push(...slide(`${indent}- ${scripture(node.spanText || clause.finiteVerbText)}`));
    lines.push(...commentSlides(takeReaderNoteComments(clause.chapter, clause.verse, indent)));
    const participleNotes = participleNotesFor(node.finiteVerbId, null);
    if (dependent.antecedentText) {
      // One slide: host + relative note + matching hanging participles (same slide —
      // blank lines would orphan the host on the previous presentation screen).
      const hostKey = nounHostKey(dependent.antecedentText);
      const underHost = [
        ...dependent.explanations,
        ...participleNotes
          .filter(note => nounHostKey(note.nounHost) === hostKey)
          .map(note => note.explanation)
      ];
      const otherParticiples = participleNotes.filter(
        note => nounHostKey(note.nounHost) !== hostKey
      );
      lines.push(...emitNounHostGroupSlide(indent, dependent.antecedentText, underHost));
      lines.push(...emitInfinitiveSlides(indent, node.finiteVerbId, null));
      lines.push(...emitParticipleGroups(indent, otherParticiples));
    } else {
      lines.push(...starSlides(indent, dependent.explanations));
      lines.push(...emitInfinitiveSlides(indent, node.finiteVerbId, null));
      lines.push(...emitParticipleGroups(indent, participleNotes));
    }
    return lines;
  }

  /** Recursive helper for parked subtrees / leftover section only. */
  function renderNode(node: SkeletonNode, depth: number): string[] {
    const lines = renderDependentOnly(node, depth);
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

  function formatUnitReference(
    startChapter: number,
    startVerse: number,
    endChapter: number,
    endVerse: number
  ): string {
    if (startChapter === endChapter && startVerse === endVerse) {
      return `${bookDisplayName} ${startChapter}:${startVerse}`;
    }
    if (startChapter === endChapter) {
      return `${bookDisplayName} ${startChapter}:${startVerse}–${endVerse}`;
    }
    return `${bookDisplayName} ${startChapter}:${startVerse}–${endChapter}:${endVerse}`;
  }

  /**
   * Phrase / parked orphan at `depth` (Fix A: same indent as nearest preceding
   * #### / - so `+` does not jump to column 0 after a nested clause).
   */
  function renderOrphanBullet(orphan: Orphan, _governingText: string, depth = 0): string[] {
    const indent = "  ".repeat(depth);
    if (orphan.kind === "phrase") {
      const lines = slide(`${indent}+ ${scripture(orphan.text)}`);
      lines.push(...commentSlides(takeReaderNoteComments(orphan.chapter, orphan.verse, indent)));
      const phraseWords = new Set(orphan.wordIds);
      lines.push(...emitInfinitiveSlides(indent, null, `${orphan.chapter}:${orphan.verse}`, phraseWords));
      lines.push(...emitParticipleSlides(indent, null, `${orphan.chapter}:${orphan.verse}`, phraseWords));
      return lines;
    }
    // Parked finite clause — still `-`; children keep relative depth under it.
    const parkedClause = clauseById.get(orphan.node.finiteVerbId);
    const lines: string[] = [];
    const dependent = parkedClause ? dependentRender(orphan.node, parkedClause) : null;
    const antecedentText =
      dependent?.antecedentText ?? spanTextAtItsOwnVerse(orphan.node.describedNounSpan);
    const clauseText = antecedentText
      ? stripLeadingAntecedent(orphan.node.spanText, antecedentText)
      : orphan.node.spanText;
    lines.push(...slide(`${indent}- ${scripture(clauseText)}`));
    if (parkedClause) {
      lines.push(...commentSlides(takeReaderNoteComments(parkedClause.chapter, parkedClause.verse, indent)));
    }

    let explanations = dependent?.explanations ?? [];
    const relativeSpanish =
      spanishRelativeFromText(clauseText) ?? spanishRelativeFromText(orphan.node.spanText);
    const looksLikeDescribes =
      orphan.node.relation === "describes" || orphan.node.describedNounSpan.length > 0;
    if (looksLikeDescribes) {
      const noun = antecedentText ? scripture(antecedentText) : "un sustantivo anterior";
      if (relativeSpanish) {
        explanations = [describesRelativeLine(relativeSpanish, noun)];
      } else if (!explanations.some(line => /habla más de|describe a /i.test(line))) {
        explanations = [describesPhraseLine(noun), ...explanations];
      }
    }
    const participleNotes = participleNotesFor(orphan.node.finiteVerbId, null);
    if (antecedentText) {
      const hostKey = nounHostKey(antecedentText);
      const underHost = [
        ...explanations,
        ...participleNotes
          .filter(note => nounHostKey(note.nounHost) === hostKey)
          .map(note => note.explanation)
      ];
      const otherParticiples = participleNotes.filter(
        note => nounHostKey(note.nounHost) !== hostKey
      );
      lines.push(...emitNounHostGroupSlide(indent, antecedentText, underHost));
      lines.push(...emitInfinitiveSlides(indent, orphan.node.finiteVerbId, null));
      lines.push(...emitParticipleGroups(indent, otherParticiples));
    } else {
      lines.push(...starSlides(indent, explanations));
      lines.push(...emitInfinitiveSlides(indent, orphan.node.finiteVerbId, null));
      lines.push(...emitParticipleGroups(indent, participleNotes));
    }
    for (const child of orphan.node.children) lines.push(...renderNode(child, depth + 1));
    return lines;
  }

  function childOrder(node: SkeletonNode): number {
    return clauseById.get(node.finiteVerbId)?.order ?? Infinity;
  }

  // Tito 1:2:6 pattern: a relative pronoun opening a "root" that actually
  // describes a noun in still-unplaced material. Demonstratives alone are NOT
  // this pattern — Ταῦτα λάλει (2:15) and Τούτου χάριν (1:5) are ordinary
  // deictic openings of real independent clauses.
  function opensWithRelativePronoun(clause: CompilerClause): boolean {
    return findLeadingMarkerToken(clause.beginningTokens).kind === "relative";
  }

  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const root = roots[rootIndex];
    const clause = clauseById.get(root.finiteVerbId);
    if (!clause) {
      warnings.push(`${root.reference} (${root.finiteVerbId}): root clause missing beginning-token data — skipped.`);
      continue;
    }

    // Unit owns every orphan until the next independent clause begins — so a
    // `+` after the root in the same verse stays in this unit's outline.
    const nextRoot = roots[rootIndex + 1];
    const nextRootOrder = nextRoot
      ? clauseById.get(nextRoot.finiteVerbId)?.order ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    pendingOrphans = flushOrphansBefore(nextRootOrder);

    const beforeOrphans = pendingOrphans.filter(orphan => orphan.order < clause.order);
    if (opensWithRelativePronoun(clause) && beforeOrphans.length) {
      warnings.push(
        `${root.reference} (${root.finiteVerbId}): opens with a relative pronoun and sits next to unplaced material — verify this is really root, not a Q1 description of something in that material (the Tito 1:2:6 pattern).`
      );
    }

    // Flat document-order timeline so `+` can inherit the nearest preceding
    // clause depth (nested `-` / ####), instead of always printing at column 0.
    type UnitEvent =
      | { kind: "root"; order: number }
      | { kind: "dependent"; order: number; node: SkeletonNode; depth: number }
      | { kind: "orphan"; order: number; orphan: Orphan };

    const unitEvents: UnitEvent[] = [];

    function appendDependentTree(node: SkeletonNode, depth: number): void {
      unitEvents.push({ kind: "dependent", order: childOrder(node), node, depth });
      for (const child of node.children) appendDependentTree(child, depth + 1);
    }

    for (const orphan of pendingOrphans) {
      unitEvents.push({ kind: "orphan", order: orphan.order, orphan });
    }
    for (const child of root.children) appendDependentTree(child, 0);
    unitEvents.push({ kind: "root", order: clause.order });
    unitEvents.sort((a, b) => a.order - b.order);

    // H3 reference = grammatical unit (root + dependents + orphans).
    type VersePin = { chapter: number; verse: number };
    const unitVerses: VersePin[] = [{ chapter: clause.chapter, verse: clause.verse }];
    function addVersePin(chapter: number, verse: number): void {
      if (!unitVerses.some(pin => pin.chapter === chapter && pin.verse === verse)) {
        unitVerses.push({ chapter, verse });
      }
    }
    for (const event of unitEvents) {
      if (event.kind === "dependent") {
        const dep = clauseById.get(event.node.finiteVerbId);
        if (dep) addVersePin(dep.chapter, dep.verse);
      } else if (event.kind === "orphan") {
        if (event.orphan.kind === "phrase") {
          addVersePin(event.orphan.chapter, event.orphan.verse);
        } else {
          const parked = clauseById.get(event.orphan.node.finiteVerbId);
          if (parked) addVersePin(parked.chapter, parked.verse);
        }
      }
    }
    unitVerses.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
    const startChapter = unitVerses[0].chapter;
    const startVerse = unitVerses[0].verse;
    const endChapter = unitVerses[unitVerses.length - 1].chapter;
    const endVerse = unitVerses[unitVerses.length - 1].verse;
    const reference = formatUnitReference(startChapter, startVerse, endChapter, endVerse);

    const rootQuote = scripture(root.spanText || clause.finiteVerbText);
    const block: string[] = [];
    // H3 unit claim on its own slide. No large reading-block verse quotes after
    // it — the reference is enough; outline #### / - / + still carry span text.
    block.push(`### ${reference} — ${rootQuote}`);
    block.push("");

    // Walk timeline: #### / - update currentDepth; + uses that indent (Fix A).
    let currentDepth = 0;
    const governing = root.spanText || clause.finiteVerbText;
    for (const event of unitEvents) {
      if (event.kind === "root") {
        block.push(...slide(`#### ${rootQuote}`));
        block.push(...commentSlides(takeReaderNoteComments(clause.chapter, clause.verse)));
        block.push(...starSlides("", rootExplanationLines(clause)));
        block.push(...emitInfinitiveSlides("", root.finiteVerbId, null));
        block.push(...emitParticipleSlides("", root.finiteVerbId, null));
        currentDepth = 0;
        continue;
      }
      if (event.kind === "dependent") {
        block.push(...renderDependentOnly(event.node, event.depth));
        currentDepth = event.depth;
        continue;
      }
      block.push(...renderOrphanBullet(event.orphan, governing, currentDepth));
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

  // Actor layer (Structure SVO) — concentration + flow appendix when observed.
  const clauseActors = readClauseActors(bookId);
  function actorSpanText(ids: string[]): string {
    if (!ids.length) return "";
    const first = wordById.get(ids[0]);
    if (!first) return "";
    return formatClauseSpan(
      ids,
      wordsByVerse.get(`${first.chapter}:${first.verse}`) ?? [],
      verseTextByKey.get(`${first.chapter}:${first.verse}`) ?? ""
    ).trim();
  }
  function defaultVerbSpan(finiteVerbId: string): string[] {
    const word = finiteVerbWordById.get(finiteVerbId);
    return word ? [word.id] : [];
  }

  type FlowAction = { verb: string; object: string; order: number };
  const concentrationCounts = new Map<string, { label: string; count: number }>();
  const flowByActor = new Map<string, { label: string; actions: FlowAction[] }>();
  for (const info of clauseSpanInfos) {
    const stored = clauseActors[info.finiteVerbId];
    const subject = actorSpanText(stored?.subjectSpan ?? []);
    if (!subject) continue;
    const verb = actorSpanText(
      stored?.verbSpan?.length ? stored.verbSpan : defaultVerbSpan(info.finiteVerbId)
    );
    if (!verb) continue;
    const object = actorSpanText(stored?.objectSpan ?? []);
    const key = subject.toLowerCase();
    const conc = concentrationCounts.get(key) ?? { label: subject, count: 0 };
    conc.count += 1;
    concentrationCounts.set(key, conc);
    const flow = flowByActor.get(key) ?? { label: subject, actions: [] };
    flow.actions.push({ verb, object, order: info.order });
    flowByActor.set(key, flow);
  }

  if (concentrationCounts.size) {
    const actorBlock: string[] = [];
    actorBlock.push("## Actores");
    actorBlock.push("");
    actorBlock.push("### Concentración");
    actorBlock.push("");
    const concRows = Array.from(concentrationCounts.values()).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    for (const row of concRows) {
      const n = row.count === 1 ? "acción" : "acciones";
      actorBlock.push(`- ${scripture(row.label)} — ${row.count} ${n}`);
      actorBlock.push("");
    }
    actorBlock.push("### Flujo");
    actorBlock.push("");
    const flowRows = Array.from(flowByActor.values())
      .map(group => ({
        label: group.label,
        actions: group.actions.sort((a, b) => a.order - b.order)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    for (const group of flowRows) {
      actorBlock.push(`#### ${group.label.toUpperCase()}`);
      actorBlock.push("");
      for (const action of group.actions) {
        const line = action.object
          ? `${scripture(action.verb)} → ${scripture(action.object)}`
          : scripture(action.verb);
        actorBlock.push(`- ${line}`);
        actorBlock.push("");
      }
    }
    sections.push(actorBlock.join("\n"));
  } else {
    warnings.push("No clause actors observed yet — Actor concentration / flow omitted from Generate.");
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
