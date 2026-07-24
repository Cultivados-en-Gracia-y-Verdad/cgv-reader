# Manual Markdown Format — Confirmed Convention

Settled after several rounds of visual testing. This is the format Compiler /
Writer output should follow, and the norm to teach writers directly.

---

## Heading structure

- **H1** — context (human / TODO)
- **H2** — unit (human / TODO)
- **H3** — `### {reference} — *{independent clause}*`
  - **Reference = grammatical unit** (root verse + dependents / phrases / parked in the
    unit). Always includes the independent clause’s own verse. Example: root in 1:5 with
    outline material through 1:11 → `### Tito 1:5–11 — *Por esta razón te dejé en Creta*`.
  - Own slide; blank line after.
  - **No reading block** after H3 (no large verse dumps). The reference is enough for that.

**Explicitly rejected:** one heading level per dependency depth. List nesting carries depth.

---

## Scripture outline (locked)

Every blank line = a new slide. **Every scriptural word** must appear in the outline as
exactly one of `####` / `-` / `+`.

| Marker | Meaning | Who produces it |
|---|---|---|
| `####` | Independent clause (finite root) | Compiler ← Observer |
| `-` | Dependent clause (finite) | Compiler ← Observer |
| `+` | Phrase — everything else scriptural (verbless runs, gaps) | Compiler ← Observer |
| `*` | Mechanical grammar insert | Compiler ← Observer only |
| `>` | Writer entry (commentary, Reader seeds) | Writer / Reader |

**Indentation** left→right = dependency depth under the governing independent clause.

```markdown
# TODO: contexto
## TODO: unidad

### Tito 1:1–3 — *y a su propio tiempo manifestó su palabra…*

+ *Pablo, siervo de Dios…*

- *la cual prometió el Dios que es sin mentira,*

+ *la vida eterna*
  * *la cual* abre una frase que habla más de *la vida eterna*. …

#### *y a su propio tiempo manifestó su palabra…*

* *y* (καί) es una palabra de enlace. …

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
