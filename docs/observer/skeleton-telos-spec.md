# Skeleton / Telos — Design Spec

Handoff notes from a design session. Written for whoever implements this next (Claude Code
or a teammate) so the reasoning survives, not just the conclusions.

---

## Context

The Reader (`cgv-reader`) already has a working pipeline: finite verbs (Brick 1) → clauses
(Clause Builder, student selects the word span belonging to each finite verb) → mood
(commands/statements, Brick 2) → dependent-clause review (three yes/no questions per clause,
already implemented in `SpanishClauseBuilder.tsx`).

What doesn't exist yet: turning that review into a **skeleton** (indented structure), an
**outline** (the book's independent clauses in sequence), and a **telos** (the book's stated
purpose). This spec covers that missing piece, plus corrections found while prototyping it.

Everything here is downstream of the project's existing principle, stated in `README.md`:
*"Nothing depends upon hidden AI reasoning. The student should always be able to see exactly
what has been observed and how it was produced."* Every rule below exists to protect that.

---

## Interaction model — confirmed, updated from the original design

**The three questions below are no longer asked cold, in fixed order, for every clause.**
The shipped implementation (`clause-signals.ts`'s `detectClauseSignal`, wired into
`SpanishClauseBuilder.tsx`) evolved into a **suggestion/accept-reject model**: for each
clause, the Greek evidence at its own opening (relative pronoun, frame particle, ambiguous
particle, or none of those) is checked first, and where it's grammatically decisive, the
student sees a pre-tagged proposal ("Relative clause" / "Content clause" / a specific frame
type) with "Yes, that's it" / "Not quite — show me the options" rather than the three
questions in sequence. The three-question grid is still there — it's what "show me the
options" and any non-confident case (uncertain or none) falls back to, and it's still what
actually decides Q1/Q2/Q3's stored `describesNoun`/`isWhatWasExpressed`/`tellsWhenOrIf`
fields underneath.

This drifted in without an explicit decision being made about it (see
`clause-review-focus-bug-and-interaction-model.md`, investigated 2026-07-17), but on review
it's a **confirmed, intentional improvement, not a bug to revert**: the underlying data model
below (first-yes-wins, `parentClauseId` resolution, `frameType` derivation) is unchanged —
only *how the student is walked through it* changed, and the suggestion is always grounded in
the clause's own Greek morphology (never a guess dressed up as one), consistent with this
project's core rule. Two things this model requires going forward:

- **Confirming a clause auto-advances focus to the next unreviewed one.** This is real
  navigation, not a no-op — it must always be labeled explicitly ("Moved to next clause:
  {reference} · {text}"), never left to the student to notice on their own. This was a real,
  100%-reproducible bug (every confirmation silently jumped focus with no visual cue) before
  the label was added; treat the label as a permanent rule of this interaction model, not a
  one-off patch.
- A signal that isn't grammatically decisive (an ambiguous particle, or a relative pronoun
  whose real antecedent turns out to be embedded in its own clause rather than external — see
  the "relative of connection" idiom, e.g. Titus 1:13's δι' ἣν αἰτίαν) must **never** be forced
  into a confident proposal. It surfaces as `kind: "uncertain"` and falls through to the
  three-question grid for the student to decide directly.

## The three questions (corrected)

Asked in order, for every finite-verb clause not resolved via a confident suggestion above
(or when the student asks to see the options directly). First "yes" wins; if all three are
"no," the clause is independent (root).

**Q1 — Does this clause describe a noun?**
If yes: **the student selects the actual noun** in the surrounding text (a word span) — *not*
a clause from a list. The software then looks up whether that noun falls inside a clause
that already has a row:
- If yes → nest this clause under that row.
- If no (the noun sits in material not yet placed — e.g. a verbless unit, see below) →
  park this clause visibly with a label like *"describes a noun not yet placed in the
  skeleton,"* rather than forcing an attachment to the nearest available row.

This is the one correction from the original design. Q1 was briefly changed to "pick a
parent clause, like Q2/Q3" for data-shape consistency — that was wrong. A description
clause modifies a *word*, not a clause, and the word doesn't always live inside an
indexed clause. Forcing it into a clause-picker produces a false attachment. (Caught live
in testing: "which God... promised" modifies "eternal life," a noun that lives in the
verbless 1:1 material, not in any clause on the list.)

**Q2 — Is this the content of what someone said, thought, wanted, or commanded?**
If yes: student picks the parent clause from a list (the clause containing the verb of
saying/thinking/wanting/commanding). Same interaction as before — no change.

**Q3 — Does this clause give the time, reason, condition, or purpose for another clause?**
If yes: student picks the parent clause. The specific frame type (time / reason / condition
/ purpose) is derived automatically from the clause's opening word — not asked as a fourth
question. Lookup table (Greek particle → type):

| Type      | Particles                  |
|-----------|-----------------------------|
| purpose   | ἵνα, ὅπως                  |
| reason    | γάρ, διότι, ὅτι*            |
| condition | εἰ, ἐάν                     |
| time      | ὅτε, ὡς, ἐπεί               |

**\*Known open problem, unresolved by this spec:** ὅτι genuinely introduces both content
clauses (Q2) and reason clauses (Q3) in Greek, and nothing about the word itself
disambiguates — it depends on the governing verb, which is exactly what Q3 is supposed to
help a student discover, creating a circularity. This needs to be worked out by your Greek
students against real text, not decided in software. Flagging it here so it isn't lost:
**do not silently resolve this ambiguity in code — surface it to the student as a genuine
judgment call when it occurs.**

---

## Verbless nominal clauses (e.g. Titus 1:1a, Παῦλος δοῦλος Θεοῦ)

Greek regularly omits the copula in identity/apposition statements. These have no finite
verb, so Brick 1 never picks them up, and they are **not part of the skeleton pass at all.**

Do not invent a category for them now. Show them, visibly, as excluded from this pass
(e.g. a "no finite verb — set aside for the detailed pass" note), and leave them alone.
They get attached later, during detailed clause-level work, once the skeleton around them
is already fixed. Deciding their grammatical role now, before the skeleton exists, risks
forcing the structure to fit a premature decision rather than the other way around.

---

## H0 — not part of the software

H0 (the general theme / working title of the book) is **not data.** It is not a field, not
stored, not compared against anything by the software. It's the ordinary orientation a
reader already has after reading the book once, before any mechanical work starts. Its only
role is regulative: if the derived skeleton/telos ends up feeling structurally strange, that's
a cue for the *student* to recheck their mechanical work (a mistagged mood, a wrong
attachment) — not something the software checks, computes, or surfaces. **Do not build an
H0 input field.** This was proposed mid-session and correctly rejected — noting it here so
it isn't accidentally reintroduced.

---

## Deriving skeleton / outline / telos (pure arithmetic once the above is correct)

- **Skeleton** = every clause rendered at its indent depth, where depth = number of parent
  hops to root, walking the `parentClauseId` chain. Nest children directly under parents
  (not flat document order) — this is standard in phrase-line/arcing style diagramming.
- **Outline** = clauses with no parent (root), listed in book order.
- **Telos** = clauses where `relation === "frame"` and `frameType === "purpose"`, in book
  order. First one is the candidate telos. **Do not auto-conclude a match.** Show it next
  to the outline's last root clause and let the student judge the fit — computing a
  similarity score or declaring "confirmed" would be exactly the kind of hidden reasoning
  the project's philosophy rules out.

---

## Hard rule learned from prototyping: never build clause text from free translation

The prototype (Titus 1:1–5, hand-written English) produced two real bugs, both from the
same cause:
1. A clause folded a parent's finite verb and a content clause's finite verb into one
   line ("Paul mentioned that he would visit soon" — two verbs, one row).
2. An adjective (ἀψευδής, "the ever-truthful") got translated into English as a relative
   clause ("who never lies"), inventing a finite verb that doesn't exist in the Greek.

Both were caught by a human reviewer working the three-question flow correctly — the
*method* worked; the *data* was corrupted upstream. This is exactly why the real app never
lets a clause be built from free prose — it's built by selecting actual tagged source
tokens. **Any test data going forward (including anything used to test this feature) must
be built from the real morphology/alignment files, not hand-written translations.**

Files referenced by the existing code but not present in the uploaded zip, needed to test
against real data:
- `../../../cgv-data/bibles/NBLA/tito.nbla.md`
- `../../../cgv-data/morphology/MorphGNT/77-Tit-morphgnt.txt`
- `../../MNA/datasets/interlinear/NT/tito.tokens.jsonl`
- `cgv-bible` npm package (referenced as `file:../cgv-bible`)

---

## Existing types to extend, not replace

From `clause-data.ts` / `SpanishClauseBuilder.tsx` — reuse these shapes:

```ts
type ObservationAnswer = "yes" | "no" | "unsure";

interface ClauseObservation {
  describesNoun?: ObservationAnswer;
  describedNounSpan?: string[];       // Q1 — word span, NOT a clause id (see correction above)
  isWhatWasExpressed?: ObservationAnswer;
  expressedParentClauseId?: string;   // Q2
  tellsWhenOrIf?: ObservationAnswer;  // Q3 (rename/extend to cover reason & purpose, not just when/if)
  whenIfParentClauseId?: string;      // Q3
}
```

New, needed:
- A resolved `parentClauseId` per clause once Q1's noun-span is joined against existing
  clause spans (the lookup described under Q1 above).
- A `frameType` field (`"purpose" | "reason" | "condition" | "time"`) derived from the
  Greek opening token when Q3 is "yes" — via the particle lookup table above.
- Render functions for indent depth, outline extraction, and telos extraction — all pure
  functions over the existing `assignments`/`observations` data, no new storage needed
  beyond what's listed.

---

## Prototype for reference

An HTML/JS interaction prototype (no build step) was built during this session to test the
flow with sample data — useful for seeing the intended interaction, **not** for its sample
text (which is known to be flawed per the section above). Rebuild its data from real tagged
Titus text before trusting any output from it.
