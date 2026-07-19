# CGV Product Suite — Architecture & Design Spec

Consolidated from a design conversation covering the product shape, separate from the
linguistic-method specs already written for Observer's internals (`skeleton-telos-spec.md`,
`participle-layer-spec.md`, `participle-mega-views-spec.md`, `sequence-view-spec.md`,
`titus-audit-corrections.md`, `participle-data-and-view-fixes.md`,
`interlinear-view-spec.md`). This document is the map those specs live inside.

---

## The founding discipline, spanning every app in the suite

Pure textual observation — no interpretation, no outside sources, no application. This isn't
a feature of one app; it's the reason the suite is split into four apps instead of one. Each
app exists specifically to keep one job from quietly bleeding into another:
- Reader must never push toward producing anything, or personal encounter with the text
  starts happening with one eye on output.
- Observer must never let a note, a feeling, or a "looks right" visual judgment substitute
  for an actual grammatical answer.
- Compiler must never reach outside Scripture — no lexicons, no commentaries, no historical
  background. Everything it gathers is other Scripture, nothing else.
- Writer is the *only* place a human's own explanatory prose enters — and even there, it's
  built from structure the text itself gave up, not from material the person brought in.

Four apps, four verbs — **Reader, Observer, Compiler, Writer** — each doing exactly one job
and handing off to the next.

---

## 1. Reader — public, free, everyone's front door

**Purpose:** pure encounter with the text. Listening, watching, observing — "pickling in the
text," enjoyment of it, nothing more. This was the very first thing described for this
project ("nice reader, clean, allows subtle comments, nothing more") and every later addition
has to protect that, not compromise it.

**Contains:**
- Multiple Bible version selection.
- Margin notes, attached per verse — same as writing in a physical Bible's margin.
- Highlighting (near-term).
- Scribbling / drawing / freehand annotation (later — see technical approach below; this is
  the feature most likely to need native, not just web, capability).

**Explicitly does not contain:** any structural/observational machinery (no bricks, no
skeleton, no clause tools), and no path that nudges a reader toward producing content. Reader
matures by becoming a better and better place to just sit with the text — not by being pushed
toward output.

**Preferences (new, needed now):**
- **Bible version** — Reader text only (`the-reader:titus:bible-version`). Titus sources from
  cgv-data: NBLA (default), BLE, SPNBES, RV1909, plus suite LBF. Switching does **not** change
  Observer (LBF + MorphGNT) or Compiler gathering data. Notes stay keyed by verse (`Tito.ch:vs`).
- **Language** — interface language (`en` / `es` for now), independent of Bible version
  (e.g. a Spanish-language interface reading an English translation should be possible).
  Shared across Reader, Observer, and Compiler chrome via `the-reader:titus:language`.
  Does not change Bible text or generated manual Spanish grammar notes.
- **Font** — typeface and size.
- UI: chrome preferences control (icon) holds language + Bible version.

**Quality bar ("pristine"):** concrete levers, not vague polish —
- Typographic measure (line length) capped for reading comfort regardless of screen width.
- Fonts embedded/bundled with the app rather than relying on whatever's installed on the
  device — this alone closes most of the cross-browser/cross-device rendering gap.
- Polytonic Greek rendering (accents, breathing marks) tested explicitly against real Greek
  text in the candidate fonts, not assumed to work because Latin/Spanish text looks fine.
- Minimal UI chrome — restraint, whitespace, the page reading like paper rather than software.

---

## 2. Observer — downloadable upgrade, attached to Reader

**Purpose:** where structural observation actually happens. This is where every linguistic
spec already written lives: Bricks 1–4 (finite verbs, mood, participles), Clause Builder,
Q1/Q2/Q3 dependency review, Skeleton/Sequence (one continuous view, not separate screens —
see below), the participle mega-views (Flow/Emphasis/
Cast), and the Sequence view (reason/solution/imperative/purpose/recipient).

**Interlinear is the center of Observer** — not tucked inside one brick's flow, but the base
view everything else in Observer is built on top of (see `interlinear-view-spec.md`).

**The self-assembling canvas (the key design idea from this session):** rather than separate
screens for "flat clause list" and "finished skeleton," Observer is conceived as **one
continuous view that reorganizes itself as it's worked.** A passage starts flat — every
clause in plain document order, undifferentiated. As each clause is answered through Q1/Q2/Q3,
the moment it's marked dependent, its row visually nests under its resolved parent, in place.
Nothing is a separate destination; watching the flat sequence resolve into structure *is* the
observation. Participle underlines, connective marks between root clauses, and sequence tags
(reason/solution/imperative/purpose/recipient) attach to rows once they've settled, as
further layers on the same standing view — not additional screens.

**Hard rule protecting that canvas:** clauses never move by drag-and-drop, ever, even as a
"quick fix." A clause only changes position by being re-answered through the actual
grammatical questions and getting a different result than before — the visual re-nesting is
a rendering of a new answer, never itself a way of deciding placement. "Looks wrong, so I
moved it" is never a valid interaction Observer permits.

**Auto-suggested anchor points ("skeleton with a little meat"):** beyond clause structure,
Observer also surfaces grammatical markers — starting with connectives (καί, δέ, ἀλλά, γάρ,
οὖν, and subordinating markers like ἵνα/ὅτι/εἰ) — as pre-populated anchor candidates a writer
can later keep or discard downstream. These are not clauses and never become tree rows; they
render as a small label directly beneath the clause they open (word repeated in quotes, then
its type — "relational connector" for markers joining independent thoughts, "subordinating
marker" for ones creating actual dependency), never merged onto the same line as the clause
text and never given their own indent level. Full convention in
`manual-markdown-format-spec.md`. This surfacing is itself mechanical — O already detects
these markers for frame-type classification — so nothing new is being interpreted, only
something already-found is being made visible as a candidate anchor, so nothing gets missed
to a student's intuition.

**Outline and Sequence are one view, not two.** Outline (bare root-clause list, in order) is
just Sequence before any of its five tags have been filled in — same rows, same order. There
should be one view that starts as the bare list and gets richer as reason/solution/
imperative/purpose/recipient tags are filled in, not two separately named destinations
showing overlapping slices of the same data (the same mistake already corrected once for the
interlinear view — see `interlinear-correction-spec.md`).

**Observer stays text-observation only — nothing else.** Notes a student writes in Reader do
**not** flow into Observer, not even with a confirm/reject gate (a reversal from an earlier
draft of this spec, which had notes flowing R→O — that was wrong). A margin note is a
reaction to the text, closer to what Compiler gathers than to what Observer mechanically
detects; routing it through Observer, even gated, was building a doorway into Observer for
something that was never its kind of material. Notes flow **R → C** instead (see Compiler,
below). This does leave an open, acknowledged gap: without notes carrying context forward,
how does a student get enough sense of *why* something matters while working in O, without
leaning on their own prior reactions? Not resolved — likely answered the same way the
auto-suggested anchors are: O doesn't explain, it just makes sure nothing goes unnoticed. The
explaining stays downstream, in Compiler and Writer.

---

## 3. Compiler — scripture-only gathering tool

**Purpose:** sits between Observer's structural output and Writer's prose. A "gathering"
tool, not an analysis or interpretation tool — it fetches and assembles, it doesn't argue or
explain. Currently in conception; the name itself signals the job (assembling scattered
material into something structured enough to hand off), matching the Reader/Observer/Writer
naming pattern of naming an action, not a content category.

**Scope, explicitly confirmed: Scripture only.** No lexicons, no commentaries, no historical/
cultural background material — that would be a real, deliberate step outside the founding
discipline, and it was explicitly ruled out. Everything Compiler gathers is more Scripture:
cross references, word/lemma usage elsewhere in the Bible, a book's own internal echoes (e.g.
Titus echoing or being echoed by Paul's other letters).

**An add-on to R, like Observer** — not a separate app users install independently, and not
"deliberately kept out of Reader" (a correction to an earlier draft of this spec). R is the
one app; O and C are both things a user unlocks inside it if they want them, the same way O
already works. This matters technically, not just as a workflow description: for "fix
something in O and see it reflected in C automatically" to actually work, **C must read O's
current state live — shared local data, not a one-time export/import file passed between two
separate programs.** That's a different (and better) architecture than treating Compiler as
consuming an "export" from Observer.

**Receives notes from Reader.** A student's margin notes, written in R, flow to C — not to O
(see Observer, above, for why that boundary matters). This is the one place in the pipeline
where a personal reaction to the text and the gathering/investigation work naturally sit
together, since both are downstream of pure observation rather than being pure observation
themselves.

**Feeds into Writer**, which is the existing markdown editor — Writer's job is applying the
right formatting (see `manual-markdown-format-spec.md` for the confirmed heading/marker
conventions) to whatever Compiler assembles, not gathering material itself.

---

## 4. Writer — existing markdown editor (mostly unchanged)

Already exists. Its scope in this architecture: take structured input from Compiler
(ultimately drawing on Observer's skeleton/outline/telos/sequence data as raw material) and
format it into finished manual content (e.g. the Titus CGV manual). Deliberately **not**
reachable directly from Reader — there is no shortcut from "just reading" to "producing
manual content." Everything passes through Observer and Compiler first.

---

## Technical architecture: shared core + native shell

**Decision:** build a shared core codebase (web technologies) for Reader (and eventually
Observer), wrapped in a **native shell** (e.g. Capacitor or Tauri) for actual app-store
distribution on phone, tablet, and desktop — rather than either (a) a bare website, or (b)
fully separate native codebases per platform.

**Why not bare web/browser-based:** browsers differ in rendering, and — more importantly —
browser-based canvas/input handling is genuinely worse than native ink APIs (e.g. Apple's
PencilKit) for the planned scribbling/stylus feature: worse latency, no real pressure
sensitivity. Given how central the "just like a real Bible" feel is to Reader, this is a
real, not cosmetic, gap.

**Why not fully native per platform:** would give the highest possible quality ceiling
everywhere, but multiplies effort substantially (three-plus codebases to build and maintain)
for a project currently built through one person working with Claude Code. Considered and
explicitly set aside as too large a commitment at this stage.

**The middle path:** one shared core handles layout, reading, notes, highlighting,
navigation, and most of Observer's interface. The native shell provides real app-store
presence on each platform, and gives a clean seam to drop in a genuinely native ink/stylus
layer specifically for scribbling when that feature is built — without rewriting everything
else. This also allows staged delivery: ship the shared core first, add native-only
capability (like stylus ink) later without a rebuild.

**Cross-browser font consistency** is mostly solvable within this approach by bundling fonts
with the app rather than depending on whatever's installed on the device — this closes most
of the rendering-inconsistency gap that motivated moving away from "just a website" in the
first place, separate from the stylus-latency reason.

**On "navigator":** clarified to mean browser-based delivery generally (not a specific UI
navigation control) — the concern was about output/rendering quality and consistency across
browsers, addressed above by the shared-core-plus-native-shell approach and font bundling.

---

## Licensing

**GPL family (copyleft).** Consistent with "not to be sold" — anyone who modifies and
redistributes the suite must also keep their version open, rather than a permissive license
(MIT/Apache) that would allow a closed, commercial fork later. This applies across the whole
suite — Reader, Observer, Compiler, and Writer.

---

## Transition plan — what starts now vs. what stays deferred

The suite above is the destination. This product repo (`cgv-reader`, formerly `cgv-suite`)
already separates Reader / Observer / Compiler at the zone and folder level. Keep landing
new work in the right place so the mixed-pile problem from the archived lab does not return.

**Start now:**
- **Separate Reader and Observer at the code-organization level immediately** — distinct
  folders/modules, even while both still ship as one deployed app. Every existing screen
  gets sorted into one or the other as this happens (e.g. the plain reading view → Reader;
  Brick 1–4, Clause Builder, Skeleton/Telos, participle views → Observer).
- **Build the R/O toggle now** as the real, visible seam between them — even before any
  native-shell work exists, this establishes the boundary in the product itself, not just in
  the code.
- **All new work (interlinear view, the participle/mood fixes already spec'd) gets built as
  Observer-zone work from this point on** — same tasks already queued, just built with the
  Reader/Observer line already drawn, not built flat and sorted later.
- **The notes confirm/reject bridge** can start now too, since Reader's note-taking already
  exists — this is the first real Reader→Observer handoff and worth having in place early,
  since it'll surface right away whether the boundary actually holds up in practice.

**Stays deferred, deliberately:**
- The native shell (Capacitor/Tauri) and any stylus/ink work — no reason to take on that
  infrastructure before Reader and Observer's actual content is further along.
- Compiler as a separate app — it's still in conception; building it now would mean building
  ahead of having stable Observer output to feed it.
- Splitting into genuinely separate repos/deployments — code-level separation (above) gets
  the benefit of the clean boundary now, without committing to the operational overhead of
  fully separate apps before it's needed.

The distinction to hold onto: **restructure toward the destination immediately; don't build
the destination's heavier infrastructure before there's enough substance to justify it.**

## Open / not yet decided

- Compiler's actual name (currently using "Compiler," settled this session, replacing the
  earlier placeholder "??" and a considered alternative, "Gatherer").
- Compiler's specific toolset — cross references and word/lemma usage are confirmed in
  scope; the full list of tools ("gathering information," "investigation," etc.) is still
  in conception and needs its own design pass once Observer's output stabilizes enough to
  feed it.
- Exact mechanism for how Observer's skeleton/outline/telos/sequence data gets structured for
  Compiler and, ultimately, Writer's formatting step.
- Highlighting and scribbling in Reader are confirmed as intended features but explicitly
  deferred — not part of the current build pass.
