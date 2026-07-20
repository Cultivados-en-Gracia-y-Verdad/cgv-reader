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
  - Next slide = reading block (LBF verses for the unit, italics).

**Explicitly rejected:** one heading level per dependency depth. List nesting carries depth.

---

## Scripture outline (locked)

Every blank line = a new slide. **Every scriptural word** must appear in the outline as
exactly one of `####` / `-` / `+`. The reading block is for reading aloud; it does **not**
replace clause-by-clause / phrase-by-phrase accounting.

| Marker | Meaning | Who produces it |
|---|---|---|
| `####` | Independent clause (finite root) | Compiler ← Observer |
| `-` | Dependent clause (finite) | Compiler ← Observer |
| `+` | Phrase — everything else scriptural (verbless runs, gaps) | Compiler ← Observer |
| `*` | Mechanical grammar insert | Compiler ← Observer only |
| `>` | Writer entry (commentary, Reader seeds, Def/XRef) | Writer / Reader / Compiler pins |

**Indentation** left→right = dependency depth under the governing independent clause.

```markdown
# TODO: contexto
## TODO: unidad

### Tito 1:1–3 — *y a su propio tiempo manifestó su palabra…*

*Pablo, siervo de Dios…*
*para la esperanza…*
*y a su propio tiempo manifestó su palabra…*

+ *Pablo, siervo de Dios…*

- *la cual prometió el Dios que es sin mentira,*
*la vida eterna*

* "la cual" abre una frase que habla más de *la vida eterna*.

#### *y a su propio tiempo manifestó su palabra…*

* "y" une esta frase a la anterior. Solo suma; no cambia el sentido ni da una razón.

> Breve comentario del escritor sobre esta cláusula.
```

---

## Writer entries (`>`)

Redefined: anything that is **not** Scripture and **not** an Observer grammar insert
uses the Writer marker.

- **Form:** `> {text}` on its own slide (blank after).
- **Sources today:**
  - Reader margin notes → `> {note text}`
  - Compiler Def pins → `> Def. (lemma): …`
  - Compiler XRef pins → `> XRef (lemma): …`
- **Human Writer** adds further `>` slides in the same shape.
- **Never** use `*` for Writer content. `*` is Observer-only mechanical grammar.

---

## Marker-line convention (Observer `*`)

For a clause that opens with a grammatical marker — state under the clause, no indent:

`"{word}" — [type] · [subtype]`

Types: **Conector relacional** vs **Marcador subordinante**. Name the type; do not explain
theology or application.

---

## Scripture typography

All Scripture = markdown italics `*…*` only. Grammar `*` lines stay roman; tokens `"así"`.
Writer `>` lines stay roman.
