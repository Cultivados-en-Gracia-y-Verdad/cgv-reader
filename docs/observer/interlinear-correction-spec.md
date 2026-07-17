# Correction: Interlinear Is Not a Standalone View

Follow-up to `interlinear-view-spec.md`. What got built is a well-presented but **isolated**
interlinear screen — its own destination, disconnected from where finite-verb marking, mood
marking, clause building, and participle sorting actually happen. That's a drift from what
was actually asked for, and it needs correcting before more gets built on top of it.

## What the original spec meant, restated plainly

From `cgv-product-suite-spec.md`: *"Interlinear is the center of Observer — not tucked inside
one brick's flow, but the base view everything else in Observer is built on top of."*

This was never a request for a fourth screen alongside Skeleton/Outline/Telos. It meant:
**there should be no separate "interlinear view" at all.** There is only the one working view
— the same screen where Brick 1–4 marking and clause building already happen — and *that*
screen should show Greek surface form, Strong's number, morphology, lemma, and gloss per
word, as part of what it already displays. Not a new place to go. The same place, upgraded.

## The fix

- **Remove interlinear as its own destination/tab.** Whatever screen currently does Brick
  1–4 marking, Clause Builder, and participle sorting is the one screen that needs the
  Greek/lemma/gloss data folded into it directly.
- Every existing marking interaction (tap a token to mark it a finite verb; tap to assign
  mood; select a span for a clause; sort a participle) should happen **on the same
  Greek-and-gloss display**, not on a separate plain view that then requires jumping
  elsewhere to check the actual words.
- Tapping a word for reference (to check its lemma, morphology, or gloss without marking
  anything) and tapping a word to mark/classify something should both be available **in the
  same place**, at the same time — not two different modes or two different screens.
- The "clean, dense, technical" visual style already built for the standalone interlinear
  screen is good and should be kept — the correction is about where it lives and what it's
  merged into, not how it looks.

## Why this matters concretely

Two things already blocked by the standalone version, both real, already-hit problems:
1. Checking `1:3:11`'s actual opening word (the ὅ / relative-pronoun case from earlier)
   required jumping out to a separate screen and back — exactly the friction this was
   supposed to eliminate.
2. The Emphasis view's lemma-grouping fix depends on lemma being visible **at the point of
   marking a participle or clause**, not on a separate reference screen a student would have
   to cross-check against afterward.

## Scope note, unchanged from the original spec

Still a reading/reference layer at heart — nothing about merging it into the marking view
turns it into a new observation brick. It doesn't ask the student to classify anything on
its own; it's the display the existing classification work now happens inside of.
