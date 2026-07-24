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

Two axes: **grammar structure** (outline) and **Writer commentary**. H1/H2 are context
only — **not** part of the outline.

**Outline markers (locked):**

| Marker | Meaning |
|---|---|
| `####` | Independent clause |
| `-` | Dependent clause |
| `+` | Phrase — all other Scripture |
| `*` | Observer mechanical insert only |
| `>` | Writer entry (Reader notes, human commentary) |

Indentation left→right = structural depth. **Every scriptural word** appears once as
`####` / `-` / `+`. There is **no large reading-block** of verse quotes after H3 — the
H3 reference is enough for that; look up the full verses elsewhere.

```markdown
# TODO: contexto
## TODO: unidad

### Tito 1:1–3 — *y a su propio tiempo manifestó su palabra por la predicación,*

+ *Pablo, siervo de Dios, apóstol de Cristo Jesús, según la fe…*

- *la cual prometió el Dios que es sin mentira,*

+ *la vida eterna*
  * *la cual* abre una frase que habla más de *la vida eterna*. …

#### *y a su propio tiempo manifestó su palabra por la predicación,*

* *y* (καί) es una palabra de enlace. …

> Comentario del escritor.
```

**Slide / blank-line rules:**
- **Blank line = new slide.** No exceptions.
- **H3 unit claim = its own slide** — `### {reference} — *{independent clause}*`, then a
  blank line. **Reference = grammatical unit** (independent clause’s own verse plus
  dependents / `+` / parked in that unit) — always includes the root verse.
- **No reading-block quotes** after H3 (the large verse dumps). Reference is enough.
- **Each `####` / `-` / `+` / `*` / `>` line is its own slide.**
- **Keep slides short.** Clause slide = marker (+ optional antecedent only). Every `*` and
  every `>` gets its own slide.
- **Grammar labels:** Spanish first (italics), then Greek — `*enseñando* (διδάσκοντες)`.

**Structural rules:**
- **H1 / H2** = context / unit (TODO). Not outline.
- **H3** = reference span + independent clause claim.
- **No reading block** after H3.
- **Outline:** `####` independent · `-` dependent · `+` phrase · `*` Observer · `>` Writer.
- **`+` phrases:** every Spanish word not inside any finite-clause `selectedSpan`. Emitted
  in the **same unit** as the following root, including gaps after the root in the same
  verse. **Indent** matches the nearest preceding `####` / `-` in document order.
- **Writer `>`:** Reader notes → `> {text}` (and later human commentary). Never Def/XRef.
- **Def/XRef pins:** `* Def. (lemma): …` / `* XRef (lemma): …` — Observer `*` slides.

**Typography:**
- **Scripture** → markdown italics `*…*` only — H3 claim, outline spans, antecedents, and
  short tokens inside `*` notes (e.g. `* *para que* (ἵνα) dice el propósito de *dejé*…`).
  Greek confirmation stays in parentheses, roman.
- **`*` grammar lines** stay roman for the explanation prose. Pedagogical examples that are
  **not** quoting the passage may use «…». Never quote Scripture with `"…"` or «…».
- **`>` Writer lines** stay roman.

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
- **Nothing omitted:** every LBF word appears in exactly one of `####` / `-` / `+` in the
  dissection; unresolved attachment is a flag, not silence. (Full-verse reading dumps after
  H3 are omitted on purpose.)
- **`*` notes:** one explanation per fact; never emit the same `*` text twice in a row.
- **Noun-host nesting (hanging participles / Q1):** when a relative or participle hangs on a
  named noun, emit **one slide** with the host as `+ *{noun}*` and the nested `*` notes under
  it (no blank line between host and hangers — a blank would put the host alone on the prior
  presentation screen and the note would lose its anchor):
  ```markdown
  + *oro*
    * *perece* (ἀπολλυμένου) - participio
    * *probado* (δοκιμαζομένου) - participio
  ```
  Nesting under `+ *{noun}*` carries the hang; the `*` line only labels the form.
  (A generic “participio” gloss may later open on click — not required in the markdown.)
  Same for Q1 (`+ *Jesucristo*` + relative + hanging participles).
- **Reader notes:** Writer entries `> {text}` under the matching verse’s parent (own slide).
- **Compiler pins (definitions / cross-refs):** targeted by a line in the generated markdown
  (UI: click a line or search). Stored with the **exact text of that line** as a durable
  anchor, plus the current line number. Inserted after that line on Export as
  `* Def. (lemma):` / `* XRef (lemma):` — each its own `*` slide (same marker family as
  mechanical grammar notes). Regenerate **rematches** pins by anchor text (does not wipe
  them). If the target line wording changed, the pin becomes an orphan until reattached in
  Occurrences.

---

## Generation algorithm

Walk root clauses in document order. For each:

1. Emit `### {reference} — *{independent clause}*` (H3 slide). **Reference = grammatical
   unit** (root verse plus dependents / `+` / parked). **Do not** emit a reading-block of
   verse quotes after H3.
2. Before the dissected root, emit dependents / `+` / parked items that appear *earlier*
   than the root — document order (bullets may sit above the `####`).
3. Emit `#### *{independent clause}*` (same claim text as H3).
4. Root connector / asyndeton → `*` (Observer). Writer seeds → `>`.
5. Walk remaining dependents and `+` phrases **through the next independent clause**, in
   document order — including gaps *after* the root in the same verse. Each `-`/`+`, then
   its `*` / `>` slides, before the next item.
6. Coordinate-inherited clauses use the inheritance `*` template.
7. Infinitives / participles → each its own Observer `*`.
8. Verbless material → `+` only (never `-`). Parked finite clauses → `-`, flagged.

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

**Voice:** plain Spanish at about a **5th-grade** level. Fully expound: say what the
word/form **is**, what it **does** in the sentence, and what it is **not**. Do not leave
jargon unexplained (if you must name a case/role, define it in the same breath). Explaining
grammar and what is occurring is **not** interpretation. Do **not** add theology,
application, or “what this means for us.” Prefer 2–4 short sentences over a dense one-liner.

**Relational connectors (root-clause level):**
- Adición (καί): link-word like Spanish «y»; only adds; not a reason, not a «pero».
- Contraste (ἀλλά): turn/contrast; what follows goes another direction («pero» / «sino»).
- Razón/fundamento (γάρ): the «por qué» of what was just said; not a new topic.
- Inferencia (οὖν): «entonces» / «por eso» — next logical step, not a new reason.
- Pivote suave (δέ): continues the prior idea; mild advance or mild contrast; still connected.
- Asíndeton: starts with no visible link word; may still continue the thread.

**Subordinating markers (dependent clauses):**
- Propósito (ἵνα/ὅπως): the «para qué» of the parent action (goal, not past reason).
- Contenido (ὅτι tras verbo de decir/pensar): opens the *qué* that is said/known/thought.
- Condición (εἰ/ἐάν): «si esto…»; not asserted as a free-standing fact.
- Tiempo (ὅτε/ὡς/ἐπεί): the «cuándo» — not reason or purpose.
- Descripción (pronombre relativo): opens a phrase hanging on *{noun}*; adds detail about it.
- Razón (subordinada): the «por qué» of the prior phrase (foundation, not future purpose).

**Coordinate inheritance:**
Joined by «{connector}» and still under the same «{shared particle}» as the prior phrase —
continues that same relation type; does **not** open a new purpose/reason/etc. on its own.

**Participles:**
- With noun host (under `+ *{noun}*`): compact only — `*{spanish}* ({greek}) - participio`.
- Without noun host: define “participio” in plain Spanish, then nominative / clause-host /
  case-role explanation as needed.

**Infinitives (Compiler lists them; O find-step later):**
- Always define “infinitivo” (names an action without being the main verb).
- With host finite: completes "{host}" as the *qué*; read host + infinitive together.
- No host clause yet: depends on a nearby verb like «debe», «pide», «quiere», «puede».
- One `*` slide per infinitive. Emit under the clause only when the word is in that
  clause’s span; if the word is in a `+` gap, emit the `*` right after that `+` (still
  naming the nearest finite as host). Never before the Scripture line that carries it.

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

## Actor lines (from Structure SVO)

When O has Quién actúa (+ verb) on a clause, Generate emits a `*` slide with the
full triple under that clause’s `####` / `-` line:

`* *Dios* → *manifestó* → *su palabra*`

Also appends after the outline:

```markdown
## Actores

### Concentración
- *Dios* — 3 acciones

### Flujo
#### DIOS
- *Dios* → *prometió* → *vida eterna*
```

Same grouping rules as Skeleton B/C (`docs/observer/actor-svo-spec.md`). Omitted with a
warning when no actors are observed.

**H1 / H2 / H3 (locked).** Never “theme.”

- **H3** — independent clause (objective; outline root + dependents).
- **H2** — a continuous development of consecutive H3s.
- **H1** — a major development of consecutive H2s.

The `# TODO: contexto` / `## TODO: unidad` headings stay human-assigned. Generate
emits mechanical evidence so the writer can name developments from observations:

- Before the first H3 — a book-level evidence block, opened by a
  `{…}` comment line (curly braces = generator comment, never italics):
  `{Evidencia de Observador para nombrar desarrollo mayor (H1) y desarrollo continuo (H2) — no es comentario.}`
  then `* Actores dominantes del libro: *Dios* — 5 acciones · …` and
  `* Tono observado: 12 declaraciones · 3 mandatos.`
- After each H3 unit claim — `* Actúan en esta unidad: *criados* (2) · *Dios* (1)`
  counting observed subjects across the unit's root + dependents.

Evidence lines are Observer `*` slides — counts and Scripture words only, never
interpretation. Skeleton suggestions: `docs/observer/h2-movements-spec.md`.

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
