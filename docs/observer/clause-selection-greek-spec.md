# Clause Selection Moves to Greek

Decided in this session, directly following from the "workstation is Greek, outcome is
Spanish" rule in `START-HERE.md` (Step 3). This is a reversal of current, working behavior —
not an addition — so treat it carefully, not as a quick swap.

## The decision

**Clause spans are selected and stored from Greek tokens, not Spanish.** Currently, the
opposite is true: the component is literally named `SpanishClauseBuilder`, a student taps
Spanish words to build `selectedSpan`, and a Greek range (`greekStartTokenId`/
`greekEndTokenId`) is tracked alongside as a secondary, derived field.

## Why this matters, concretely — not just in principle

Checked against real exported data: clause `1:2:6`'s Spanish `selectedSpan` covers word
positions 7–21, while its `greekStartTokenId`/`greekEndTokenId` is 5–12 — numbers with no
clean correspondence to each other. Spanish and Greek don't align one-to-one word-for-word
(one Greek word can spread across several Spanish words, word order shifts, prepositions
attach differently), so building the span from Spanish and *inferring* the Greek side after
the fact is a real, recurring place for silent misalignment — the same category of problem
that's already cost real accuracy more than once in this project (the ἀψευδής mistranslation,
the ὅ/κηρύγματι gender mismatch). Selecting directly on Greek tokens removes the inference
step entirely: the span *is* the grammatical unit, by construction, not something reverse-
engineered from a translation of it.

It also matches the "workstation is Greek" rule directly — every grammatical fact that
actually justifies a clause boundary (mood, the particle that opens it, case agreement for an
attached participle) lives in the Greek tokens, not the Spanish gloss.

## What changes

- **Greek token range becomes the authoritative `selectedSpan`.** Whatever field currently
  holds `greekStartTokenId`/`greekEndTokenId` becomes the real, primary clause boundary.
- **Spanish stays visible during selection as an aid, not as the deciding input.** The
  working view can (and should) still show the Spanish gloss right alongside each Greek word
  — same as any interlinear — so a student who isn't fully fluent in reading Greek unaided
  can still understand what they're selecting. What changes is narrower than "remove
  Spanish": the **tap target and the stored span are Greek tokens**; Spanish is there to help
  the student understand those tokens, not to define the clause boundary itself.
- **In the settled/outcome state, Spanish becomes the rendered result**, looked up via the
  existing alignment data (Greek token → corresponding Spanish word range) once a clause's
  Greek span is fixed — this part is unchanged from the original decision.
- **The component built around Spanish selection needs to be reworked**, not just renamed —
  its actual interaction (tap-to-select) needs to bind to the Greek interlinear tokens
  (already being merged into this same view per Step 3, item 1), with Spanish glosses
  displayed alongside for comprehension, not as the thing being tapped to form a span.

## Migration concern — this is not just a forward-only code change

The current export has 61 clauses already built via Spanish selection, with Greek ranges
that are, per the `1:2:6` example, not reliably consistent with their Spanish spans. Simply
switching which field is "authoritative" going forward doesn't fix data already built the
wrong way. Before trusting any existing clause's boundaries once this change ships:

1. Audit every existing clause's stored Greek range against its Spanish span for the kind of
   mismatch found in `1:2:6` — flag any that don't correspond cleanly rather than assuming
   they're fine.
2. Where a mismatch is found, the Greek range needs to be treated as ground truth going
   forward (per this decision) and the clause likely needs re-verification by re-selecting
   its span directly in Greek, not just relabeling the existing data.
3. This is worth doing as its own pass, not folded silently into other Step 2/3 fixes — it
   touches every clause already built, not one specific bug.

## Where this fits in the build order

This belongs at the front of Step 3 (`START-HERE.md`) — before the interlinear content/
placement merge, since clause selection and the Greek interlinear display are the same
interaction surface once this ships. Recommend inserting it as Step 3, item 0.
