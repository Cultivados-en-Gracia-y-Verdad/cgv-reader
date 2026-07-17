# Start Here — Instructions for Claude Code

This folder contains a set of design specs produced over several sessions. Read this file
first — it tells you what to actually do, in what order, and which other files to read when.

---

## The one operating rule for this pass

**Restructure the codebase toward the Reader/Observer split now. Do not build the heavier
destination infrastructure yet** (no native shell, no separate Compiler app-store presence,
no splitting into separate repos). Full reasoning in `cgv-product-suite-spec.md`, under
"Transition plan" — read that section before starting anything below.

**Note on app model:** R is the one app. O and C are both add-ons a user unlocks inside R —
not separate installs, not "kept deliberately apart" from Reader. This was refined mid-session
in `cgv-product-suite-spec.md`; read that file's Compiler section for why C needs to read O's
data live (shared local state), not via an export/import file boundary.

---

## Step 1 — Restructure first, before adding anything new

1. Separate the existing codebase into two clear zones — **Reader** and **Observer** —
   at the folder/module level, even though both still ship as one deployed app for now.
   Sort every existing screen into one zone or the other:
   - **Reader:** the plain reading view, margin notes — anything that's just encountering
     the text.
   - **Observer:** Brick 1–4 (finite verbs, mood, participles), the Clause Builder, the
     Q1/Q2/Q3 review, Skeleton/Sequence, the participle mega-views (Flow/Emphasis/Cast).
2. Build a visible **R / O toggle** — the real seam between the two, per
   `cgv-product-suite-spec.md`.
3. Do **not** touch fonts, native shell, stylus/ink, Compiler, or repo-splitting yet — those
   are explicitly deferred (see that file's transition plan section).

---

## Step 2 — Clause selection moves to Greek (do this before any other fix)

**`clause-selection-greek-spec.md`.** This runs **before** Step 3's bug fixes, not after —
everything in Step 3 (telos logic, coordinate inheritance) assumes clause boundaries are
trustworthy, and this step is precisely about verifying whether they are. Fixing telos or
coordination logic on top of possibly-wrong clause boundaries risks redoing that work once
this audit corrects them underneath.

A foundational reversal: clause spans move from Spanish-based selection to Greek-based
selection (the "workstation is Greek" rule applied to the actual clause-building interaction,
not just display — Spanish stays visible during selection as a comprehension aid, it just
stops being the thing that defines the boundary). Includes a **required migration/audit pass
over the 61 already-built clauses**, since their currently stored Greek ranges are not
reliably consistent with their Spanish spans (see the `1:2:6` example in that file — Spanish
span 7–21, Greek range 5–12, no clean correspondence). This is not a simple forward-only
field swap, and not a small piece of work — treat it as its own real task, not a quick
rename. Given this changes working functionality and touches all existing data, have Claude
Code restate its plan back before touching anything, more so than for any other item here.

---

## Step 3 — Fix what's broken, inside the newly-separated Observer zone

Read and implement, in this order — **after** Step 2's audit is complete, since a corrected
skeleton may change which clauses these fixes actually apply to:

1. **`participle-data-and-view-fixes.md`** — highest priority among this batch. Covers a
   likely key-collision bug hiding a 32nd participle candidate, plus fixes for the Flow chart
   (needs real clause labels, currently anonymous bars) and the Emphasis view (currently
   grouping by Spanish gloss text instead of the Greek token/lemma — can silently manufacture
   false patterns).
2. **`titus-audit-corrections.md`** — the mood mutual-exclusivity bug (a finite verb was
   found tagged as both imperative and subjunctive; fix requires greying out a token in
   other mood-selection views once it's assigned one), plus the noun→clause resolution check
   for Q1 (description clauses) and the telos logic fix (only purpose clauses attached
   directly to a root clause count as real telos candidates, not any purpose clause anywhere
   in the tree).
3. **`coordinate-inheritance-spec.md`** — a clause coordinated by plain καί/δέ/ἤ to an
   already-dependent clause (e.g. two subjunctive verbs sharing one ἵνα) needs to inherit
   that clause's relation and attachment, not be tested independently through Q1/Q2/Q3.
   Found by spot-checking the real Titus skeleton (clause `1:5:12`, currently miscategorized
   as an independent root). **After implementing, re-run the full audit across the whole
   book** — this will likely surface more instances beyond the one already found, and the
   root-clause count (currently 28) should drop once it's corrected.
4. **`root-clause-redo-fix.md`** — independent (root) clauses currently have no redo/revise
   control, unlike description/content/frame clauses. Since root is the default outcome of
   Q1/Q2/Q3, a student who mis-answers even one question currently has no way back. Likely
   same root cause as a missing-attachment check gating the redo control's visibility — fix
   needs to key off "has this clause been reviewed," not "does it have a parent/span." Also
   worth checking whether the same gap exists in mood marking or participle sorting.

---

## Step 4 — O is one self-assembling view (this is the whole shape of Observer)

**This is the single most important structural decision in this document.** Three earlier
drafts of this file described "merge the interlinear," "collapse Outline into Sequence," and
"build a self-assembling canvas" as three separate, staged steps. They aren't three ideas —
they're the same idea, arrived at three times independently over the course of this project.
Stated plainly, once: **Observer is not a set of screens. It is one continuous view of the
passage that changes shape as it's worked.**

- At rest, a passage is flat: plain text, Greek/lemma/gloss visible per word (this is what
  "Passage" and "Clause Workspace" and "the interlinear view" were all separately describing
  — they are the same screen. Do not build a standalone interlinear destination; see
  `interlinear-correction-spec.md` for why that was already tried and corrected once).
- As Brick 1–4 marking and Q1/Q2/Q3 happen, clauses nest in place — the same view, now
  showing structure. This is the Skeleton.
- As reason/solution/imperative/purpose/recipient tags and grammatical-marker anchor lines
  get filled in, the same rows get richer. This is Sequence — which is not a separate screen
  from the Skeleton either, it's the Skeleton's rows carrying more information. (Outline, as
  a separately-named bare list, doesn't exist as its own thing — it was just this view before
  tags were added.)
- **Hard rule protecting all of this:** clauses never move by drag-and-drop, ever. A clause
  only changes position by being re-answered through Q1/Q2/Q3 (or the participle equivalent)
  and getting a different result — the visual re-nesting is a rendering of a new answer,
  never a way of deciding placement.

**Language rule, confirmed against the mockup — state this explicitly, don't leave it
implicit:** the unmarked/working state is **Greek interlinear** (surface form, morphology,
lemma, gloss per word) — the marking decisions themselves (Q1/Q2/Q3, mood, participle sort)
depend on seeing the actual Greek, which doesn't fully survive translation. The settled
state, once a clause has resolved into the skeleton, renders in **Spanish** — reading
structure fluently is a different need than deciding grammar, and Spanish serves that better
than Greek does. Workstation is where grammar gets decided; outcome is where the shape gets
read. This transition (Greek while working → Spanish once settled) should happen per clause,
not as a single global switch — a passage will have some clauses still in Greek/working state
and others already settled into Spanish at the same time, side by side, as work progresses
through it.

**Build order within this one view** (each layer builds on the last, but they all render in
the same place, not as separate destinations to navigate between — clause selection itself
is already handled in Step 2, above, and doesn't repeat here):

1. **`interlinear-view-spec.md`** for *content* (what to show per word) +
   `interlinear-correction-spec.md` for *placement* (folded into the marking view, not a
   separate tab). Restate back in one or two sentences what you're building and where it
   lives before writing code, given this exact mistake already happened once.
2. **`skeleton-telos-spec.md`** — the corrected Q1/Q2/Q3 flow (Q1 attaches to a noun, not a
   clause, with a "not yet placed" fallback), verbless-clause handling, and how independent
   clauses settle out. (The coordinate-inheritance fix from Step 3 is a correction to this
   same flow, addressed earlier since it's a bug, not new feature work.)
3. **`participle-layer-spec.md`** — participle detection and the attributive/substantival/
   circumstantial sort, plus underline-in-place rendering, directly on the same passage view.
4. **`sequence-view-spec.md`** — the reason/solution/imperative/purpose/recipient tags,
   reusing brick2B's dormant shape for recipient. These attach to rows already standing in
   the view — not a new screen to navigate to.
5. **Grammatical-marker anchor lines** (connectives on root clauses; subordinating markers on
   dependent clauses) — not yet its own dedicated spec file; described in
   `cgv-product-suite-spec.md` ("Auto-suggested anchor points") and formatted per
   `manual-markdown-format-spec.md`. Each clause that opens with a marker gets a small label
   directly beneath its quoted text — the word repeated in quotes, then its type (relational
   connector vs. subordinating marker, plus subtype) — never merged onto the clause's own
   line, never its own indented tree row. Mechanical surfacing of markers already detected
   for frame-type classification, not new interpretive work.

---

## Step 5 — Flow / Emphasis / Cast (the one deliberate exception)

**`participle-mega-views-spec.md`.** Unlike everything in Step 4, these three genuinely don't
belong in the same continuous view — they're book-wide aggregates (a bar per root clause, a
ranked noun table, a grouped name list), not a clause-by-clause walkthrough with a natural
scroll position. Build these as a separate, deliberate "pull back and look at the whole book"
layer — the one place in Observer where stepping to a different screen is correct, not a
repeat of the interlinear/Outline mistake.

---

## Reference only — not build tasks for this pass

- **`cgv-product-suite-spec.md`** — the full four-app architecture (Reader / Observer /
  Compiler / Writer), licensing (GPL family), and the shared-core-plus-native-shell decision.
  Read it for context and for the transition plan governing Step 1. Everything about
  Compiler's native/app-store presence, the native shell, and stylus/ink is explicitly
  deferred — do not start building it now. Compiler's *data connection to Observer* (reading
  O's state live) is a real, near-term design constraint even though Compiler itself isn't
  being built yet — worth keeping in mind if Step 1's restructuring touches how Observer's
  data is stored.
- **`manual-markdown-format-spec.md`** — the confirmed markdown convention for Compiler/
  Writer's eventual output (heading structure — including how it handles a root clause
  spanning multiple verses or a verse with no finite verb at all, like Tito 1:1 —
  root-vs-dependent formatting, and the marker-line convention). Not a build task for O
  directly, but Step 4 item 5 above depends on its marker-line format, so read it alongside
  that item even though full Compiler/Writer output isn't in scope yet.

---

## If anything conflicts

If an exported progress file or existing code contradicts one of these specs, flag it rather
than silently picking one side — several real bugs in this project so far were only caught
because a discrepancy got surfaced instead of quietly resolved.

**Known internal correction, already resolved in the files above:** an earlier draft of
`cgv-product-suite-spec.md` had Reader's notes flowing into Observer with a confirm/reject
gate. That was reversed — notes now flow R → C, and Observer never receives them at all, not
even gated. The current version of that file already reflects this; flagging it here only in
case an older copy of the file is still floating around anywhere.
