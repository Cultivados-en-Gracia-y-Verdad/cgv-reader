# Interlinear View — Instructions for Claude Code

## The gap

Every observation layer built so far (finite verbs, moods, clauses, participles, telos) has
one blind spot: **there's no way for a student to just look at the Greek text, word by word,
with its gloss.** Brick 1 already uses morphology + Greek surface forms internally to detect
finite verbs, so this data almost certainly already exists in the app's data layer — it's
just never been surfaced as its own browsable view. Right now, checking something as basic
as "what word comes right before this one" requires reverse-engineering token IDs from a raw
JSON export, which isn't reasonable to expect of a student (or of anyone, really).

## What's needed

A view, reachable directly from the Reader (not nested inside Brick 1's finite-verb flow),
that shows every word of a verse — or ideally the whole chapter/book — in order, each with:
- Greek surface form (as it actually appears in that verse — inflected, not lemma)
- Strong's number
- Morphology code (part of speech + parsing, same tags already driving Brick 1)
- Spanish gloss

This is exactly the shape of data the user already has access to externally (BLE-style
interlinear export: `ἐφανέρωσεν G5319 | V-AAI-3S | manifestar`) — the app should be
displaying its own equivalent of this, live, not requiring the student to go find it
elsewhere.

## Interaction

- Default: Spanish reading view, as it works today.
- A toggle or tap-through reveals the interlinear for the verse (or word) currently in view —
  Greek form, Strong's number, morphology, gloss, per word, in original word order.
- Tapping an individual Spanish word should be able to jump straight to its corresponding
  Greek word's info (this was requested directly: "at least i need to be able to click on the
  spanish word to see the greek lemma").
- Lemma (dictionary form) should be shown alongside the inflected surface form, not instead of
  it — both are useful for different reasons (surface form for spotting exact repetition of
  a word-form; lemma for recognizing the same underlying word across different inflections,
  which several other views — Emphasis, Cast — already depend on getting right).

## Why this matters beyond just "nice to have"

Two concrete, already-encountered problems this would directly fix:
1. **Verifying the app's own output.** Auditing whether a clause is really independent, or
   whether a participle's case actually matches a nearby noun, currently requires trusting
   either the export data blindly or someone's memory of Greek — both of which have already
   produced real mistakes earlier in this project. A visible interlinear lets a student check
   directly, the same way they already check finite verbs against morphology in Brick 1.
2. **Emphasis and Cast's lemma grouping.** Both of those mega-views already assume lemma data
   is available (per their own spec's fallback language). If lemma is being loaded for
   Brick 1's finite-verb detection but never surfaced elsewhere, exposing it here also
   directly enables fixing the Emphasis grouping-by-Spanish-gloss bug flagged in
   `participle-data-and-view-fixes.md` — group by the lemma this view now shows, not by the
   Spanish translation.

## Scope note

This is a reading/reference layer, not a new observation brick — it doesn't ask the student
to classify or decide anything. It exists purely so every other brick's output can actually
be checked against the real text, by the student, without leaving the app.
