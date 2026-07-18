# Manual Markdown Format — Confirmed Convention

Settled after several rounds of visual testing in this session. This is the format Compiler/
Writer output should follow, and the norm to teach writers directly.

---

## Heading structure

- **H1** — context
- **H2** — unit
- **H3** — Scripture reference, but **tracks the root clause's actual span, not a verse
  number.** A root clause doesn't have to respect verse boundaries, and a verse can contain no
  root clause at all — Tito 1:1 has no finite verb whatsoever (Παῦλος δοῦλος Θεοῦ... is a
  nominal sentence), and the whole 1:1–2 stretch belongs grammatically to the one main verb
  that doesn't appear until 1:3 (ἐφανέρωσεν). **`### Tito 1:1` should not exist as its own
  heading with an empty root line.** Instead, the heading spans however far the actual
  grammatical unit runs (e.g. `### Tito 1:1–3`). The H3 **heading line** is
  `### {reference} — “{independent clause}”` — unit claim on the same line as the reference
  (auto from O), not a separate slide. Under that heading on the same slide: the full-verse
  **reading block**. Dissection (`####` / `+` / `-` / `*`) follows on later slides.
  Verbless material like 1:1 surfaces as **`+` phrase** items (not `-` clause bullets).
- **H4 (`####`)** — root clause's own quoted Scripture (finite-verb independent clause), own
  outline slide; may repeat the H3 claim text. Writer phrase slices and comments use list
  markers below — not further heading levels for dependency depth.

**Explicitly rejected:** one heading level per dependency depth (H1=root, H2=dependent-1,
H3=dependent-2...). Markdown has six heading levels; dependency chains in Titus alone already
run three-plus levels deep under a single root (the ἵνα chain in chapter 2:
`2:8:8 → 2:10:16 → 2:12:16`), and combined with description/content clauses and participles
stacking on the same passage, a heading-per-depth scheme would run out of room. List nesting
has no such ceiling — see below.

---

## Root, dependents, and phrases (locked with Compiler)

See also `docs/compiler/compiler-manual-generation-spec.md` — same markers.

**Presentation rule: every blank line = a new slide.** This file is the slide source.

| Marker | Meaning | Outline? |
|---|---|---|
| H1 / H2 | Context / unit labels only | No |
| H3 line | `### ref — *root…*` (own slide; blank after) | Unit claim |
| Reading quotes | Full verses on the next slide | Reading |
| `####` | Root clause (outline slide; may repeat H3 claim) | Yes |
| `-` | Dependent clause (finite) | Yes |
| `+` | Phrase / verbless Scripture | Yes |
| `*` | Mechanical grammar note (own slide) | Yes |

**Outline = skeleton.** Indentation left→right shows structural depth. H1/H2 are not part of it.

**Blank after H3** — unit claim is its own slide; reading quotes follow on the next slide.
Each `####` / `-` / `+` / `*` gets its own slide. Keep slides short: clause slide = marker
(+ optional antecedent only); each Nota/Def/XRef and each grammar `*` is its own slide.
Grammar labels name **Spanish then Greek**: `"enseñando" (διδάσκοντες)`.

```markdown
# TODO: contexto
## TODO: unidad

### Tito 1:1–3 — *y a su propio tiempo manifestó su palabra…*

*Pablo, siervo de Dios…*
*para la esperanza…*

+ *Pablo, siervo de Dios…*

- *la cual prometió el Dios que es sin mentira,*
*la vida eterna*

* "la cual" abre una frase que habla más de *la vida eterna*.

#### *y a su propio tiempo manifestó su palabra…*

* "y" une esta frase a la anterior. Solo suma; no cambia el sentido ni da una razón.
```

**Scripture typography (locked):** Scripture = markdown italics `*…*` only. Nothing else is
italic. Grammar-note lines open with `* ` (marker + space) and stay roman; tokens `"así"`.

---

## Marker-line convention

For any clause that opens with a grammatical marker — a root clause's connector or a
dependent clause's subordinating word — state, directly beneath the clause's own quoted
text, no indent:

**`"[word]" — [type] · [subtype]`**

Two types, genuinely different in kind:
- **Conector relacional** — links two independent, complete thoughts (γάρ, δέ, καί, ἀλλά,
  οὖν). Subtypes: razón/fundamento, contraste, adición, inferencia.
- **Marcador subordinante** — creates actual grammatical dependency (ἵνα/ὅπως, ὅτι, εἰ/ἐάν,
  relative pronouns). Subtypes: contenido, propósito, condición, tiempo, descripción.

**Hard rule: name the type, never explain the content.** "Conector relacional · razón/
fundamento" is observation — it's a categorical fact about the word. Writing prose about
*what* the reason actually is, or *what* the connection specifically means, is interpretation
— that's Compiler/Writer's job, not something O ever produces. If a marker line starts
turning into a sentence explaining content rather than naming a category, it's crossed the
line this whole method exists to hold.

## Scripture text styling

All Scripture — root and dependent alike — is quoted (curly quotes) and italicized. This
applies inside body text; whether it also applies inside H3 headings (if a heading ever
contains clause text rather than just a bare reference) is a separate, unresolved styling
question — flagged, not decided, since the current convention keeps clause text out of
headings entirely.
