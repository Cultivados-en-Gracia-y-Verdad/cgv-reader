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

```markdown
### Tito 1:5

#### "Por esta causa te dejé en Creta"
* "Por esta causa" es un conector relacional que retoma lo dicho antes y presenta esta
  declaración como su razón o fundamento.

- "para que pusieras en orden lo que queda"
  * "para que" es un marcador subordinante de propósito — introduce la meta hacia la cual se
    dirige la acción de "dejé."
- "y designaras ancianos en cada ciudad"
  * Esta cláusula comparte el mismo "ἵνα" que la cláusula anterior, unida por "y" — no
    introduce un propósito nuevo, continúa el ya declarado.
- "como te mandé"
  * "como" es un marcador subordinante de tiempo — conecta esta cláusula con una instrucción
    previa ya dada.
```

**Structural rules:**
- **H1** = context (left blank/TODO — human-assigned, not generated).
- **H2** = unit (left blank/TODO — human-assigned, not generated).
- **H3** = root clause span, tracking the actual grammatical unit, not a bare verse number
  (e.g. `### Tito 1:1–3` when the root verb doesn't appear until verse 3 — see
  `manual-markdown-format-spec.md`'s Tito 1:1 discussion).
- **H4** = the root clause's own quoted, italicized text. This is now the anchor — mechanical,
  generated, not writer-chosen.
- **List level 1 (`-`)** = a dependent clause's own quoted, italicized text, in document order,
  chronological — never batch multiple clauses before explaining the first.
- **List level 2 (`*`)**, nested under level 1 (and directly under H4 for the root's own
  marker) = the mechanical grammatical explanation. **Every marker gets one. Never blank.**
- **List level 3 (`+`)**, nested under level 2 = reserved for a human writer's optional deep
  dive into a sub-phrase or single word. **Compiler never generates level 3 content.**

**Typography, no exceptions:** any span of actual Scripture text, at any level (H4 heading,
`-` clause, `+` deep-dive quote) — Spanish curly quotes + italic. Any explanatory text
(`*` lines, headings other than H4, everything Compiler writes about the text) — plain roman,
never quoted, never italicized.

**Marker choice (`-`/`*`/`+`) is for human readability in the raw file only.** It does not
guarantee visual distinction in rendered output — see `Output rendering note` at the end.

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
- The Spanish text span for the clause (via the resolved Greek→Spanish alignment)

For verbless material (e.g. Tito 1:1) not yet placed: per `skeleton-telos-spec.md`, this
stays visibly parked, not silently dropped, until placed. **Nothing gets left out — every
span of source text must appear somewhere in the output, either placed in the tree or
visibly flagged as pending placement.**

---

## Generation algorithm

Walk root clauses in document order. For each:

1. **Before emitting anything, check whether any of this root's dependents (or unplaced
   verbless material eventually folding into it) appear *earlier* in the actual verse text
   than the root clause itself.** If so, emit those first — still nested/indented to show
   their dependent relationship, but positioned above the H4 heading, in their real document
   order. **Nesting shows relationship; vertical position follows the text, not a rule that
   forces root-first.** This will sometimes place indented bullets above the H4 they depend
   on — that's expected and correct, not a formatting error to avoid.
2. Emit `### {reference span}`.
3. Emit `#### "{root clause quoted text}"`.
4. If the root clause opens with a relational connector, emit its `*` explanation
   (template below). If asyndeton (no connector), state that plainly too — asyndeton is a
   real finding, not a gap (per `root-clause-connectives-spec.md`).
5. Walk every remaining clause attached to this root, **in document order, one at a time —
   emit the `-` clause text, then immediately its `*` explanation, before moving to the next.**
   Never list multiple clause texts before explaining any of them.
6. For a coordinate-inherited clause (shares a parent's `frameType` via plain connector),
   use the inheritance template, not the normal marker template — it should name what it
   shares and with which sibling.
7. If any clause in this span has an attached participle, include its explanation as an
   additional `*` line under the clause it modifies (or under H4 if it attaches to the root).
8. If any verbless material logically belongs in this span and wasn't already handled in
   step 1, fold it in as its own `-` bullet with a `*` explanation noting it has no finite
   verb of its own and stating what it modifies.

**Before generating, verify the root clause itself is actually correctly classified —
Compiler should not silently trust a clause tagged root without basis.** Concretely: if a
clause tagged root sits immediately adjacent to still-unplaced verbless material, and that
clause's own text plausibly describes a noun inside that unplaced material (a relative
pronoun, a demonstrative), flag it rather than generating output that treats it as settled —
this was exactly the `1:2:6` case (a relative clause describing "vida eterna," inside
unplaced 1:1–2 material, incorrectly sitting as root rather than as a Q1 description). This
doesn't need to be a sophisticated check — even a simple flag ("this root clause opens with a
relative pronoun or demonstrative and sits next to unplaced material — verify before
trusting") catches the pattern without requiring deep grammatical analysis.

---

## Mechanical explanation templates

Fill in `{word}`, `{parent}`, `{noun}`, etc. from the actual data — these are patterns, not
literal strings to reuse verbatim if the specific case needs different phrasing, but they
must stay strictly at the grammatical level, never interpreting meaning or theological
significance.

**Relational connectors (root-clause level):**
- Adición (καί): `"{word}" es un conector relacional de adición — une esta declaración a la anterior sin introducir contraste ni motivo.`
- Contraste (ἀλλά): `"{word}" es un conector relacional de contraste — presenta esta declaración como un giro respecto a la anterior.`
- Razón/fundamento (γάρ): `"{word}" es un conector relacional que presenta esta declaración como razón o fundamento de la anterior.`
- Inferencia (οὖν): `"{word}" es un conector relacional que presenta esta declaración como una conclusión de la anterior.`
- Pivote suave (δέ): `"{word}" es un conector relacional que conecta esta declaración con la anterior.`
- Asíndeton: `Esta cláusula no lleva conector — inicia sin partícula de enlace.`

**Subordinating markers (dependent clauses):**
- Propósito (ἵνα/ὅπως): `"{word}" es un marcador subordinante de propósito — introduce la meta hacia la cual se dirige la acción de "{parent verb}."`
- Contenido (ὅτι tras verbo de decir/pensar): `"{word}" introduce el contenido de lo que se afirma en la cláusula anterior.`
- Condición (εἰ/ἐάν): `"{word}" es un marcador subordinante de condición — introduce una condición para la cláusula anterior.`
- Tiempo (ὅτε/ὡς/ἐπεί): `"{word}" es un marcador subordinante de tiempo — conecta esta cláusula con un momento relacionado en la cláusula anterior.`
- Descripción (pronombre relativo): `"{word}" introduce una cláusula que describe a "{noun}," mencionado antes.`

**Coordinate inheritance:**
`Esta cláusula comparte el mismo "{shared particle}" que la cláusula anterior, unida por "{connector}" — no introduce un(a) {relation type} nuevo(a), continúa el/la ya declarado(a).`

**Participles:**
- Atributivo: `"{participle}" es un participio atributivo que describe a "{noun}."`
- Sustantivado: `"{participle}" es un participio sustantivado — funciona como el nombre de una persona o cosa, no describe algo más.`
- Circunstancial: `"{participle}" es un participio circunstancial que acompaña la acción de "{finite verb}."`

**Verbless material:**
`Esta expresión no tiene verbo finito propio (cláusula nominal) y se une aquí a "{governing clause}."`

---

## Output rendering note (separate, real work — not part of this pass)

Marker character (`-`/`*`/`+`) is not preserved by standard Markdown renderers as a
distinguishing signal — only nesting depth is. The LaTeX/pandoc template needs a per-depth
style rule (distinct bullet/indentation/weight per list level) to make clause / mechanical
explanation / deep-dive visually distinct in the final PDF. This is genuinely separate work
from generating the markdown itself — per the earlier decision, do **not** rebuild the
pandoc+latex pipeline under this deadline; find the fastest working path to a presentable PDF
for this specific deadline, and treat the template's per-depth styling as its own later task.

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
- Any `+`-level deep-dive content — human-written only, whenever a writer chooses to add it.

## Confirmed next step, after the skeleton generator is working and verified — do not build concurrently with the above

Once the skeleton generator is generating correct output and you've checked it against real
data (same discipline as everything else tonight — verify before building further):

- **Reuse the existing "generate occurrences" code from the `cgv-translator` project**,
  confirmed located at `/herramientas/cgv-translator/` (verified — this is the real
  translator project, not a naming collision). Reuse that occurrence-generation logic
  directly rather than rebuilding word/term-lookup from scratch.
- **Note on `cgv-reader` paths:** the working project is root `/cgv-reader`. The earlier,
  unrelated same-named project at `/herramientas/cgv-reader` has been archived and renamed
  to `/herramientas/cgv-reader-old` — nothing there is part of this project.
- **A tools panel, on the left side of C's screen** — the home for gathering tools going
  forward (the reused word-gatherer, and whatever else C eventually holds).
- **A simple cross-reference finder** — same Scripture-only discipline as everything else in
  Compiler: locates other places a word/passage occurs, presents them, does not interpret or
  select which ones matter.

This is real, intended work — sequenced deliberately *after* the current deliverable, not
concurrent with it, to protect the 48-hour deadline for the skeleton generator itself.
