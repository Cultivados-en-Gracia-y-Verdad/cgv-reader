// Compiler — manual skeleton generator. Reads O's live data (same localStorage
// O itself reads/writes — see clause-data.ts) and mechanically produces a
// markdown skeleton: structure, Scripture text, and grammatical explanations,
// ready for a human writer to add commentary to. Never writes theological or
// interpretive content — only what's already been observed in O.
//
// Per the confirmed spec: YAML frontmatter is separate metadata (form on the
// right). H1/H2 are context only (not the outline). Scripture outline:
//   #### independent (root) clauses
//   -  dependent clauses — Scripture only (HARD)
//   +  phrases — Scripture only (HARD)
//   *  Observer mechanical inserts only (actors, grammar, tono, Def/XRef…)
//   >  Writer entries (Reader notes, human commentary)
//   Def/XRef pins also use `*` (applied after Generate)
// Indentation (left→right) shows structural depth. Blank line = new slide.
// H3 = unit claim (clause-id reference — independent finite, e.g. `1 Juan 1:9:7`).
// No large reading-block verse quotes after H3. Outline #### / - / + still carry
// LBF span text. Conditions owned by this root that precede the finite emit after
// ### and before ####, closing with `… ⤵` (packaging D).
//
// HARD RULE: `-` and `+` never carry non-Scripture. Evidence lines such as
// `Actores principales: …` / `Actores dominantes…` / `Tono observado: …` /
// `Trayectoria de propósito…` / `Hilo de taller…` always start with `*`.

import {
  getReaderBookInfo,
  workshopProgressKeys,
  type ReaderBookId
} from "@cgv/core";
import {
  describeParticipleReading,
  formatActorTriple,
  findNominalClauseCandidates,
  formatClauseSpan,
  getClauseBeginningTokens,
  loadClauseVerses,
  readClauseActors,
  readClauseAssignments,
  readClauseObservations,
  readBookThread,
  readMarkedAlignmentIds,
  readNominalClauseHeadIds,
  readParticipleSubjectHosts,
  type ClauseBeginningToken,
  type SpanishWord
} from "../observer/clause-data";
import { loadLbfTokenSurfaces } from "../observer/lbf-alignment";
import { buildBookMovementReport } from "../observer/book-movement";
import {
  detectClauseSignal,
  detectLeadingCoordinator,
  detectRelativeOfConnection,
  detectRelativeOverImperative,
  findLeadingMarkerToken,
  FRAME_PARTICLES,
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

function alignmentTokenNumber(id: string): number {
  const parts = id.split(":");
  return Number(parts[2]) || 0;
}

function collectSkeletonIds(node: SkeletonNode): string[] {
  return [node.finiteVerbId, ...node.children.flatMap(collectSkeletonIds)];
}

function isParticipleGreekMorph(morph: string | undefined): boolean {
  return Boolean(morph && morph.startsWith("V-") && morph.length > 5 && morph[5] === "P");
}
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
    // Strip a mistaken leading + / - — those markers are Scripture-only.
    const normalized = explanation.trim().replace(/^[-+]\s+/, "");
    if (!normalized || normalized === previous) continue;
    previous = normalized;
    lines.push(...slide(`${indent}* ${normalized}`));
  }
  return lines;
}

/**
 * HARD marker discipline:
 * - `-` / `+` = Scripture only (body must open with italics `*…*`)
 * - Evidence / meta (Actores…, Tono…) must start with `*`
 */
function markerDisciplineWarnings(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/Actores principales|Actores dominantes|Tono observado/i.test(trimmed) && !/^\*/.test(trimmed)) {
      out.push(
        `Marker discipline L${i + 1}: Actores/Tono must start with * (never + or -) — got: ${trimmed.slice(0, 100)}`
      );
    }

    const scriptureMarker = trimmed.match(/^([-+])\s+(.*)$/);
    if (scriptureMarker) {
      const body = scriptureMarker[2];
      // Scripture outline lines wrap the span in *…*.
      if (body && !body.startsWith("*")) {
        out.push(
          `Marker discipline L${i + 1}: '${scriptureMarker[1]}' is reserved for Scripture only — got: ${trimmed.slice(0, 100)}`
        );
      }
    }
  }
  return out;
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
 * Empty Spanish (no LBF row) → Greek only, never a BLE gloss.
 */
function labeledWord(spanish: string, greek?: string | null): string {
  const es = spanish.trim();
  const gr = (greek ?? "").trim();
  if (!es) return gr ? `(${gr})` : "";
  if (gr && gr !== es) return `${scripture(es)} (${gr})`;
  return scripture(es);
}

/** Relative markers commonly visible in LBF Spanish when Greek range starts late. */
function spanishRelativeFromText(text: string): string | null {
  const match = text.match(
    /\b(lo que|los que|las que|lo cual|la cual|el cual|los cuales|las cuales|quienes|quien)\b/i
  );
  return match ? match[1] : null;
}

/**
 * Passage Spanish for a Greek beginning-token: LBF surface only
 * (e.g. ὃ → «lo que»). No BLE gloss fallback — MorphGNT spine stays; Spanish
 * is LBF.
 *
 * LBF alignment sometimes stamps a whole phrase onto one Greek token
 * («lo cual es verdadero» for ὅ) — extract the relative / keep a short head.
 */
function passageSpanishForMarker(
  token: ClauseBeginningToken,
  bookId: ReaderBookId
): string {
  const parts = token.id.split(":").map(Number);
  if (parts.length !== 3 || !parts.every(n => Number.isFinite(n))) return "";
  const [chapter, verse, tok] = parts;
  const surface = loadLbfTokenSurfaces(chapter, verse, bookId).get(tok);
  if (!surface?.trim()) return "";
  const cleaned = surface.replace(/·/g, " ").trim();
  const relative = spanishRelativeFromText(cleaned);
  if (relative) return relative;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return cleaned;
  // Over-long phrase surface — take the first word, not a BLE gloss.
  return words[0] ?? cleaned;
}

// Grammar notes: one short observational sentence + markdown footnote to the
// appendices. Expand in the body only when the passage does something unusual
// (inheritance under an open particle, nominative participle without a host, etc.).
// Every "{word}" is the LBF Spanish for that Greek token — never BLE, never the
// Greek surface — except coordinate-inheritance's shared particle, which names
// a DIFFERENT clause's marker and must stay Greek.
function footnoteKeyForLemma(lemma: string): string {
  const key = lemma
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^α-ωa-z]/gu, "");
  switch (key) {
    case "και":
      return "kai";
    case "δε":
      return "de";
    case "γαρ":
      return "gar";
    case "διοτι":
      return "dioti";
    case "ουν":
      return "oun";
    case "αλλα":
      return "alla";
    case "η":
      return "e";
    case "ινα":
      return "hina";
    case "ει":
      return "ei";
    case "οτι":
      return "hoti";
    case "ως":
      return "hos";
    case "οτε":
      return "hote";
    default:
      return "conn";
  }
}

function footnoteKeyForGreek(greek: string | null | undefined, fallback: string): string {
  const surface = (greek ?? "").trim();
  if (!surface) return fallback;
  return footnoteKeyForLemma(surface);
}

function relationalConnectorLine(spanish: string, lemma: string, greek?: string | null): string {
  const word = labeledWord(spanish, greek);
  if (!word) return "";
  const fn = footnoteKeyForLemma(lemma);
  switch (lemma) {
    case "καί":
      return `${word}[^${fn}] une esta cláusula con la anterior.`;
    case "ἀλλά":
      return `${word}[^${fn}] introduce un contraste.`;
    case "γάρ":
    case "διότι":
      return `${word}[^${fn}] introduce la razón.`;
    case "οὖν":
      return `${word}[^${fn}] introduce la conclusión.`;
    case "δέ":
      return `${word}[^${fn}] continúa el desarrollo.`;
    default:
      return `${word}[^${fn}] une esta cláusula con la anterior.`;
  }
}

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
  if (!word) return "";
  if (isContent) {
    return `${word}[^hoti] introduce el contenido.`;
  }
  if (isDescribes) {
    const noun = describedNounText ? scripture(describedNounText) : "alguien o algo mencionado antes";
    return `${word}[^rel]: describe a ${noun}.`;
  }
  const parent = parentVerbText?.trim() ? scripture(parentVerbText.trim()) : null;
  switch (frameType) {
    case "purpose":
      return parent
        ? `${word}[^hina] introduce el propósito de ${parent}.`
        : `${word}[^hina] introduce el propósito.`;
    case "reason":
      return `${word}[^${footnoteKeyForGreek(greek, "gar")}] introduce la razón.`;
    case "condition":
      return `${word}[^${footnoteKeyForGreek(greek, "ei")}] introduce una condición.`;
    case "time":
      return `${word}[^${footnoteKeyForGreek(greek, "hos")}] marca el momento.`;
    default:
      // No connector comment when none is visible — silence, not a generic note.
      return "";
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
 * Form: `*{spanish}* ({greek})[^part]` or `*{spanish}* ({greek})[^part]: …`.
 */
function participleLine(
  word: SpanishWord,
  nearbyWords: SpanishWord[],
  clauseHostSpanish: string | null,
  nounHostSpanish: string | null
): string {
  const reading = describeParticipleReading(word, nearbyWords);
  const label = labeledWord(reading.spanish, reading.greek);

  // Nominatives: only a manual subject-host pick counts (auto CNG is unreliable).
  // Other cases: morph agreement noun when found.
  let nounText = nounHostSpanish?.trim() || null;
  if (!nounText && word.participleCase !== "N" && reading.hangNoun) {
    nounText = reading.hangNoun.text;
  }

  // Host line (`+ *oro*`) already names the noun — label + [^part] footnote only.
  if (nounText) {
    return `${label}[^part]`;
  }

  // Unique: nominative without a chosen host — keep the warning in the body.
  if (word.participleCase === "N") {
    return (
      `${label}[^part]: forma nominativa sin anfitrión señalado aún — ` +
      `no afirmes a quién describe hasta elegirlo en Observador.`
    );
  }

  if (clauseHostSpanish?.trim()) {
    return `${label}[^part]: añade información a ${scripture(clauseHostSpanish)}.`;
  }

  return `${label}[^part]: añade información al verbo principal.`;
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
    return `Infinitivo[^inf] ${word}: completa a ${host}.`;
  }
  return `Infinitivo[^inf] ${word}: completa la acción del verbo principal.`;
}

function describesRelativeLine(relativeSpanish: string, noun: string): string {
  const word = scripture(relativeSpanish);
  return `${word}[^rel]: describe a ${noun}.`;
}

function describesPhraseLine(noun: string): string {
  return `Describe a ${noun}.`;
}

/** Generic explanations live once, at the end — body notes only cite them. */
const MANUAL_APPENDICES = `## Apéndice A — Conectores griegos

[^kai]: **καί**. Une esta cláusula con la anterior. Solo suma: añade otra idea a la misma línea. No da razón ni contraste.
[^de]: **δέ**. Continúa el desarrollo. A veces solo avanza («y…»); a veces marca un leve contraste («pero…»). Sigue conectada a lo anterior.
[^gar]: **γάρ**. Introduce la razón — el «por qué» de lo que se acaba de decir. No es propósito («para que…»).
[^dioti]: **διότι**. Introduce la razón, como γάρ: el fundamento de la frase anterior.
[^alla]: **ἀλλά**. Introduce un contraste: lo que sigue se aparta de la dirección anterior («pero» / «sino»).
[^oun]: **οὖν**. Introduce la conclusión: «entonces» / «por eso» — el siguiente paso lógico.
[^e]: **ἤ**. Une alternativas («o»).
[^hina]: **ἵνα**. Introduce el propósito — el «para qué» de la acción gobernante.
[^ei]: **εἰ**. Introduce una condición: lo que sigue depende de que se cumpla esa condición.
[^hoti]: **ὅτι**. Puede introducir el contenido (lo que se dice, se sabe o se piensa) o la razón (el «por qué»), según el contexto.
[^hos]: **ὡς**. Marca el momento o la manera relacionada con la frase anterior — a menudo el «cuándo» o el «como».
[^hote]: **ὅτε**. Marca el momento — el «cuándo».
[^conn]: Conector relacional. Une esta cláusula con lo anterior.

## Apéndice B — Formas verbales

[^part]: **Participio**. Forma verbal que no actúa como el verbo principal. Añade acción o detalle ligado a un nombre o a la afirmación cercana (a menudo se parece a «-ando / -iendo» o a un adjetivo hecho de un verbo).
[^inf]: **Infinitivo**. Nombra una acción sin ser el verbo principal. Completa el «qué» de un verbo cercano (debe, pide, quiere, puede…).

## Apéndice C — Observando la estructura

[^rel]: **Cláusula relativa**. No es el verbo principal de la sección; cuelga de un nombre (o persona o cosa) ya mencionado y añade detalle sobre ese anfitrión.
`;

interface CompilerClause {
  finiteVerbId: string;
  chapter: number;
  verse: number;
  order: number;
  beginningTokens: ClauseBeginningToken[];
  finiteVerbText: string;
  greekStartTokenId: string | null;
  greekEndTokenId: string | null;
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
  const readerNotes = readReaderNotes(bookId);
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
  const commandMarkIds = readMarkedAlignmentIds(progressKeys.commandMarks, bookId);
  const statementMarkIds = readMarkedAlignmentIds(progressKeys.statementMarks, bookId);
  commandMarkIds.forEach(id => moodReviewedVerbIds.add(id));
  statementMarkIds.forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(progressKeys.subjunctiveMarks, bookId).forEach(id => moodReviewedVerbIds.add(id));
  readMarkedAlignmentIds(progressKeys.optativeMarks, bookId).forEach(id => moodReviewedVerbIds.add(id));
  // A nominal clause has no verb, so it has no Greek mood to review — marking it
  // as the head IS the whole review. Gating it behind the mood bricks would keep
  // it out of the outline permanently.
  const nominalHeadIds = readNominalClauseHeadIds(bookId);
  nominalHeadIds.forEach(id => moodReviewedVerbIds.add(id));
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
      finiteVerbText: finiteVerb.text,
      greekStartTokenId: greekRange?.greekStartTokenId ?? null,
      greekEndTokenId: greekRange?.greekEndTokenId ?? null
    });
  }
  clauses.sort(byOrder);

  const clauseById = new Map(clauses.map(clause => [clause.finiteVerbId, clause]));

  // Every Greek token some clause span covers — so a marker sitting outside all of
  // them can be told apart from one that simply belongs to the clause next door.
  const claimedGreekTokenIds = new Set<string>();
  for (const clause of clauses) {
    if (!clause.greekStartTokenId || !clause.greekEndTokenId) continue;
    const from = alignmentTokenNumber(clause.greekStartTokenId);
    const to = alignmentTokenNumber(clause.greekEndTokenId);
    for (let tok = Math.min(from, to); tok <= Math.max(from, to); tok += 1) {
      claimedGreekTokenIds.add(`${clause.chapter}:${clause.verse}:${tok}`);
    }
  }

  // Verbless assertions no clause covers yet. The trunk is the complete independent
  // clause whether its predicate is verbal or nominal, and a nominal predicate is the
  // one miss nothing else here can report: every other root check reasons from a verb.
  // Grouped into a single flag — a list to work through in O, not one defect per line.
  const nominalCandidates = findNominalClauseCandidates(claimedGreekTokenIds, bookId);
  if (nominalCandidates.length) {
    // No practical cap: this is a backlog to work through, and an item hidden behind
    // "… and N more" is an assertion that stays missing from the trunk.
    const listed = nominalCandidates
      .map(candidate => {
        const hints = [
          candidate.hasNominativeParticiple
            ? "carries a participle in the subject case"
            : "no verb at all",
          candidate.touchesClauseSpan ? "runs into a clause span — a span may be the real issue" : null
        ].filter(Boolean);
        return `    · ${bookDisplayName} ${candidate.chapter}:${candidate.verse} (${candidate.chapter}:${candidate.verse}:${candidate.startToken}–${candidate.endToken}; ${hints.join("; ")}): “${candidate.greek}”`;
      })
      .join("\n");
    warnings.push(
      `${nominalCandidates.length} stretch(es) of Greek belong to no clause and carry a nominative or ` +
        `vocative with no finite verb — the shape of a nominal predicate. Ask of each one only this: does it ` +
        `predicate on its own, or is it a nominal *inside* an independent clause? If it predicates, it is an ` +
        `independent clause missing from the trunk — mark its head in O (Brick 1B) so it becomes an H4. If it ` +
        `is a subject, apposition or second predicate belonging to the clause beside it, widen that span and ` +
        `note nothing: it is already trunk. Settle these before trusting the H4 sequence:\n${listed}`
    );
  }

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
    // A hand-marked nominal head is a deliberate claim that this stretch
    // predicates on its own, and those clauses open a new assertion far more
    // often than they continue one — 1 Peter 3:8's Τὸ δὲ τέλος πάντες
    // ὁμόφρονες and 2:9's Ὑμεῖς δὲ γένος ἐκλεκτόν both carry a transitional δέ
    // that inheritance would read as a coupling, burying a command four levels
    // deep inside the relative chain that happens to precede it.
    if (nominalHeadIds.has(input.finiteVerbId)) continue;
    if (detectLeadingCoordinator(input.beginningTokens, input.finiteVerbId)) coordinateContinuationIds.add(input.finiteVerbId);
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

  /**
   * H3/H4 claim = full independent-clause span by default (Version A).
   * Only peel leading words into `+` when the prefix contains a marked / morph
   * participle (heavy scaffolding such as ἐραυνῶντες…). Short openings like
   * «Y este» stay inside the claim: `#### *Y este es el mensaje*`.
   */
  function splitClaimAtFinite(finiteVerbId: string): { prefixWordIds: string[]; claimText: string } {
    const full = spanTextFor(finiteVerbId);
    const assignment = assignments[finiteVerbId];
    const clause = clauseById.get(finiteVerbId);
    const finiteWord = finiteVerbWordById.get(finiteVerbId);
    if (!assignment?.selectedSpan.length || !clause || !finiteWord) {
      return { prefixWordIds: [], claimText: full };
    }
    const ids = assignment.selectedSpan;
    let cut = ids.indexOf(finiteWord.id);
    if (cut < 0) {
      cut = ids.findIndex(id => {
        const word = wordById.get(id);
        return Boolean(
          word &&
            word.chapter === finiteWord.chapter &&
            word.verse === finiteWord.verse &&
            word.index >= finiteWord.index
        );
      });
    }
    if (cut <= 0) return { prefixWordIds: [], claimText: full };

    const prefixWordIds = ids.slice(0, cut);
    const prefixHasParticiple = prefixWordIds.some(id => {
      if (participleMarkedAlignmentIds.has(id)) return true;
      const word = wordById.get(id);
      return isParticipleGreekMorph(word?.greekMorph);
    });
    if (!prefixHasParticiple) {
      return { prefixWordIds: [], claimText: full };
    }

    const claimIds = ids.slice(cut);
    // Prefer same-verse formatting; fall back to full span text from cut onward
    // by rebuilding from word texts when the span crosses verses.
    const claimParts: string[] = [];
    let runIds: string[] = [];
    let runKey = "";
    const flushRun = () => {
      if (!runIds.length) return;
      const key = runKey;
      const text = formatClauseSpan(runIds, wordsByVerse.get(key) ?? [], verseTextByKey.get(key) ?? "").trim();
      if (text) claimParts.push(text);
      runIds = [];
    };
    for (const id of claimIds) {
      const word = wordById.get(id);
      if (!word) continue;
      const key = `${word.chapter}:${word.verse}`;
      if (runKey && key !== runKey) flushRun();
      runKey = key;
      runIds.push(id);
    }
    flushRun();
    const claimText = claimParts.join(" ").trim() || full;
    return { prefixWordIds, claimText };
  }

  /**
   * A "root" that opens with a real subordinator/relative in its own leading
   * window (or whose finite mark is a participle) must not get #### / H3.
   *
   * The window is the point. Scanning every token up to the finite verb also
   * catches words that subordinate nothing: in ὁ ἀντίδικος ὑμῶν διάβολος ὡς
   * λέων ὠρυόμενος περιπατεῖ (1 P 5:8) the ὡς heads a verbless comparative
   * phrase and περιπατεῖ is the clause's own main verb, so a full scan demoted
   * a genuine independent. Using findLeadingMarkerToken also keeps this rule
   * from contradicting the marker lines the rest of the pipeline renders from
   * the same clause — the two used to disagree, flagging one clause both as
   * "subordinated" and as having no leading marker at all.
   */
  function rootDemoteReason(clause: CompilerClause): string | null {
    const finiteWord = finiteVerbWordById.get(clause.finiteVerbId);
    if (finiteWord && isParticipleGreekMorph(finiteWord.greekMorph)) {
      return "finiteVerbId points at a participle form — emit as dependent/participle material, not an independent H3";
    }
    const marker = findLeadingMarkerToken(clause.beginningTokens, clause.finiteVerbId);
    if (marker.kind !== "relative" && marker.kind !== "frame" && marker.kind !== "content") return null;
    if (alignmentTokenNumber(marker.token.id) >= alignmentTokenNumber(clause.finiteVerbId)) return null;
    if (marker.kind === "relative") {
      // Relative of connection (δι' ἣν αἰτίαν and kin): the noun it agrees with
      // sits inside this same clause, so it reads as a connective rather than a
      // relative clause hanging on an outside noun. clause-signals treats that
      // as a genuine judgment call — don't settle it here by demoting.
      if (detectRelativeOfConnection(clause.beginningTokens)) return null;
      // 1 Peter 3:3's ὧν ἔστω … κόσμος: a relative clause never governs an
      // imperative, so the pronoun is connective even though its antecedent
      // (γυναῖκες, 3:1) is too far back for the check above to see.
      if (detectRelativeOverImperative(clause)) return null;
      return `relative “${marker.token.greek}” in the leading window — not an independent clause`;
    }
    return `“${marker.token.greek}” (${marker.token.lemma.trim()}) in the leading window — subordinated, not an independent H3`;
  }

  /**
   * Roots that rootDemoteReason deliberately lets through but that still need a
   * human look — silence here would hide a real judgment call behind a clean
   * skeleton. Two shapes:
   *
   *   1. Relative of connection — the relative's own antecedent sits inside the
   *      clause, so it may be reading as a connector ("por lo cual") rather than
   *      as a relative clause on an outside noun. clause-signals calls this
   *      genuinely uncertain; the student decides, not the generator.
   *   2. A subordinator/relative before the finite but outside the leading
   *      window. Either it subordinates nothing (comparative ὡς λέων ὠρυόμενος,
   *      1 P 5:8 — the root is correct), or it does subordinate and the clause
   *      span starts too early, having swallowed the governing clause (a span
   *      running καὶ τίς ὁ κακώσων ὑμᾶς ἐὰν … γένησθε, where only ἐὰν … γένησθε
   *      is the dependent). Code can't tell those apart; the span can, in O.
   */
  function rootSuspicionReason(clause: CompilerClause): string | null {
    // Settled by grammar, not a judgment call — see rootDemoteReason.
    if (detectRelativeOverImperative(clause)) return null;
    const connection = detectRelativeOfConnection(clause.beginningTokens);
    if (connection) {
      return (
        `kept as independent, but it opens with relative “${connection.relative.greek}” whose agreeing noun ` +
        `“${connection.antecedent.greek}” sits inside this same clause — relative of connection (a connector) or a real ` +
        `dependent? Decide in O.`
      );
    }
    const finiteTok = alignmentTokenNumber(clause.finiteVerbId);
    for (const token of clause.beginningTokens) {
      if (alignmentTokenNumber(token.id) >= finiteTok) break;
      const lemma = token.lemma.trim();
      if (!token.morph.startsWith("RR") && !FRAME_PARTICLES[lemma] && lemma !== "ὅτι") continue;
      return (
        `kept as independent, but “${token.greek}” (${lemma}) sits before the finite and outside the leading window — ` +
        `fine if it subordinates nothing here (e.g. comparative ὡς + noun); if it does subordinate this verb, the clause ` +
        `span starts too early. Check the span in O.`
      );
    }
    return orphanedSubordinatorReason(clause);
  }

  /**
   * The mirror image of a span that starts too early: one that starts too LATE,
   * leaving its own subordinator just outside. Every marker check reads the span,
   * so the clause looks unmarked and reads as independent with nothing anywhere to
   * flag it — this is the one shape the generator is otherwise blind to. 1 Peter
   * 3:6's ἧς ἐγενήθητε τέκνα is the case: the span opens at ἐγενήθητε and the
   * relative sits one token back, inside no clause at all. Only reported when no
   * other clause claims that token, since a subordinator belonging to the previous
   * clause is none of this clause's business.
   */
  function orphanedSubordinatorReason(clause: CompilerClause): string | null {
    if (!clause.greekStartTokenId) return null;
    const startTok = alignmentTokenNumber(clause.greekStartTokenId);
    if (startTok <= 1) return null;
    const previousId = `${clause.chapter}:${clause.verse}:${startTok - 1}`;
    if (claimedGreekTokenIds.has(previousId)) return null;
    const [token] = getClauseBeginningTokens({
      greekStartTokenId: previousId,
      greekEndTokenId: previousId
    });
    if (!token) return null;
    const lemma = token.lemma.trim();
    const isRelative = token.morph.startsWith("RR");
    if (!isRelative && !FRAME_PARTICLES[lemma] && lemma !== "ὅτι") return null;
    return (
      `kept as independent, but ${isRelative ? "relative " : ""}“${token.greek}” (${lemma}) sits immediately before ` +
      `this clause's span and belongs to no clause — if it subordinates this verb, the span starts one token too late ` +
      `and every marker check is blind to it. Widen the span in O.`
    );
  }

  // Promote mood-reviewed finites with no Q1–Q3 yet so they break orphan floods
  // (e.g. one early root swallowing 2:2–5:6 of phrase material).
  const claimedIds = new Set<string>();
  for (const root of skeleton.roots) {
    for (const id of collectSkeletonIds(root)) claimedIds.add(id);
  }
  for (const parked of skeleton.parked) {
    for (const id of collectSkeletonIds(parked)) claimedIds.add(id);
  }

  // Roots O resolved itself, as opposed to the provisional promotions pushed
  // below or the cycle-breakers, neither of which is a decision O recorded.
  const observerRootIds = new Set(
    skeleton.roots.map(root => root.finiteVerbId).filter(id => !skeleton.cycleBrokenIds.has(id))
  );
  const workingRoots: SkeletonNode[] = [...skeleton.roots];
  for (const info of clauseSpanInfos) {
    if (claimedIds.has(info.finiteVerbId)) continue;
    const resolved = resolveClause(info, augmentedObservations[info.finiteVerbId], clauseSpanInfos);
    if (resolved.relation !== null) continue;
    warnings.push(
      `${info.reference} (${info.finiteVerbId}): mood-reviewed finite with no Q1–Q3 yet — emitted as provisional independent (H3/H4). Finish the clause review in O.`
    );
    workingRoots.push({
      finiteVerbId: info.finiteVerbId,
      reference: info.reference,
      spanText: info.spanText,
      relation: "root",
      children: []
    });
    claimedIds.add(info.finiteVerbId);
  }
  workingRoots.sort(
    (a, b) => (clauseById.get(a.finiteVerbId)?.order ?? 0) - (clauseById.get(b.finiteVerbId)?.order ?? 0)
  );

  // A clause can reach this loop as a "root" three different ways, and saying so
  // matters more than the demotion itself: the student answered Q1–Q3 as root, or
  // Q1–Q3 aren't answered yet (promoted provisionally above), or deriveSkeleton
  // stood it up to break a cycle in the recorded parents. Only the first is a
  // decision to second-guess; the third is a data problem in O that no amount of
  // Compiler cleverness can fix.
  for (const id of skeleton.cycleBrokenIds) {
    const info = clauseSpanInfoById.get(id);
    if (!info) continue;
    const resolved = resolveClause(info, augmentedObservations[id], clauseSpanInfos);
    warnings.push(
      `${info.reference} (${id}): O resolves this as ${resolved.relation ?? "dependent"}` +
        `${resolved.parentClauseId ? ` under ${resolved.parentClauseId}` : ""}, but that parent chain loops back here — ` +
        `stood up as a top-level clause only to keep the cycle visible, not because it is independent. ` +
        `Repoint one of the two parents in O.`
    );
  }

  // Demote false independents → parked-style orphans under the surrounding root unit.
  const demotedParked: ParkedClause[] = [];
  const rootsAfterDemote: SkeletonNode[] = [];
  for (const root of workingRoots) {
    const clause = clauseById.get(root.finiteVerbId);
    const why = clause ? rootDemoteReason(clause) : null;
    if (why) {
      const origin = skeleton.cycleBrokenIds.has(root.finiteVerbId)
        ? "demoted from independent (it was only standing up to break a parent cycle — see the cycle flag above)"
        : observerRootIds.has(root.finiteVerbId)
          ? "demoted from independent (O marks it independent — verify there)"
          : "demoted from independent";
      warnings.push(`${root.reference} (${root.finiteVerbId}): ${origin} — ${why}`);
      demotedParked.push({
        ...root,
        describedNounSpan: [],
        relation: root.relation
      });
      continue;
    }
    const suspicion = clause ? rootSuspicionReason(clause) : null;
    if (suspicion) warnings.push(`${root.reference} (${root.finiteVerbId}): ${suspicion}`);
    rootsAfterDemote.push(root);
  }

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
  function actorSubjectText(finiteVerbId: string): string {
    return actorSpanText(clauseActors[finiteVerbId]?.subjectSpan ?? []);
  }

  /**
   * `* Actores principales: *X* (2) · *Y* (1)` — mechanical evidence line from observed
   * subjects, so the human writer can name the H2 unit from who acts in it.
   */
  function actorEvidenceLine(finiteVerbIds: string[], label: string): string {
    const counts = new Map<string, { label: string; count: number }>();
    for (const id of finiteVerbIds) {
      const subject = actorSubjectText(id);
      if (!subject) continue;
      const key = subject.toLowerCase();
      const row = counts.get(key) ?? { label: subject, count: 0 };
      row.count += 1;
      counts.set(key, row);
    }
    if (!counts.size) return "";
    const parts = Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
      .map(row => `${scripture(row.label)} (${row.count})`);
    return `${label}: ${parts.join(" · ")}`;
  }

  /** Scripture-wrapped `*sujeto* → *verbo* → *objeto` for Generate slides. */
  function actorTripleScripture(finiteVerbId: string): string {
    const stored = clauseActors[finiteVerbId];
    const subject = actorSpanText(stored?.subjectSpan ?? []);
    const verb = actorSpanText(
      stored?.verbSpan?.length ? stored.verbSpan : defaultVerbSpan(finiteVerbId)
    );
    const object = actorSpanText(stored?.objectSpan ?? []);
    if (!formatActorTriple(subject, verb, object)) return "";
    return object
      ? `${scripture(subject)} → ${scripture(verb)} → ${scripture(object)}`
      : `${scripture(subject)} → ${scripture(verb)}`;
  }

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
      return { marker: findLeadingMarkerToken(candidate.beginningTokens, candidate.finiteVerbId), relationKey };
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
      const connectorMarker = findLeadingMarkerToken(clause.beginningTokens, clause.finiteVerbId);
      const connectorWord =
        connectorMarker.kind === "coordinator"
          ? passageSpanishForMarker(connectorMarker.token, bookId)
          : "";
      const origin = findOriginatingMarker(clause);
      if (origin && origin.marker.kind !== "none") {
        return { antecedentText: null, explanations: [inheritanceLine(origin.marker.token.greek, connectorWord, origin.relationKey)] };
      }
      warnings.push(`${node.reference} (${node.finiteVerbId}): coordinate-inherited but no originating marker found — check manually.`);
      return { antecedentText: null, explanations: [inheritanceLine("?", connectorWord, "reason")] };
    }

    let marker = findLeadingMarkerToken(clause.beginningTokens, clause.finiteVerbId);
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
        const retry = findLeadingMarkerToken(expandedTokens, clause.finiteVerbId);
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

    const spanish = passageSpanishForMarker(marker.token, bookId);
    const greek = marker.token.greek;
    return {
      antecedentText: isDescribes ? describedNounText : null,
      explanations: [
        subordinatingLine(node.frameType, isContent, isDescribes, spanish, greek, parentVerbText, describedNounText)
      ]
    };
  }

  function rootExplanationLines(clause: CompilerClause): string[] {
    const marker = findLeadingMarkerToken(clause.beginningTokens, clause.finiteVerbId);
    // Asyndeton: no connector comment — silence teaches better than a repeated note.
    if (marker.kind === "none") return [];
    if (marker.kind === "relative") {
      // A relative pronoun opening what's already resolved as an independent
      // clause is the "relative of connection" idiom (see clause-signals.ts) —
      // functions as a connector, not a description, so it still gets a
      // relational line, using LBF Spanish for that Greek token.
      return [
        relationalConnectorLine(
          passageSpanishForMarker(marker.token, bookId),
          "δέ",
          marker.token.greek
        )
      ];
    }
    if (marker.kind === "coordinator") {
      return [
        relationalConnectorLine(
          passageSpanishForMarker(marker.token, bookId),
          marker.lemma,
          marker.token.greek
        )
      ];
    }
    if (marker.kind === "frame") {
      return [
        relationalConnectorLine(
          passageSpanishForMarker(marker.token, bookId),
          marker.token.lemma.trim(),
          marker.token.greek
        )
      ];
    }
    return [];
  }

  function withProtasisOpen(text: string): string {
    let t = text.trimEnd();
    t = t.replace(/\s*⤵\s*$/u, "").replace(/\s*(?:\.\.\.|…)\s*$/u, "");
    return `${t}…`;
  }

  function withProtasisTrail(text: string): string {
    return `${withProtasisOpen(text)} ⤵`;
  }

  function isConditionNode(node: SkeletonNode): boolean {
    if (node.frameType === "condition") return true;
    const observation = augmentedObservations[node.finiteVerbId];
    return observation?.tellsWhenOrIf === "yes" && observation?.frameType === "condition";
  }

  function lastDescendantId(node: SkeletonNode): string {
    let last = node;
    const walk = (n: SkeletonNode) => {
      last = n;
      for (const child of n.children) walk(child);
    };
    walk(node);
    return last.finiteVerbId;
  }

  /**
   * Climb whenIf links to the governing apodosis root.
   * e.g. *como* → whenIf *Si* → whenIf *tenemos* → use *tenemos* for cutAt.
   * Cutting at *Si*’s span start would empty the *como* line and fall back to bleed.
   */
  function climbWhenIfToApodosis(startId: string): string | null {
    let current = startId.trim();
    if (!current) return null;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const next = (augmentedObservations[current]?.whenIfParentClauseId || "").trim();
      if (!next) return current;
      current = next;
    }
    return current || null;
  }

  /**
   * Parents whose spans may bleed into this dependent:
   * direct whenIf / expressed, plus the climbed apodosis and (for content under
   * *Si*) the condition’s governing apodosis.
   */
  function clipExcludeFiniteIds(finiteVerbId: string): string[] {
    const observation = augmentedObservations[finiteVerbId];
    if (!observation) return [];
    const ids: string[] = [];
    const whenIf = (observation.whenIfParentClauseId || "").trim();
    const expressed = (observation.expressedParentClauseId || "").trim();
    if (whenIf) {
      ids.push(whenIf);
      const apodosis = climbWhenIfToApodosis(whenIf);
      if (apodosis) ids.push(apodosis);
    }
    if (expressed) {
      ids.push(expressed);
      const grandWhen = (augmentedObservations[expressed]?.whenIfParentClauseId || "").trim();
      if (grandWhen) {
        ids.push(grandWhen);
        const apodosis = climbWhenIfToApodosis(grandWhen);
        if (apodosis) ids.push(apodosis);
      }
    }
    return [...new Set(ids)];
  }

  /**
   * Cut at span *start* only for apodosis roots (climbed whenIf / grand whenIf).
   * Never cut at an earlier *Si* that this time/content clause hangs under —
   * that empties the line and falls back to the unclipped bleed.
   */
  function clipCutAtFiniteIds(finiteVerbId: string): string[] {
    const observation = augmentedObservations[finiteVerbId];
    if (!observation) return [];
    const ids: string[] = [];
    const whenIf = (observation.whenIfParentClauseId || "").trim();
    if (whenIf) {
      const apodosis = climbWhenIfToApodosis(whenIf);
      if (apodosis) ids.push(apodosis);
    }
    const expressed = (observation.expressedParentClauseId || "").trim();
    if (expressed) {
      const grandWhen = (augmentedObservations[expressed]?.whenIfParentClauseId || "").trim();
      if (grandWhen) {
        const apodosis = climbWhenIfToApodosis(grandWhen);
        if (apodosis) ids.push(apodosis);
      }
    }
    return [...new Set(ids)];
  }

  function registerCutAt(
    cutAtByVerse: Map<string, number>,
    parentId: string,
    /** Only register a cut that starts after this dependent’s first word. */
    minKeepIndexByVerse: Map<string, number>
  ): void {
    const parentSpan = assignments[parentId]?.selectedSpan ?? [];
    const spanWords = parentSpan
      .map(id => wordById.get(id))
      .filter((word): word is SpanishWord => Boolean(word));
    const candidates = spanWords.length
      ? spanWords
      : (() => {
          const finiteWord = wordById.get(parentId) ?? finiteVerbWordById.get(parentId);
          return finiteWord ? [finiteWord] : [];
        })();
    for (const word of candidates) {
      const key = `${word.chapter}:${word.verse}`;
      const minKeep = minKeepIndexByVerse.get(key);
      // Parent sits before this dependent in the verse — not an apodosis cut.
      if (minKeep !== undefined && word.index <= minKeep) continue;
      const prev = cutAtByVerse.get(key);
      if (prev === undefined || word.index < prev) cutAtByVerse.set(key, word.index);
    }
  }

  /**
   * Drop words after a clause comma that follows this finite — e.g. orphan *él*
   * between «pecados,» and apodosis «es fiel…» when *él* is outside the parent span.
   * (tokenizeVerse skips punctuation, so char-slice still pulls «, él».)
   */
  function dropWordsAfterClauseComma(finiteVerbId: string, useIds: string[]): string[] {
    const finiteWord = finiteVerbWordById.get(finiteVerbId);
    if (!finiteWord || !useIds.length) return useIds;
    const verseText = verseTextByKey.get(`${finiteWord.chapter}:${finiteWord.verse}`) ?? "";
    if (!verseText) return useIds;
    return useIds.filter(id => {
      const word = wordById.get(id);
      if (!word) return false;
      if (word.chapter !== finiteWord.chapter || word.verse !== finiteWord.verse) return true;
      if (word.index <= finiteWord.index) return true;
      const between = verseText.slice(finiteWord.endChar, word.startChar);
      return !/,/.test(between);
    });
  }

  /**
   * Format a dependent’s Scripture for the outline. O spans often bleed into the
   * apodosis — drop shared tokens and cut at the climbed apodosis span *start*,
   * then drop post-comma orphans so we don’t print «Si confesamos…, él» or
   * «como…, tenemos comunión…» on the protasis lines.
   */
  function displaySpanText(finiteVerbId: string, fallback: string): string {
    const ids = assignments[finiteVerbId]?.selectedSpan ?? [];
    if (!ids.length) return fallback;
    const minKeepIndexByVerse = new Map<string, number>();
    for (const id of ids) {
      const word = wordById.get(id);
      if (!word) continue;
      const key = `${word.chapter}:${word.verse}`;
      const prev = minKeepIndexByVerse.get(key);
      if (prev === undefined || word.index < prev) minKeepIndexByVerse.set(key, word.index);
    }
    const exclude = new Set<string>();
    for (const parentId of clipExcludeFiniteIds(finiteVerbId)) {
      for (const id of assignments[parentId]?.selectedSpan ?? []) exclude.add(id);
    }
    /** Per "chapter:verse", earliest word index belonging to an apodosis clip target. */
    const cutAtByVerse = new Map<string, number>();
    for (const parentId of clipCutAtFiniteIds(finiteVerbId)) {
      registerCutAt(cutAtByVerse, parentId, minKeepIndexByVerse);
    }
    let useIds = ids.filter(id => {
      if (exclude.has(id)) return false;
      const word = wordById.get(id);
      if (!word) return false;
      const cutAt = cutAtByVerse.get(`${word.chapter}:${word.verse}`);
      if (cutAt !== undefined && word.index >= cutAt) return false;
      return true;
    });
    useIds = dropWordsAfterClauseComma(finiteVerbId, useIds);
    if (!useIds.length) useIds = ids;
    const parts: string[] = [];
    let runIds: string[] = [];
    let runKey = "";
    const flushRun = () => {
      if (!runIds.length) return;
      const key = runKey;
      const text = formatClauseSpan(
        runIds,
        wordsByVerse.get(key) ?? [],
        verseTextByKey.get(key) ?? ""
      ).trim();
      if (text) parts.push(text);
      runIds = [];
    };
    for (const id of useIds) {
      const word = wordById.get(id);
      if (!word) continue;
      const key = `${word.chapter}:${word.verse}`;
      if (runKey && key !== runKey) flushRun();
      runKey = key;
      runIds.push(id);
    }
    flushRun();
    const joined = parts.join(" ").trim();
    // Char-slice formatting can leave a dangling comma / conjunction after a cut.
    return joined.replace(/[,:;]\s*$/u, "").trim() || fallback;
  }

  /** Condition-package nodes that get trailing `…` (open). */
  let protasisOpenIds = new Set<string>();
  /** Last node of each pre-#### condition package — gets `… ⤵`. */
  let protasisCloseIds = new Set<string>();

  function markProtasisPackage(node: SkeletonNode): void {
    const walk = (n: SkeletonNode) => {
      protasisOpenIds.add(n.finiteVerbId);
      for (const child of n.children) walk(child);
    };
    walk(node);
    protasisCloseIds.add(lastDescendantId(node));
  }

  function applyProtasisMarker(finiteVerbId: string, text: string): string {
    if (protasisCloseIds.has(finiteVerbId)) return withProtasisTrail(text);
    if (protasisOpenIds.has(finiteVerbId)) return withProtasisOpen(text);
    return text;
  }

  /** One dependent `-` plus its notes — children are emitted by the unit timeline. */
  function renderDependentOnly(node: SkeletonNode, depth: number): string[] {
    const clause = clauseById.get(node.finiteVerbId);
    const lines: string[] = [];
    const indent = "  ".repeat(depth);

    if (!clause) {
      const missingText = applyProtasisMarker(
        node.finiteVerbId,
        node.spanText || node.reference
      );
      lines.push(...slide(`${indent}- ${scripture(missingText)}`));
      lines.push(...slide(`${indent}* Aún no está colocado en Observador — falta responder las preguntas de esta frase.`));
      warnings.push(`${node.reference} (${node.finiteVerbId}): no beginning-token data available — check manually.`);
      return lines;
    }

    const dependent = dependentRender(node, clause);
    const rawSpan = displaySpanText(node.finiteVerbId, node.spanText || clause.finiteVerbText);
    const spanText = applyProtasisMarker(node.finiteVerbId, rawSpan);
    lines.push(...slide(`${indent}- ${scripture(spanText)}`));
    const dependentActor = actorTripleScripture(node.finiteVerbId);
    if (dependentActor) lines.push(...starSlides(indent, [dependentActor]));
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

  // Roots after provisional promotion + demotion of subordinated "roots".
  const roots = rootsAfterDemote;

  /**
   * Dependents attached in O to a root but falling *after the next root* in
   * book order (e.g. 4:18 → parent 2:2:8, with 5:6 hanging under 4:18) must
   * not stay inside that early unit — that was the real `2:2–5:6` H3 bug.
   * Peel them off the tree for unit building and re-inject as parked orphans
   * at their own document order so they land under the chronologically right unit.
   */
  const strayFromDistantParent: ParkedClause[] = [];
  const strayIds = new Set<string>();
  function pruneDependentsPastNextRoot(
    node: SkeletonNode,
    owningRootId: string,
    nextRootId: string | undefined,
    nextOrder: number
  ): SkeletonNode | null {
    const order = clauseById.get(node.finiteVerbId)?.order ?? 0;
    if (order >= nextOrder) {
      warnings.push(
        // A relative clause whose antecedent sits two roots back is ordinary Greek
        // sentence length, not a coding error — the unit simply cannot host it without
        // inflating its reference. Saying "check the parent" for those sends the reader
        // after a bug that isn't there, so name both possibilities.
        `${node.reference} (${node.finiteVerbId}): attached under ${owningRootId} but falls after next root ${nextRootId ?? "(none)"} — excluded from that H3 unit (was inflating the reference) and emitted in document order instead. Re-parent in O only if the link itself is wrong; if the antecedent genuinely sits that far back, this is sentence length and nothing to fix.`
      );
      strayFromDistantParent.push({ ...node, describedNounSpan: [] });
      for (const id of collectSkeletonIds(node)) strayIds.add(id);
      return null;
    }
    node.children = node.children
      .map(child => pruneDependentsPastNextRoot(child, owningRootId, nextRootId, nextOrder))
      .filter((child): child is SkeletonNode => child !== null);
    return node;
  }
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const root = roots[rootIndex];
    const next = roots[rootIndex + 1];
    const nextOrder = next
      ? clauseById.get(next.finiteVerbId)?.order ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    root.children = root.children
      .map(child =>
        pruneDependentsPastNextRoot(child, root.finiteVerbId, next?.finiteVerbId, nextOrder)
      )
      .filter((child): child is SkeletonNode => child !== null);
  }

  const orphans: Orphan[] = [
    ...phraseGaps,
    ...skeleton.parked.map(node => ({
      kind: "parked" as const,
      order: clauseById.get(node.finiteVerbId)?.order ?? 0,
      node
    })),
    ...demotedParked.map(node => ({
      kind: "parked" as const,
      order: clauseById.get(node.finiteVerbId)?.order ?? 0,
      node
    })),
    ...strayFromDistantParent.map(node => ({
      kind: "parked" as const,
      order: clauseById.get(node.finiteVerbId)?.order ?? 0,
      node
    }))
  ].sort((a, b) => a.order - b.order);

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

  /** H3 ref = independent-clause id (`book chapter:verse:token`), not a verse bag. */
  function formatClauseUnitReference(finiteVerbId: string): string {
    return `${bookDisplayName} ${finiteVerbId}`;
  }

  function whenIfOwnerId(finiteVerbId: string): string | null {
    const parent = augmentedObservations[finiteVerbId]?.whenIfParentClauseId?.trim();
    return parent || null;
  }

  const rootIdSet = new Set(roots.map(root => root.finiteVerbId));
  const reservedOrphansByRoot = new Map<string, Orphan[]>();

  /**
   * Peel conditions whose whenIf parent is another independent root — they must
   * not trail under this unit’s card (1:8 / divider / 1:9 failure mode).
   */
  function peelConditionOwnedElsewhere(
    node: SkeletonNode,
    owningRootId: string
  ): SkeletonNode | null {
    if (isConditionNode(node)) {
      const owner = whenIfOwnerId(node.finiteVerbId);
      if (owner && rootIdSet.has(owner) && owner !== owningRootId) {
        const order = clauseById.get(node.finiteVerbId)?.order ?? 0;
        const bucket = reservedOrphansByRoot.get(owner) ?? [];
        bucket.push({
          kind: "parked",
          order,
          node: { ...node, describedNounSpan: [] }
        });
        reservedOrphansByRoot.set(owner, bucket);
        for (const id of collectSkeletonIds(node)) strayIds.add(id);
        warnings.push(
          `${node.reference} (${node.finiteVerbId}): condition owned by ${owner} — moved off ${owningRootId} into that H3 unit (packaging D).`
        );
        return null;
      }
    }
    node.children = node.children
      .map(child => peelConditionOwnedElsewhere(child, owningRootId))
      .filter((child): child is SkeletonNode => child !== null);
    return node;
  }
  for (const root of roots) {
    root.children = root.children
      .map(child => peelConditionOwnedElsewhere(child, root.finiteVerbId))
      .filter((child): child is SkeletonNode => child !== null);
  }

  function flushOrphansBefore(order: number, currentRootId: string): Orphan[] {
    const collected: Orphan[] = [];
    while (orphanCursor < orphans.length && orphans[orphanCursor].order < order) {
      const orphan = orphans[orphanCursor];
      orphanCursor += 1;
      if (orphan.kind === "parked") {
        const owner = whenIfOwnerId(orphan.node.finiteVerbId);
        if (owner && rootIdSet.has(owner) && owner !== currentRootId) {
          const bucket = reservedOrphansByRoot.get(owner) ?? [];
          bucket.push(orphan);
          reservedOrphansByRoot.set(owner, bucket);
          warnings.push(
            `${orphan.node.reference} (${orphan.node.finiteVerbId}): condition/frame owned by ${owner} — held for that H3 unit instead of trailing under ${currentRootId}.`
          );
          continue;
        }
      }
      collected.push(orphan);
    }
    return collected;
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
    const clauseTextRaw = antecedentText
      ? stripLeadingAntecedent(
          displaySpanText(orphan.node.finiteVerbId, orphan.node.spanText),
          antecedentText
        )
      : displaySpanText(orphan.node.finiteVerbId, orphan.node.spanText);
    const clauseText = applyProtasisMarker(orphan.node.finiteVerbId, clauseTextRaw);
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
      // Prefer dependentRender’s LBF+Greek [^rel] line. Only invent a Spanish-only
      // relative note when O gave no leading marker.
      if (!explanations.some(line => /\[\^rel\]|describe a /i.test(line))) {
        if (relativeSpanish) {
          explanations = [describesRelativeLine(relativeSpanish, noun)];
        } else {
          explanations = [describesPhraseLine(noun), ...explanations];
        }
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
    return findLeadingMarkerToken(clause.beginningTokens, clause.finiteVerbId).kind === "relative";
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
    // Conditions/frames whose whenIf parent is another root are reserved for
    // that unit (packaging D — not left as trailer on the previous card).
    const nextRoot = roots[rootIndex + 1];
    const nextRootOrder = nextRoot
      ? clauseById.get(nextRoot.finiteVerbId)?.order ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    const reserved = reservedOrphansByRoot.get(root.finiteVerbId) ?? [];
    reservedOrphansByRoot.delete(root.finiteVerbId);
    pendingOrphans = [...reserved, ...flushOrphansBefore(nextRootOrder, root.finiteVerbId)].sort(
      (a, b) => a.order - b.order
    );

    const beforeOrphans = pendingOrphans.filter(orphan => orphan.order < clause.order);
    if (opensWithRelativePronoun(clause) && beforeOrphans.length) {
      warnings.push(
        `${root.reference} (${root.finiteVerbId}): opens with a relative pronoun and sits next to unplaced material — verify this is really root, not a Q1 description of something in that material (the Tito 1:2:6 pattern).`
      );
    }

    // Packaging D: pre-#### condition packages — every line gets `…`;
    // last line also gets `⤵`.
    protasisOpenIds = new Set<string>();
    protasisCloseIds = new Set<string>();
    for (const child of root.children) {
      const order = childOrder(child);
      if (order < clause.order && isConditionNode(child)) {
        markProtasisPackage(child);
      }
    }
    for (const orphan of beforeOrphans) {
      if (orphan.kind !== "parked") continue;
      if (!isConditionNode(orphan.node)) continue;
      const owner = whenIfOwnerId(orphan.node.finiteVerbId);
      if (owner && owner !== root.finiteVerbId) continue;
      markProtasisPackage(orphan.node);
    }

    // Flat document-order timeline so `+` can inherit the nearest preceding
    // clause depth (nested `-` / ####), instead of always printing at column 0.
    type UnitEvent =
      | { kind: "root"; order: number }
      | { kind: "dependent"; order: number; node: SkeletonNode; depth: number }
      | { kind: "orphan"; order: number; orphan: Orphan };

    const unitEvents: UnitEvent[] = [];

    function appendDependentTree(node: SkeletonNode, depth: number): void {
      const order = childOrder(node);
      // Belt-and-suspenders: never let a post-next-root dependent into this unit.
      if (order >= nextRootOrder || strayIds.has(node.finiteVerbId)) return;
      unitEvents.push({ kind: "dependent", order, node, depth });
      for (const child of node.children) appendDependentTree(child, depth + 1);
    }

    for (const orphan of pendingOrphans) {
      unitEvents.push({ kind: "orphan", order: orphan.order, orphan });
    }
    for (const child of root.children) appendDependentTree(child, 0);
    unitEvents.push({ kind: "root", order: clause.order });
    unitEvents.sort((a, b) => a.order - b.order);

    // H3 reference = independent-clause id only (Version A).
    const reference = formatClauseUnitReference(root.finiteVerbId);

    const { prefixWordIds, claimText } = splitClaimAtFinite(root.finiteVerbId);
    const rootQuote = scripture(claimText || root.spanText || clause.finiteVerbText);
    const block: string[] = [];
    // H3 unit claim on its own slide. No large reading-block verse quotes after
    // it — the reference is enough; outline #### / - / + still carry span text.
    block.push(`### ${reference} — ${rootQuote}`);
    block.push("");

    // Unit-naming evidence (H2 help): who acts across root + dependents here.
    const unitClauseIds = [root.finiteVerbId];
    for (const event of unitEvents) {
      if (event.kind === "dependent") unitClauseIds.push(event.node.finiteVerbId);
      else if (event.kind === "orphan" && event.orphan.kind !== "phrase") {
        unitClauseIds.push(event.orphan.node.finiteVerbId);
      }
    }
    const unitActorEvidence = actorEvidenceLine(unitClauseIds, "Actores principales");
    if (unitActorEvidence) block.push(...starSlides("", [unitActorEvidence]));

    // Walk timeline: #### / - update currentDepth; + uses that indent (Fix A).
    let currentDepth = 0;
    const governing = claimText || root.spanText || clause.finiteVerbText;
    let emittedClaimPrefix = false;
    for (const event of unitEvents) {
      if (event.kind === "root") {
        // Leading participle / PP scaffolding before the finite → `+` slides.
        if (!emittedClaimPrefix && prefixWordIds.length) {
          emittedClaimPrefix = true;
          const prefixParts: string[] = [];
          let runIds: string[] = [];
          let runKey = "";
          const flushPrefixRun = () => {
            if (!runIds.length) return;
            const key = runKey;
            const text = formatClauseSpan(
              runIds,
              wordsByVerse.get(key) ?? [],
              verseTextByKey.get(key) ?? ""
            ).trim();
            if (text) prefixParts.push(text);
            runIds = [];
          };
          for (const id of prefixWordIds) {
            const word = wordById.get(id);
            if (!word) continue;
            const key = `${word.chapter}:${word.verse}`;
            if (runKey && key !== runKey) flushPrefixRun();
            runKey = key;
            runIds.push(id);
          }
          flushPrefixRun();
          for (const part of prefixParts) {
            block.push(...slide(`+ ${scripture(part)}`));
          }
        }
        block.push(...slide(`#### ${rootQuote}`));
        // The Spanish reads with a verb the Greek doesn't have, so the H4 would
        // otherwise imply one. Say where it came from instead.
        if (nominalHeadIds.has(root.finiteVerbId)) {
          block.push(
            ...starSlides("", [
              "Cláusula nominal: en griego esta cláusula no tiene verbo; el español lo suple para poder leerse."
            ])
          );
        }
        const rootActor = actorTripleScripture(root.finiteVerbId);
        if (rootActor) block.push(...starSlides("", [rootActor]));
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
    block.push("{Material sin cláusula raíz posterior en el libro — pendiente de colocación manual.}");
    block.push("");
    for (const orphan of leftoverOrphans) {
      block.push(...renderOrphanBullet(orphan, "(sin cláusula gobernante identificada)"));
    }
    sections.push(block.join("\n"));
    warnings.push(`${leftoverOrphans.length} orphan item(s) had no following root clause to fold into — placed in a final "Pendiente de colocación" section.`);
  }

  // Actor layer (Structure SVO) — concentration + full-triple flow appendix.
  type FlowAction = { triple: string; order: number };
  const concentrationCounts = new Map<string, { label: string; count: number }>();
  const flowByActor = new Map<string, { label: string; actions: FlowAction[] }>();
  for (const info of clauseSpanInfos) {
    const stored = clauseActors[info.finiteVerbId];
    const subject = actorSpanText(stored?.subjectSpan ?? []);
    if (!subject) continue;
    const tripleScripture = actorTripleScripture(info.finiteVerbId);
    if (!tripleScripture) continue;
    const key = subject.toLowerCase();
    const conc = concentrationCounts.get(key) ?? { label: subject, count: 0 };
    conc.count += 1;
    concentrationCounts.set(key, conc);
    const flow = flowByActor.get(key) ?? { label: subject, actions: [] };
    flow.actions.push({ triple: tripleScripture, order: info.order });
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
        actorBlock.push(`- ${action.triple}`);
        actorBlock.push("");
      }
    }
    sections.push(actorBlock.join("\n"));
  } else {
    warnings.push("No clause actors observed yet — Actor concentration / flow omitted from Generate.");
  }

  // H1/H2 evidence: the TODOs stay human-assigned, but the writer names them
  // from observed data — dominant actors, mood mix, writing-purpose trajectory,
  // and student Thread as workshop hypothesis (never as titles).
  {
    const evidenceLines: string[] = [];
    if (concentrationCounts.size) {
      const top = Array.from(concentrationCounts.values())
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
        .slice(0, 5)
        .map(row => `${scripture(row.label)} — ${row.count} ${row.count === 1 ? "acción" : "acciones"}`);
      evidenceLines.push(`Actores dominantes del libro: ${top.join(" · ")}.`);
    }
    const commandCount = clauses.filter(clause => commandMarkIds.has(clause.finiteVerbId)).length;
    const statementCount = clauses.filter(clause => statementMarkIds.has(clause.finiteVerbId)).length;
    if (commandCount || statementCount) {
      evidenceLines.push(
        `Tono observado: ${statementCount} ${statementCount === 1 ? "declaración" : "declaraciones"} · ${commandCount} ${commandCount === 1 ? "mandato" : "mandatos"}.`
      );
    }

    // Writing-purpose detectors need the ἵνα / "para que" text. That usually
    // lives on a purpose-frame child, not inside the root's own selectedSpan —
    // join direct purpose dependents so 1:3 / 2:1 / 5:13 show in the trajectory.
    const purposeTextByParent = new Map<string, string[]>();
    for (const [childId, observation] of Object.entries(augmentedObservations)) {
      if (observation.tellsWhenOrIf !== "yes" || observation.frameType !== "purpose") continue;
      const parentId = observation.whenIfParentClauseId;
      if (!parentId) continue;
      const childText = spanTextFor(childId).trim();
      if (!childText) continue;
      const bucket = purposeTextByParent.get(parentId) ?? [];
      bucket.push(childText);
      purposeTextByParent.set(parentId, bucket);
    }
    const movementClauses = workingRoots
      .filter(root => !skeleton.cycleBrokenIds.has(root.finiteVerbId))
      .map((root, order) => {
        const parts = root.finiteVerbId.split(":");
        const verseKey = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : root.finiteVerbId;
        const rootText = spanTextFor(root.finiteVerbId).trim();
        const purposeBits = purposeTextByParent.get(root.finiteVerbId) ?? [];
        const spanText = [rootText, ...purposeBits].filter(Boolean).join(" ");
        return {
          finiteVerbId: root.finiteVerbId,
          reference: `${bookDisplayName} ${verseKey}`,
          spanText,
          order
        };
      });
    const writingPurposes = buildBookMovementReport(movementClauses).writingPurposes;
    if (writingPurposes.length) {
      const traj = writingPurposes.map(hit => {
        const parts = hit.finiteVerbId.split(":");
        const verseKey = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : hit.reference;
        return `${verseKey} ${hit.trajectory}`;
      });
      evidenceLines.push(`Trayectoria de propósito de escritura: ${traj.join(" · ")}.`);
    }

    const namedThread = readBookThread(bookId).steps.filter(step => step.label.trim());
    if (namedThread.length) {
      const chain = namedThread
        .map(step => `${step.verseKey} ${step.label.trim()}`)
        .join(" ↓ ");
      evidenceLines.push(
        `Hilo de taller (hipótesis de movimiento — no es título H1/H2): ${chain}`
      );
    }

    if (evidenceLines.length) {
      const evidenceBlock: string[] = [];
      evidenceBlock.push(
        "{Evidencia de Observador para nombrar desarrollo mayor (H1) y desarrollo continuo (H2) — no es comentario.}"
      );
      evidenceBlock.push("");
      evidenceBlock.push(...starSlides("", evidenceLines));
      sections.unshift(evidenceBlock.join("\n"));
    }
  }

  sections.push(MANUAL_APPENDICES.trimEnd());

  const yaml = formatYamlFrontmatter(meta ?? createDefaultManualMeta());
  // H1/H2 = context only (same slide). Blank line before first H3 begins the outline.
  const markdown = [yaml, "", "# TODO: contexto", "## TODO: unidad", "", ...sections].join("\n");
  warnings.push(...markerDisciplineWarnings(markdown));

  return {
    markdown,
    clauseCount: clauses.length,
    verblessCount: phraseGaps.length,
    pendingCount: skeleton.parked.length + demotedParked.length + strayFromDistantParent.length,
    warnings
  };
}
