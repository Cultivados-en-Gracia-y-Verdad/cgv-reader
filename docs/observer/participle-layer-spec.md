# Participle Layer — Instructions for Claude Code

Companion to `skeleton-telos-spec.md` and `titus-audit-corrections.md`. This adds a new,
separate observation layer on top of the existing skeleton — participles never become new
skeleton rows, never add indent depth, and never change tree structure. Skeleton stays
exactly as it is today unless a student explicitly turns the new layer on.

---

## 1. Finding participles (mechanical, same pattern as Brick 1)

Morphology already tags mood. Any token tagged as a participle is a candidate — pure lookup,
no judgment. Surface these to the student the same way finite verbs are surfaced in Brick 1.

## 2. Sorting each participle — three checks, same interaction pattern as the existing clause questions

Ask in order, first "yes" wins:

1. **Does it agree (case, gender, number) with a nearby stated noun, and describe that noun?**
   → **Attributive.** Attach it to that noun the same way Q1 (description clauses) already
   works: student selects the noun, software resolves which clause contains it, same
   "not yet placed" fallback if the noun isn't inside any indexed clause yet.
2. **If no — does it stand alone, often with its own article, naming a person/thing rather
   than describing one** ("the one believing," "those teaching")? → **Substantival.** It
   isn't attached to anything else; it's functioning as a noun in its own right within
   whichever clause it sits in.
3. **If neither — is it riding on a nearby finite verb, adding circumstance to it?**
   → **Circumstantial.** Attach to the clause whose finite verb it's riding on.

Do **not** ask a fourth question trying to name the *kind* of circumstance (time, cause,
manner, concession, etc.) — per the earlier design discussion, Greek doesn't mark this
morphologically for participles the way it does with particles for finite dependent clauses,
so naming it would cross into interpretation. Stop at "circumstantial, attached to clause X."

## 3. Subject identification from circumstantial participles

This is the "participles help us see the subject" idea. Handle it as **displayed grammatical
fact, not an automatic conclusion** — consistent with the project's rule that nothing is
decided for the student:

- For every circumstantial participle, show its case, gender, and number (already available
  from morphology — no new tagging needed) alongside the finite verb's person/number.
- If the participle is **nominative**, visually note that nominative case is the subject's
  case — i.e., surface the grammatical fact ("this participle is nominative — nominative is
  the case a subject takes") rather than asserting "this is the subject of clause X." Let the
  student draw that conclusion themselves.
- If the participle is **genitive**, paired with its own genitive noun/pronoun, and that pair
  is not the object of a preposition — flag it distinctly as a **possible genitive absolute**
  (a participle carrying its own separate subject, independent of the main clause). Don't
  auto-classify it as one; just flag it for the student to evaluate, since this is a real but
  fairly rare construction worth a second look each time it appears.

## 4. Visual design — layered, not structural

Two techniques, combined:

**A. Underline-in-place (always visible, no toggle needed).**
The participle stays exactly where it already sits inside the clause's own displayed text.
No new row, no new indentation. Give it a distinct underline style — visually different from
any line style already used for the skeleton's tree connectors (e.g. a dotted or wavy
underline vs. the skeleton's straight solid connector lines), so there's no risk of the two
being read as the same kind of thing. Tapping/clicking it shows a small tooltip or popover
with its type (attributive/substantival/circumstantial) and, for circumstantial ones, what
clause it's riding on.

**B. Toggleable "flow" layer, off by default.**
A visible toggle (e.g. "show participles") switches on a layer over the current skeleton
view. When on:
- Relevant participle words get a subtle highlight (color/glow — pick something distinct
  from the relation-type badge colors already used for description/content/frame, since
  those already carry meaning).
- For circumstantial participles specifically, draw a thin connecting line from the
  participle to the clause row it's attached to. Make this line visually distinct from the
  skeleton's tree-branch lines — a soft curve rather than a straight connector is a good
  option, since the goal is literally to represent "flow" as something different in kind
  from "structure."
- When the toggle is off, the skeleton view must render pixel-identical to how it renders
  today. This needs to be true by construction (the layer is additive DOM/SVG on top,
  not a change to the underlying tree render), not just visually similar.

## Non-goals — explicit, to prevent scope creep back into the skeleton

- Participles never get their own row in the skeleton tree.
- Participles never add a level of indentation.
- No new mood category is introduced into Bricks 1/2/3 — participle mood is already
  distinct from finite-verb mood and stays that way.
- No automatic "this is the subject" conclusion — only the underlying grammatical facts
  (case/gender/number agreement) are surfaced; the conclusion stays with the student.
- No attempt to name the *kind* of circumstantial relationship (time/cause/manner/etc.) —
  out of scope per the discussion above.

## Suggested build order

1. Participle detection + attributive/substantival/circumstantial sort (reuses the existing
   three-question UI pattern and the noun→clause resolution logic already built for Q1).
2. Underline-in-place rendering (technique A) — ship this first since it requires no toggle
   state and is the lower-risk change.
3. Case/gender/number display + genitive-absolute flag (section 3).
4. Toggleable flow layer with connecting lines (technique B) — build last, once A is stable,
   since it's the most visually involved piece and the one most likely to need iteration.
