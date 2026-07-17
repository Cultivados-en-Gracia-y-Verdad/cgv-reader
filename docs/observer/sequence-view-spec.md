# Sequence View — Reason / Solution / Imperative / Purpose / Recipient

Companion to `participle-layer-spec.md` and `participle-mega-views-spec.md`. This is the
last piece of the current participle-era work: a single, chronological walk-through of the
skeleton's root clauses, each annotated with whichever of five categories applies. It reuses
existing data — nothing new needs to be detected or tagged.

**What this is not:** a fifth mega-view alongside Flow/Emphasis/Cast, and not a "Subject
view" or "Solution view" as separate things. It's one sequence, walked in document order,
because the point is to let a student move through the book and watch the pattern the author
used — not to declare what that pattern means. The app shows the sequence; the student
listens to it.

---

## brick2B keeps its original purpose

Decided: `roots:titus:brick2b:commandRecipients` is **not** repurposed for participle-subject
data (that fact already has a home — the subject-agreement note below, and the
underline-in-place tooltip in `participle-layer-spec.md`; duplicating it into brick2B would
show the same fact twice, not add new visibility). Instead, brick2B is used for what it was
named for: **who an imperative is addressed to** (older men, older women, young women, young
men, slaves, Titus himself, etc. — Titus 2 shifts addressee repeatedly). This is genuinely
new information nothing else surfaces, and addressee shifts are themselves a real structural
signal — a change of who's being spoken to is one of the clearest ways a text marks a new
section, independent of any connective word. It becomes the fifth tag below.

## The five categories, and where each comes from (nothing new to build except recipient)

- **Reason** — root or dependent clauses already tagged `frameType: "reason"` (γάρ, διότι,
  ὅτι). Already detected, never surfaced in its own view until now.
- **Solution** — **not imperatives.** This is the content of what's to be believed — the
  object of faith the letter is presenting — and it's statement-mood (indicative) material,
  not a command. Identify it **by elimination**, not by a new tag: a root clause is a
  solution-candidate if it is (a) statement mood (already tracked, Brick 2) and (b) not
  itself tagged `frameType: "reason"`. No new detection logic — this falls out of data
  already collected.
- **Imperative** — root clauses already in `imperativeCandidates` (Brick 2). Already
  detected. This is the outplay, not the content, of what's believed — sequence position
  matters here (it should generally follow, not precede, the solution it's a response to;
  that ordering is something to observe, not enforce).
- **Purpose** — root clauses with a directly-attached `frameType: "purpose"` child (the
  telos-candidate logic already built for the Telos view — reuse it, don't recompute it).
- **Recipient** — for root clauses in `imperativeCandidates`, who the command is addressed
  to. This needs one new piece of student input: when reviewing an imperative-tagged root
  clause, the student names (or selects, if a running list of addressees exists) who it's
  for — a plain label (e.g. "older men," "Titus," "slaves"), not a grammatical derivation.
  Stored in `roots:titus:brick2b:commandRecipients`, keyed by clause id. Where the same
  addressee recurs across several consecutive imperatives, that's worth being visible as a
  run in the Sequence view (see rendering below), not collapsed into one entry — the
  repetition itself is part of what's observable.

## Data shape — reuse brick2B, don't invent new storage

`roots:titus:brick2b:commandRecipients` is currently unused (0 entries) but has the right
shape: a clause paired with an associated entity/attribute. Extend this bucket (or a sibling
bucket using the identical shape) so each root clause can carry:
- its category tag(s) from the five above (a root clause can carry more than one — e.g. a
  root clause can be statement-mood *and* have a purpose clause attached to it; don't force
  single-category exclusivity except where the categories are inherently exclusive, i.e.
  reason vs. solution, per the elimination rule above),
- and, where relevant, the subject-agreement note from a circumstantial nominative
  participle riding on it (per `participle-layer-spec.md` section 3) — this was the "identify
  the subject" thread; it belongs here rather than as a separate view, since it's just
  another fact about a given position in the sequence.

## Rendering

A single vertical (or horizontal, matching whatever the Outline view already uses) sequence,
one entry per root clause, in document order — same ordering as the existing Outline view.
Each entry shows:
- the root clause's reference and text,
- small, distinct tags for whichever of reason / solution / imperative / purpose apply,
- for imperative-tagged clauses, its **recipient** tag (who it's addressed to) — and since
  runs of consecutive imperatives often share the same addressee (Titus 2's older
  men/older women/young women/etc. sequence), visually group consecutive same-recipient
  entries so a run reads as one block at a glance, without collapsing them into a single
  row (each clause stays individually visible; only the grouping is visual),
- if present, the subject-agreement note from a circumstantial nominative participle,
- if present, a flag for a genitive absolute occurring at that point (per
  `participle-layer-spec.md` — this is a real transition marker, since a genitive absolute
  introduces a subject different from the main clause's; surface it prominently in the
  sequence, not as a footnote).

No summary line, no computed "this is the author's intent," no auto-generated paragraph
tying the sequence together. The sequence itself — walked in order — is the entire output.
What a student concludes from walking it is theirs, not the app's.

## Explicit non-goals

- Does not alter the skeleton tree.
- Does not name or assert the book's overall purpose, theme, or authorial intent — only
  shows, per root clause and in order, which of the five categories apply.
- Does not resolve the open question (flagged separately, for later work) of how consecutive
  root clauses connect to each other via connectives (δέ/καί/ἀλλά/asyndeton) — that's a
  distinct piece of work, noted but out of scope here.

## Status of related open threads (not part of this build — logged for later)

Per the last design discussion, two threads were named as unresolved and deliberately not
addressed yet, to be picked up one at a time after the participle work and skeleton
clarification pass:
1. How consecutive root clauses connect/relate to each other (connectives between them).
2. `brick2b:commandRecipients`'s original purpose (who a command is addressed to) — worth
   revisiting on its own terms once this reuse of its shape is stable, since the two purposes
   (command-addressee vs. sequence-category tagging) may end up wanting separate buckets
   rather than one shared one.
