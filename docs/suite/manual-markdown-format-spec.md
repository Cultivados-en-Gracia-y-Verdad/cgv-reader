# Manual Markdown Format — Confirmed Convention

Settled after several rounds of visual testing. This is the format Compiler /
Writer output should follow, and the norm to teach writers directly.

---

## Heading structure

Navigation vs structure (see also `CGV Editorial Architecture.md`):

- **H2** — development navigation. Stays **top and small**. Groups consecutive H3s.
  Human-named / TODO. Helps the reader track where the author has moved. Not outline.
- **H3** — **section context title** (navigation). Short, clear, reader-oriented,
  non-theological, non-preachy. Helps the reader recognize what this section is about.
  **Never replaces the H4.** Compiler may seed
  `### {reference} — *{independent clause}*`, but H3 remains a context title — Writer/Escriba
  may retitle it for clarity. Own slide; blank line after. **No reading block** after H3.
  - **Reference = grammatical unit** (root verse + dependents / phrases / parked in the
    unit). Always includes the independent clause’s own verse.
- **H4** — exact independent clause (textual structure / outline anchor). Never paraphrased.
- **H1** — major movement navigation. Groups consecutive H2s. Human-named / TODO.

Never “theme.” H1 is built from H2s; H2 is built from H3s. Outline structure is H4 / `-` / `+`.

**Explicitly rejected:** one heading level per dependency depth. List nesting carries depth.

---

## Scripture outline (locked)

Every blank line = a new slide. **Every scriptural word** must appear in the outline as
exactly one of `####` / `-` / `+`.

| Marker | Meaning | Who produces it |
|---|---|---|
| `####` | Independent clause (finite root) — Scripture only | Compiler ← Observer |
| `-` | Dependent clause (finite) — **Scripture only** | Compiler ← Observer |
| `+` | Phrase — **Scripture only** (verbless runs, gaps) | Compiler ← Observer |
| `*` | Mechanical insert (actors, tono, grammar, Def/XRef) | Compiler ← Observer only |
| `>` | Writer entry (commentary, Reader seeds) | Writer / Reader |

**Hard rule:** Never put non-Scripture on `-` or `+`. Evidence lines start with `*`:

`* Actores principales: *Dios* (1) · *ustedes* (1)`

**Indentation** left→right = dependency depth under the governing independent clause.

```markdown
# TODO: contexto
## TODO: unidad

### Tito 1:1–3 — *y a su propio tiempo manifestó su palabra…*

+ *Pablo, siervo de Dios…*

- *la cual prometió el Dios que es sin mentira,*

+ *la vida eterna*
  * *la cual*[^rel]: describe a *la vida eterna*.

#### *y a su propio tiempo manifestó su palabra…*

* *y* (καί)[^kai] une esta cláusula con la anterior.

> Breve comentario del escritor sobre esta cláusula.
```

---

## Writer entries (`>`)

Human / Reader commentary — not Scripture, not mechanical grammar, not Def/XRef pins.

- **Form:** `> {text}` on its own slide (blank after).
- **Sources today:**
  - Reader margin notes → `> {note text}`
  - Human Writer commentary in the same shape.
- **Never** use `*` for Writer content.

---

## Marker-line convention (Observer `*`)

Mechanical inserts from Observer / Compiler:

- Grammar notes under a clause (connectors, subordinators, participles, infinitives).
- Compiler Def / XRef pins → `* Def. (lemma): …` / `* XRef (lemma): …`

For a clause that opens with a grammatical marker — state under the clause, no indent.
Name what the word is doing; do not explain theology or application.

---

## Scripture typography

All Scripture = markdown italics `*…*` only — H3 claim, outline spans, antecedents, and
short tokens inside grammar notes (e.g. `*para que* (ἵνα)…`, `*dejé*`). No large
reading-block verse dumps after H3. Grammar `*` lines stay roman for the explanation prose;
pedagogical non-Scripture examples may use «…». Never quote Scripture with `"…"` or «…».
Writer `>` lines stay roman.
