# Titus Audit — Corrections for Claude Code

Findings from an audit of `titus-progress-2026-07-12.json` (a real export from the app).
Three items, in priority order. Companion to `skeleton-telos-spec.md` — read that first for
the underlying design; this file is the punch-list of what to actually fix.

---

## 1. Bug: a finite verb can be tagged with two moods at once

**Found:** token `170113-196` is present in both `roots:titus:brick3:mood:imperativeCandidates`
and `roots:titus:brick3:mood:subjunctiveCandidates`. Mood is mutually exclusive — a single
finite verb is one mood, never two. This is a real data bug, not a judgment call.

**Root cause:** each mood bucket (imperative / statement / subjunctive / optative) is
currently its own independent selectable set. Nothing stops a token from being added to more
than one.

**Fix — per the user's explicit UI direction:**
- Once a finite verb has been assigned a mood (added to any one of the four candidate lists),
  it should render **greyed out / disabled**, not its normal selectable color, in the
  selection UI for the *other three* mood categories. It remains normally interactive
  (editable/removable) only within the mood category it's currently assigned to.
- Clicking a greyed-out (already-assigned) token in a different mood's selection view should
  do nothing — or, if you want it correctable, surface a small affordance to reassign
  (remove from old bucket, add to new one) rather than allowing simultaneous membership.
- Enforce this at the data layer too, not just visually: before adding a token to any mood
  candidate list, check it isn't already present in one of the other three; if it is, block
  the add (or move it, per whatever UX you land on) rather than allowing both to persist.
- **One-time data cleanup needed:** token `170113-196` currently sits in both lists in
  existing saved progress. Decide which mood is correct (check the actual morphology tag for
  that token — it's the ground truth) and remove it from the incorrect list. Consider adding
  a startup/import check that flags this class of conflict if it's found in older saved data,
  so it surfaces rather than silently persisting.

---

## 2. Verify/implement: description clauses (Q1) need to resolve to a clause, not just store a noun span

**Found:** 10 of the 61 reviewed clauses have `describesNoun: "yes"` with a
`describedNounSpan` (a list of word-token IDs) — per the corrected design in
`skeleton-telos-spec.md`. But the raw export has no field showing these resolved into the
clause tree. Need to confirm whether this lookup is implemented at render time, or whether
these 10 clauses are currently floating, unattached, in the skeleton view.

**What's needed, if not already built:**
- At render time (not stored permanently — clause spans can change as students keep working,
  so this should be computed fresh, not baked into saved data), for each `description`
  clause: check whether any word ID in its `describedNounSpan` falls inside another clause's
  `selectedSpan`.
  - If exactly one match → nest this clause under that clause's row in the skeleton.
  - If it matches material that isn't part of any indexed clause (e.g. a verbless nominal
    unit, or text not yet reached) → render it visibly parked, labeled something like
    *"describes a noun not yet placed in the skeleton"* — same treatment as the excluded
    verbless-clause case, not silently dropped and not force-attached to the nearest clause.
  - If the noun span happens to overlap more than one clause's span → don't guess; surface
    both as options, or flag for the student to disambiguate. Don't pick one automatically.
- Test cases from the real export (use these to confirm the lookup works correctly):
  `1:2:6`, `1:11:2`, `1:11:7`, `1:11:11`, `1:13:9`, `2:1:5`, `2:14:2`, `3:6:2`, `3:11:3`,
  `3:11:7`. Note that `1:11:2`, `1:11:7`, and `1:11:11` all point at overlapping spans within
  `1:10:3`–`1:10:12`, and `3:11:3`/`3:11:7` point at the identical span `3:10:0`–`3:10:4` —
  good cases for checking the "multiple clauses describing the same noun" path specifically.

---

## 3. Logic gap: telos should mean "purpose clause attached directly to a root," not any purpose clause anywhere

**Found:** 12 clauses in the export are tagged `frameType: "purpose"`. Only 6 of them attach
directly to an independent (root) clause — the other 6 attach to something that is itself
dependent (a description clause, or another purpose clause), meaning they're a *sub-purpose*
of a dependent thought, not a purpose of the book's main line.

Direct-to-root (real telos candidates): `1:5:10`, `2:5:15`, `2:8:8`, `3:8:11`, `3:13:11`,
`3:14:15`.

Nested (sub-purposes, not telos-level): `1:9:10` (parent is itself a frame clause),
`1:13:13` and `2:4:2` and `3:7:7` (parents are description clauses), `2:10:16` and `2:12:16`
(a purpose-of-a-purpose chain: `2:8:8` → `2:10:16` → `2:12:16`, three deep).

**Fix:** wherever the Telos view currently filters clauses by `frameType === "purpose"`,
add a second condition — the clause's resolved parent must have `relation === "root"`.
Clauses that are purpose-tagged but whose parent isn't a root should either be excluded from
the Telos view entirely, or shown in a clearly separate, secondary group (e.g. "sub-purposes"
or "nested purpose") so they're visible without being confused with the book's actual stated
aims. Don't just widen the Telos view to include all 12 undifferentiated — that's exactly the
kind of blur the user is trying to eliminate.

---

## Not a bug, just worth surfacing to the user in the app somehow

28 of the 61 reviewed clauses (46%) ended up marked independent (root). That's not
necessarily wrong, but it's a high enough fraction that it's worth a lightweight way for the
student to sanity-check it themselves — e.g. a simple count/ratio shown somewhere ("28 of 61
clauses marked independent") rather than any automatic judgment about whether that's too
many. No fix needed unless the user asks for one; noting it here so it isn't lost.
