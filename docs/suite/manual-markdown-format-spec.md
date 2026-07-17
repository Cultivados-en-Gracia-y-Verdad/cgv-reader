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
  grammatical unit runs (e.g. `### Tito 1:1–3`), and verbless material like 1:1's opening
  surfaces later as a bullet under that root clause once the detailed pass places it — same
  treatment as any other dependent material, just verbless dependent material instead of a
  clause. Plain heading text either way, not the clause itself — the clause's own quoted text
  lives as body text directly underneath.
- **H4–H6** — reserved for whatever anchor-text/comment structure your existing manuals
  already use (anchor phrase, comment level 1, comment level 2) — unaffected by this spec.
  Anchors are human-chosen and not required to align with clause boundaries at all (see
  `cgv-product-suite-spec.md` discussion — a writer can anchor on a single connective word
  like "porque" if that's what needs explaining).

**Explicitly rejected:** one heading level per dependency depth (H1=root, H2=dependent-1,
H3=dependent-2...). Markdown has six heading levels; dependency chains in Titus alone already
run three-plus levels deep under a single root (the ἵνα chain in chapter 2:
`2:8:8 → 2:10:16 → 2:12:16`), and combined with description/content clauses and participles
stacking on the same passage, a heading-per-depth scheme would run out of room. List nesting
has no such ceiling — see below.

---

## Root clause and its dependents

**Root clause:** plain paragraph text directly under the H3, quoted and italicized like any
Scripture text. Its own connector (if it opens with one) stays inline, underlined in place —
never stripped out and never bulleted. Immediately below it, the marker line: the connector
word repeated in quotes, an em-dash, then its type (see below) — also plain text, no bullet,
no extra indent. Root and its marker are never bulleted; giving them a bullet or a heading of
their own would visually rank the root as more important than what depends on it, which it
isn't — it's the trunk, not the point.

**Every dependent clause is a list item**, nested to its actual dependency depth. Its quoted
text is the item; its marker line sits as a second line inside that same item, not merged
onto one line with the clause text (tested and rejected — cramming both onto one line reads
fine in isolation but becomes hard to scan once clauses run longer than a single verse).
Deeper dependents (a purpose clause nested under a content clause, for instance) just nest
the list further — indentation, not new heading levels.

```markdown
### Tito 1:5

"Porque de tal manera te dejé en Creta,"
"Porque" — conector relacional · razón/fundamento

- "para que pusieras en orden lo que queda,"
  "para que" — marcador subordinante · propósito
- "y designaras ancianos en cada ciudad"
  *(mismo ἵνα — hereda de la cláusula anterior)*
```

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
