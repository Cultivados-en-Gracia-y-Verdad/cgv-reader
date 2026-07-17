# Participle Mega-Views — Book-Level Observation Layer

Builds directly on `participle-layer-spec.md` (detection + attributive/substantival/
circumstantial sorting). That spec classifies each participle. This spec is about making the
*aggregate pattern* visible at the whole-book level — three separate views, each answering a
different question, none of them touching the skeleton tree.

**Standing principle for all three views, restated at book-scale:** the app surfaces counts
and locations only. It never labels a peak "the author's main point," never calls a noun "the
theme," never asserts intent. That conclusion belongs to the student — same rule that governs
every other part of this method, just applied to aggregated data instead of a single clause.

These are three new panels/tabs, separate from Skeleton / Outline / Telos — call the group
something like "Participle Views," with three sub-tabs: **Flow**, **Emphasis**, **Cast**.

---

## 1. Flow (from circumstantial participles)

**What it shows:** where in the book circumstantial description piles up around the main
line, and where it doesn't.

**Data needed per root clause:** total count of circumstantial participles attached anywhere
in that root's subtree — not just participles riding directly on the root clause itself, but
any circumstantial participle attached to *any* clause descending from that root (a dependent
clause several levels down still belongs to that root's stretch of text). Walk each
circumstantial participle's attached clause up its `parentClauseId` chain to find its root
ancestor, then tally there.

**Rendering:** a single horizontal strip, one marker per root clause, in the same document
order as the Outline view. Marker height/visual weight is proportional to that root's tally.
**Always show the actual number next to each marker** — the visual weight is a quick-scan
aid, not a replacement for the number, per the standing principle above (no hidden
reasoning — the count is the fact, the height is just a faster way to notice it).

**Interaction:** tapping/hovering a marker shows the root clause's text and a list of every
circumstantial participle counted under it, each with its reference and which clause it's
directly attached to, so the student can trace the tally back to the actual text rather than
trusting the number blindly.

**What this makes visible:** stretches where the author loads a lot onto one main verb
(dense clusters — Titus 1:6–9's elder qualifications and 2:11–14's "training us" passage are
likely candidates) versus stretches carried by bare, undecorated main clauses. That contrast
*is* the flow — the student reads the shape of the strip, not a conclusion the app writes for
them.

---

## 2. Emphasis (from attributive participles)

**What it shows:** which nouns the author keeps coming back to describe.

**Data needed:** for every attributive participle, the noun it was resolved to attach to
(reusing the existing noun→clause resolution logic from Q1/description-clause handling).
Group by that noun. **Group by lemma if lemma data is available in the morphology set**, so
different inflected forms of the same underlying word count together; if lemma data isn't
available, group by the literal token/word instead, and flag this in the UI as a known
limitation ("grouped by exact word form — inflected variants counted separately") rather than
silently pretending it's lemma-accurate.

**Rendering:** a simple sorted list/table — noun, count, references — descending by count.
No word-cloud-style sizing without the number also visible; decorative sizing is fine as a
secondary cue, but the number is always shown, never implied only by size.

**Interaction:** clicking a noun jumps to each place it's described, showing the actual
participle and its clause.

**What this makes visible:** a term the letter circles back to repeatedly earns extra
descriptive weight each time — visible directly as a high count with multiple references,
without the app naming it a "theme."

---

## 3. Cast (from substantival participles)

**What it shows:** the categories of people or things the letter names via participle,
without needing separate interpretation to identify them ("the one who teaches," "those who
reject" — the participle already names the category in the author's own words).

**Data needed:** every substantival participle, as a flat list — its own text span and
reference. Group identical or near-identical phrasings together (same lemma/token caveat as
Emphasis above) to distinguish a category mentioned once from one that recurs.

**Rendering:** a simple list, split into two groups — **recurring** (appears more than once,
with all references) and **single-occurrence** — rather than one undifferentiated pile, since
recurrence itself is the signal worth seeing at a glance.

**What this makes visible:** the letter's implicit cast of named groups, directly from the
text's own vocabulary, with no need to infer who's being talked about.

---

## Non-goals (same discipline as the base participle layer)

- None of these three views modify, nest into, or add rows to the skeleton tree.
- None of them compute or display a conclusion ("this is the purpose," "this is the theme") —
  only counts, locations, and groupings.
- No cross-book comparison or external data — everything here comes from what's already been
  classified in Titus itself.

## Suggested build order

1. **Emphasis** first — simplest data shape (noun → count → references), and immediately
   useful even with a small number of attributive participles classified so far.
2. **Cast** second — similarly simple (flat list, group by recurrence).
3. **Flow** last — requires walking the parent chain to resolve each participle's root
   ancestor, and the strip rendering is the most visually involved of the three.
