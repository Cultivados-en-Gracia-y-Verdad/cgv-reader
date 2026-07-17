# Participle Data & View Fixes

Follow-up to `participle-layer-spec.md` and `participle-mega-views-spec.md`, based on
auditing a real export (`cgv-reader_titus-progress-2026-07-14.json`) with all 32 candidates
supposedly classified.

---

## 1. Bug: a 32nd participle appears to be silently missing, not just unclassified

**Found:** `roots:titus:brick4:participleCandidates` (the ground-truth candidate list) has
**32** entries. `the-reader:spanish-clause-builder:titus:participles:v1` (the classification
store) has **31**. The student reports no candidate shows as "UNSORTED" anywhere in the app
— meaning this isn't a case of one being overlooked. If it were simply unsorted, it should
still appear in the "participles found here" list with an UNSORTED badge, the same way the
other 31 did before they were sorted.

**Likely cause:** the candidate list is keyed by raw Greek/morphology token id (format like
`170113-196`), but the classification store is keyed by a position-based id (format like
`1:5:9` — chapter:verse:word-index), matching the scheme finite-verb clauses already use.
Somewhere in between, each candidate's morphology id is being translated into that
position-based key. **If two of the 32 distinct source tokens translate into the same
position key** (e.g., an off-by-one in word-indexing at a verse boundary, or two tokens
resolving to the same index due to how the interlinear alignment counts words), the second
write silently overwrites the first — and the "found here" list, if it's built from the same
store rather than from the ground-truth candidate list, never shows a discrepancy at all.

**Fix:**
1. Build the "participles found here" list **directly from
   `roots:titus:brick4:participleCandidates`** (all 32, ground truth), not from whichever
   keys currently exist in the classification store. This alone will make a silent collision
   visible again — the list should always show exactly 32 rows, sorted or not.
2. Before writing a new classification, **check for key collisions**: if the computed
   position-key for a candidate would land on a key that's already occupied by a *different*
   source token, that's a bug in key generation, not a valid overwrite. Surface it loudly
   (don't allow the silent overwrite) rather than letting the second write clobber the first.
3. Add a one-time diagnostic pass over the current 32 candidates: compute each one's derived
   position-key and report any two that collide, so the specific pair causing this can be
   found and the underlying indexing bug fixed at its source.
4. **Check whether this same key scheme is used anywhere else** (finite-verb clauses,
   clause-builder spans) — if participle candidates can collide this way, the same risk may
   exist for finite verbs too, and is worth a quick audit while this is being fixed.

---

## 2. Flow chart — needs real labels, not anonymous bars

**Found:** the rendered Flow chart shows a row of bars with bare numbers underneath, no
indication of which root clause each bar represents. Auditing the underlying data directly
shows something real (7 of 28 root clauses carry any circumstantial participle at all;
`2:6:4` carries 3, `3:1:1` carries 2, five others carry 1 each) — but none of that is visible
in the current rendering, since there's no way to tell which bar is which clause.

**Fix, per the original spec (implementation gap, not a design change):**
1. Each bar must be tied to its actual root clause id and reference. Tapping/hovering a bar
   shows the clause's reference and text, plus the list of circumstantial participles
   counted under it (including ones several levels down in that root's subtree, per the
   original tally rule).
2. Zero-count bars should read as **"checked, found none"** — not as missing or broken data.
   A thin baseline mark or a faint zero-height tick, clearly present but visually minimal, so
   the 21 empty root clauses are legible as real, checked observations rather than gaps.
3. Root clauses should be identifiable in-place — e.g. a reference label (verse number)
   beneath or above each bar position, not just a raw count, so a student can tell at a
   glance where in the book a peak falls without hovering.

---

## 3. Emphasis view — fix the grouping key

**Found:** the Emphasis table currently groups attributive participles by their **displayed
Spanish gloss text** (e.g. "doctrina" appearing twice, from two different verses). Checked
against the underlying data directly: **zero** attributive participles in the full,
classified set share the exact same described-noun token span. That means the two "doctrina"
entries are two **different** Greek words or word-forms that both happen to translate to the
same Spanish gloss — the current grouping is merging distinct source words into one row,
which can produce a repetition pattern that isn't actually there in the Greek.

**Fix:**
1. Group by the actual **Greek token id (or lemma, if lemma data is available in the
   morphology set)** of the resolved described-noun span — not by the Spanish display text.
2. If lemma data isn't available, group by the exact resolved noun-span/token id instead
   (already noted as a fallback in `participle-mega-views-spec.md`), and show the Spanish
   gloss only as a label next to each Greek reference, never as the thing being grouped by.
3. If two different Greek tokens do happen to share the same Spanish gloss, keep them as
   **separate rows** — don't merge on translated text under any circumstances. If it would
   help the student, a small note ("also glossed 'doctrina' at Tito 1:9 — different Greek
   word") could be shown, but the grouping itself must stay Greek-token/lemma-based.

---

## Suggested order

1. Fix #1 first (the collision/missing-candidate bug) — until the source list is trustworthy,
   any aggregate view built on top of it is suspect.
2. Fix #3 (Emphasis grouping) — currently the more actively misleading of the two views,
   since it can manufacture a false pattern rather than just hiding a real one.
3. Fix #2 (Flow labeling) — the underlying data is already sound here; this is purely a
   rendering gap.
