# H3 flow — environment for continuous development

H3 = independent clause (objective).  
H2 = continuous development of consecutive H3s.  
H1 = major development of consecutive H2s.

Development does **not** come from grammar. This view is a clean strip of H3s so
the student can *read the flow* and mark where they observe a new movement.
Never “theme.”

---

## Philosophy

The app does **not** ask: “Do you accept my boundary?”

It asks: “Where do you observe a new movement?”

Then, if the student places one, the app may respond with supporting observations.
Those observations **justify**; they do not **make** the decision.

Default psychology: continuous reading — not constant interruption.

Students **participate**. The app does not hand them sections, contrast maps, or
topic titles. Pressure / tension marks are their observations about the flow —
never computer-delivered poles (luz/tinieblas, etc.).

---

## Interaction (locked)

1. **H3 strip** — book order, quiet `H3` + reference + Spanish independent-clause text, with
   **Quién actúa** (H3 root subject) beside each row so subject flow is readable down the strip.
2. **H2 at book start** — the first H3 always opens an H2 (given; not a user decision).
3. **No proactive Accept/Ignore** — the computer does not interrupt with suggested breaks.
4. **Begin new movement** — quiet control between H3s (visible on hover/focus). Places an H2 start before the next H3.
5. **Later H2 headings** — appear when the student places a movement start. Not “Development 1.”
6. **Supporting observations** — after a *user-placed* start, short bullets when measurable signals agree (dominant actor, mood/imperative, recipient) **or** when the student had marked pressure on that seam. Never a long “why suggested” lecture; never a required decision. Not shown above the opening H2 at 1:1.
7. **Remove movement start** — undo a placed H2 start (not the opening one).
8. **Name** — quiet optional label on a placed H2 → stored in `labels` → `## …` later.
9. **Mark pressure** — optional student flag *between* consecutive H3s (“I notice tension / opposition here”). Stores only `afterH3Id` in `pressureAfter`. Does **not** create an H2. Shows as a quiet tick on the strip; if the student later places a movement at that seam, appears as one support bullet (“You marked pressure here”). No app-supplied pole vocabulary.

Deferred signals for support list (same idea, later): vocabulary shift, discourse markers — only as post-decision support, never as prompts.

---

## Storage

```text
the-reader:spanish-clause-builder:{slug}:h3-flow:v1
```

```ts
{
  breaksAfter: string[];          // root finiteVerbId — next H3 starts a new H2 (user-placed)
  ignoredSuggestions: string[]; // legacy; cleared on reconcile
  labels: Record<string, string>; // first h3Id of an H2 → name (optional)
  pressureAfter: string[];        // H3 finiteVerbId — student marked tension before the *next* H3
}
```

---

## Relation to Skeleton

Skeleton presents **Book movement** (returns, formulas, convergence — see
`book-movement-spec.md`) above **H3 flow** (linear reading strip), then actors
and Candidate telos, with the clause tree **second** (grammar nest). Tree /
actors / markers stay for grammar; H3 flow is where the student *places* H2
movements after reading the macro layer.

Placed H2s are grouped visually as units **only after** the student places them —
never pre-drawn sections.

Transition detection in `h2-movements.ts` and student `pressureAfter` marks feed
**support after the fact**, not prompts to Accept/Ignore.
