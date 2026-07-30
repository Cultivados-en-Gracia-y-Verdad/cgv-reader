# Convergence engine — Movement Explorer

Built on `book-movement-spec.md` detectors. Never names an H2.

---

## Job

Answer only: **where do several movement signals pile up**, and is tension
**opening**, **intensifying**, or **resolving**?

The student still places the H2. The engine only ranks places worth looking.

---

## Inputs (derived)

From `buildBookMovementReport` plus optional:

- imperative H3 ids
- student `pressureAfter` marks
- reason-frame hits (`reasonHits`: reason clause + grounded root)
- student contrast observations (`contrastHits`: verseKey + poles)
- repeated-word returns (from book movement report)

Aggregated **by verse** (`ch:vs`), not by every clause.

---

## Signal weights (v1)

| Signal | Points |
|---|---|
| Writing-purpose statement | 5 |
| Writing formula (les escribo / he escrito) | 5 |
| Discourse reset | 4 |
| Vocabulary return (field reappears) | 3 |
| Vocab field convergence (≥2 fields) | 3 |
| Repeated-word return (content word reappears) | 3 |
| Imperative on an H3 in the verse | 3 |
| Student pressure mark on a seam into this verse | 3 |
| Reason frame grounding an H3 | 3 |
| Student contrast on this verse | 3 |
| Assurance formula (sabemos / conocemos) | 2 |
| Repeated formula family hit | 2 |

One weak signal never dominates the strip. Bars show relative score.

---

## Pressure lifecycle

Each ranked verse gets at most one phase tag:

- **opens** — reset, new writing purpose, or contrast pair first clustering, without strong assurance/resolution
- **intensifies** — vocabulary / repeated-word return, reason grounding, formula return, or student pressure after an open stretch
- **resolves** — purpose toward knowing/life/joy complete, dense assurance, or late “he escrito… para que sepan”

So high scores are not all treated as beginnings. Some are landings.

---

## UI (Movement view)

Dedicated Structure mode:

1. **Convergence strip** — scored verses as bars (hotspots emphasized)
2. **Verse dashboard** — signals grouped (writing, resets, reasons, formulas, repeated words, vocab families, commands, assurance, pressure, contrasts)
3. **Development** — tension / pressure / argument assembled for the selected verse (omit empty)
4. **Verse text** — LBF Spanish on the right
5. **Your H2** — blank name; optional “Begin movement here”

Skeleton keeps the movement *inventory* (writing-purpose list, formulas, repeated words, semantic families) and a link into Movement view.

Never: “This is the H2.”

---

## Storage

Scores and evidence are derived. Student H2 / pressure reuse `h3-flow:v1`. Student contrasts use `contrasts:v1`.
