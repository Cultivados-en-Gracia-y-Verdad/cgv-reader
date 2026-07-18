# Compiler — Manual Skeleton Generation Spec (Final, for Immediate Implementation)

**This spec is meant to be executed in one focused pass, in a fresh Claude Code session —
not iteratively explored.** Everything in it has already been decided through extensive
back-and-forth; there should be no open design questions left to resolve while building this.
If something genuinely is ambiguous once you're in the code, flag it in one message and stop
rather than guessing — but the intent is for this to be a single, direct implementation.

**Goal:** given O's settled clause data for Titus, mechanically generate a markdown manual
skeleton — structure, Scripture text, and grammatical explanations — ready for a human writer
to add deep commentary to. Compiler never writes theological or interpretive content. It
writes structure and grammar, chronologically, clause by clause, leaving nothing unexplained
and nothing silently omitted.

---

## Confirmed output format

Locked 2026-07-18. This markdown is the **presentation source**: **every blank line = a new
slide.**

Two axes: **grammar structure** (outline from the skeleton) and **commentary grain**
(phrases). H1/H2 are context only — **not** part of the outline. The outline is
`####` / `-` / `+` / `*`, with **indentation left→right** showing structural depth.

```markdown
# TODO: contexto
## TODO: unidad

### Tito 1:1–3 — *y a su propio tiempo manifestó su palabra por la predicación,*

*Pablo, siervo de Dios, apóstol de Cristo Jesús, según la fe…*
*para la esperanza de la vida eterna, la cual prometió…*
*y a su propio tiempo manifestó su palabra por la predicación…*

+ *Pablo, siervo de Dios, apóstol de Cristo Jesús, según la fe…*

- *la cual prometió el Dios que es sin mentira,*
*la vida eterna*

* "la cual" abre una frase que habla más de *la vida eterna*.

#### *y a su propio tiempo manifestó su palabra por la predicación,*

* "y" une esta frase a la anterior. Solo suma; no cambia el sentido ni da una razón.

- *la cual me fue confiada según el mandato de Dios nuestro Salvador.*

* "la cual" abre una frase que habla más de *su palabra*.
```

**Slide / blank-line rules:**
- **Blank line = new slide.** No exceptions.
- **H3 unit claim = its own slide** — `### {reference} — *{independent clause}*`, then a
  blank line.
- **Reading quotes = the next slide** — no blanks between verse quotes; one trailing blank
  ends that slide.
- **Each `####` / `-` / `+` / `*` line is its own slide.** One trailing blank ends the slide.
- **Keep slides short.** A clause slide may include at most its Scripture marker plus one
  antecedent Scripture line. Reader notes, Def/XRef pins, and every `*` grammar note each
  get **their own slide** (blank between). Do not stack many comment lines onto one slide —
  that forces Writer cleanup later.
- **Grammar labels:** Spanish first, then Greek in parentheses when known —
  `"enseñando" (διδάσκοντες)`, `"para que" (ἵνα)`.

**Structural rules:**
- **H1** = context (TODO — human-assigned). Not outline.
- **H2** = unit (TODO — human-assigned). Not outline. Same slide as H1 (no blank between).
- **H3** = `### {reference} — *{root clause}*` — span reference plus independent clause on
  **one heading line** (auto from O). Own slide; blank after.
- **Reading block** = every LBF verse for the unit, quoted in document order on the slide
  after H3. No label line.
- **Outline** (skeleton — this is the visible structure of the passage):
  - **`####`** = root clause (finite, independent) — own outline slide; may repeat the H3 claim text
  - **`-`** = dependent clause only (finite verb)
  - **`+`** = phrase / verbless non-clause Scripture
  - **`*`** = mechanical grammar note (its own slide, after the unit it explains)
  - **Indentation** = dependency depth (left→right). Nested dependents indent further.
- **`+` phrases:** every Spanish word not inside any finite-clause `selectedSpan` must
  appear as `+` — whole verbless verses and intra-verse gaps alike. Finer splits inside a
  `+` chunk = writer (or later O).

**Typography (locked — Scripture-only style):**
- **Scripture** (H3 claim, reading quotes, `####`, `-`, `+`, antecedents, and Scripture
  named inside a note): markdown italics only → `*…*`. Nothing else is italicized.
- **Grammar-note lines** open with `* ` (outline marker + space) and stay roman.
  Metalinguistic tokens use straight `"…"`.

---

## Input data (read live from O, per `cgv-product-suite-spec.md`'s Compiler architecture)

For each finite-verb clause already reviewed in O:
- `relation`: root / description / content / frame (Q1/Q2/Q3 result)
- `frameType`: purpose / reason / condition / time (when relation is frame), including
  inherited values from `coordinate-inheritance-spec.md`
- `parentClauseId`
- The clause's own opening marker word (connector or subordinating particle), and whether
  it's classified relational or subordinating (per `manual-markdown-format-spec.md`)
- Attached participles (attributive/substantival/circumstantial) and what they attach to
- Infinitives inside the clause span (morph mood N) — listed with a mechanical `*` naming
  the host finite they complete (e.g. δεῖ + εἶναι). No O observation step yet; students
  may later find them first, but Compiler states them for the manual now.
- The Spanish text span for the clause (via the resolved Greek→Spanish alignment)

**Phrases vs parked — Compiler rules (locked):**
- **Uncovered Scripture** (no word id inside any finite-clause span): emit as **`+`** in
  document order inside the H3 unit of the following root — whole verbless verses and
  leftover phrases inside verses that have other clauses. **No mechanical `*` on the `+`
  itself** (participle notes for words in that phrase may follow). Writers may split further.
- **Parked clauses** (Q1 describes a noun not inside any clause row yet): still emit as
  **`-`** in document order under the following root’s unit. **No “pending” sentence in
  the body** — list each id in generation flags so O can finish attachment. Do not drop them.
- **Nothing omitted:** every LBF word appears in the reading block and in exactly one of
  `####` / `-` / `+` in the dissection; unresolved attachment is a flag, not silence.
- **`*` notes:** one explanation per fact; never emit the same `*` text twice in a row;
  never park a bare Scripture line after a `*` (antecedents for relatives sit under `-`;
  participle antecedents are named only inside the `*` prose).
- **Reader notes:** plain `Nota (Lector):` lines under the matching verse’s parent (own slide).
- **Compiler pins (definitions / cross-refs):** targeted by a line in the generated markdown
  (UI: click a line or search). Stored with the **exact text of that line** as a durable
  anchor, plus the current line number. Inserted after that line on Export as
  `Def. (lemma):` / `XRef (lemma):` — each its own slide. **Never** as `*` grammar slides.
  Regenerate **rematches** pins by anchor text (does not wipe them). If the target line
  wording changed, the pin becomes an orphan until reattached in Occurrences.

---

## Generation algorithm

Walk root clauses in document order. For each:

1. Emit `### {reference} — *{root clause}*` on one heading line, then a blank (H3 slide).
   Then emit the reading-block quotes as the next slide.
2. Before emitting the dissected root, emit any dependents / `+` / parked items that appear
   *earlier* in the text than the root — nested, in document order (bullets may sit above
   the `####` they depend on).
3. Emit `#### "{root clause quoted text}"` as its own outline slide (same text as the H3 claim).
4. If the root clause opens with a relational connector, emit its `*` explanation
   (template below). If asyndeton (no connector), state that plainly too — asyndeton is a
   real finding, not a gap (per `root-clause-connectives-spec.md`).
5. Walk every remaining dependent attached to this root, **in document order, one at a time —
   emit the `-`/`+` text, then immediately its `*` explanation, before moving to the next.**
6. For a coordinate-inherited clause (shares a parent's `frameType` via plain connector),
   use the inheritance template, not the normal marker template — it should name what it
   shares and with which sibling.
7. If any clause in this span has infinitives, emit each as its own `*` (completes the host
   finite). Then emit attached participle explanations the same way.
8. If any verbless material logically belongs in this span and wasn't already handled, fold
   it in as its own **`+` phrase** (no mechanical `*` line). Never emit verbless material as
   `-`. Parked finite clauses fold in as `-` and are flagged, not narrated in the body.

**Before generating, verify the root clause itself is actually correctly classified —
Compiler should not silently trust a clause tagged root without basis.** Concretely: if a
clause tagged root sits immediately adjacent to still-unplaced verbless material, and that
clause opens with a **relative pronoun**, flag it rather than generating output that treats
it as settled — this was exactly the `1:2:6` case (a relative clause describing "vida eterna,"
inside unplaced 1:1–2 material, incorrectly sitting as root rather than as a Q1 description).
Do **not** flag bare demonstratives the same way: openings like Ταῦτα λάλει (2:15, "Estas
cosas habla") or Τούτου χάριν (1:5) are ordinary deictic roots, not the 1:2:6 pattern. A
simple relative-pronoun + unplaced-neighbor flag is enough.

---

## Mechanical explanation templates

Fill in `{word}`, `{parent}`, `{noun}`, etc. from the actual data — these are patterns, not
literal strings to reuse verbatim if the specific case needs different phrasing.

**Voice:** plain Spanish (roughly 5th-grade). State what the word is doing and why that is
certain from the grammar. Explaining grammar and what is occurring is **not** interpretation.
Do **not** add theology, application, or “what this means for us.”

**Relational connectors (root-clause level):**
- Adición (καί): `"{word}" une esta frase a la anterior. Solo suma; no cambia el sentido ni da una razón.`
- Contraste (ἀλλά): `"{word}" marca un giro: lo que sigue va en otra dirección respecto a lo anterior.`
- Razón/fundamento (γάρ): `"{word}" da la razón de lo que se dijo antes.`
- Inferencia (οὖν): `"{word}" saca una conclusión de lo que se dijo antes.`
- Pivote suave (δέ): `"{word}" sigue la idea anterior y la une a esta frase.`
- Asíndeton: `Esta frase empieza sola, sin una palabra de enlace (como «y» o «porque»).`

**Subordinating markers (dependent clauses):**
- Propósito (ἵνα/ὅπως): `"{word}" dice el propósito de «{parent verb}» — para qué se hace esa acción.`
- Contenido (ὅτι tras verbo de decir/pensar): `"{word}" abre lo que se dice o se piensa en la frase anterior — el contenido de esa idea.`
- Condición (εἰ/ἐάν): `"{word}" pone una condición: «si esto…», entonces aplica lo de la frase anterior.`
- Tiempo (ὅτε/ὡς/ἐπεί): `"{word}" dice el momento relacionado con la frase anterior — cuándo.`
- Descripción (pronombre relativo): `"{word}" abre una frase que habla más de *{noun}*.`
- Razón (subordinada): `"{word}" da el motivo de la frase anterior — por qué se dijo eso.`

**Coordinate inheritance:**
`Esta frase va unida con «{connector}» y sigue bajo el mismo «{shared particle}» de la frase anterior. No abre un(a) {relation type} nuevo(a); continúa el/la mismo(a).`

**Participles:**
- Atributivo: `"{participle}" describe a *{noun}*. No es el verbo principal; añade detalle sobre esa persona o cosa.`
- Sustantivado: `"{participle}" funciona como un nombre: señala a una persona o cosa (quién / qué), no solo describe a otra.`
- Circunstancial: `"{participle}" va junto a «{finite verb}». No es el verbo principal; muestra algo que ocurre al mismo tiempo o en relación con esa acción.`

**Infinitives (Compiler lists them; O find-step later):**
- With host finite: `"{infinitive}" completa a "{host}": dice *qué* se debe hacer o qué acción sigue.`
- No host clause yet: `"{infinitive}" nombra una acción que depende de un verbo cercano (como «debe» o «pide»).`
- One `*` slide per infinitive. Attachment = clause span containing the word, else nearest
  same-verse clause (same rule as participles).

**Verbless / phrase material (`+`):** no mechanical template — the `+` marker and unit
placement carry the meaning. Writer comments (if any) go under the `+` with no bullet.
Infinitive/`*` notes for words inside a `+` phrase may still follow that phrase.

---

## Output rendering note (separate, real work — not part of this pass)

Standard Markdown renderers do not preserve `-` vs `+` vs `*` as distinct visual types —
only nesting depth. The LaTeX/pandoc (or HTML) template needs **per-marker** style rules so
phrase (`+`), dependent clause (`-`), and grammar note (`*`) read differently in the final
PDF. Parent ownership (indented continuation under an item, including across blank lines)
must be preserved in that pipeline. This is separate from generating the markdown itself.

---

## C as a mode, scoped to one feature for this pass

Per `cgv-product-suite-spec.md`: R is what every user gets. O is a download. **C is a real
third mode, unlocked the same way O is — not a background script with no place to live.**
Add the R/O/C toggle now. For this pass, C needs exactly **one** screen: trigger generation
against O's current live data, display the resulting markdown, and allow exporting it. That's
the whole of C's UI for tonight — everything else it's meant to eventually hold (scripture
cross-references, term/word usage tracking reusing the translator project's existing
gatherer, "investigation" tools) is real, intended, and **explicitly out of scope for this
pass** — do not attempt to build any of it now.

---

## Not part of this pass

- H1/H2 section assignment — left as TODO placeholders, human-assigned.
- Term-tracking / scripture-gatherer reuse from the translator project — separate,
  not blocking this deliverable.
- Fine-grained phrase splits inside a verbless chunk (writer `+` lines, or a future O
  phrase-span layer). Compiler emits whole verbless units as `+` for now.
- Writer commentary under parents — human-written plain indented text; Compiler does not
  generate interpretive notes.

## Confirmed next step, after the skeleton generator is working and verified — do not build concurrently with the above

Once the skeleton generator is generating correct output and you've checked it against real
data (same discipline as everything else tonight — verify before building further):

- **Reuse the existing "generate occurrences" code from the `cgv-translator` project**,
  confirmed located at `/herramientas/cgv-translator/` (verified — this is the real
  translator project, not a naming collision). Reuse that occurrence-generation logic
  directly rather than rebuilding word/term-lookup from scratch.
- **Note on paths:** the product repo is `cgv-reader` (this tree; formerly `cgv-suite`).
  The archived Titus lab is `cgv-reader-old` — nothing there is part of active development.
- **A tools panel, on the left side of C's screen** — the home for gathering tools going
  forward (the reused word-gatherer, and whatever else C eventually holds).
- **A simple cross-reference finder** — same Scripture-only discipline as everything else in
  Compiler: locates other places a word/passage occurs, presents them, does not interpret or
  select which ones matter.

This is real, intended work — sequenced deliberately *after* the current deliverable, not
concurrent with it, to protect the 48-hour deadline for the skeleton generator itself.
