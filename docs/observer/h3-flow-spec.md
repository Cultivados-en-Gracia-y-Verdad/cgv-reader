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

---

## Interaction (locked)

1. **H3 strip** — book order, quiet `H3` + reference + Spanish independent-clause text, with
   **Quién actúa** (H3 root subject) beside each row so subject flow is readable down the strip.
2. **H2 at book start** — the first H3 always opens an H2 (given; not a user decision).
3. **No proactive Accept/Ignore** — the computer does not interrupt with suggested breaks.
4. **Begin new movement** — quiet control between H3s (visible on hover/focus). Places an H2 start before the next H3.
5. **Later H2 headings** — appear when the student places a movement start. Not “Development 1.”
6. **Supporting observations** — after a *user-placed* start, short bullets when measurable signals agree (dominant actor, mood/imperative, recipient). Never a long “why suggested” lecture; never a required decision. Not shown above the opening H2 at 1:1.
7. **Remove movement start** — undo a placed H2 start (not the opening one).
8. **Name** (optional, later) — human label for an H2 → `## …` later.

Deferred signals for support list (same idea, later): pressure, vocabulary shift, discourse markers.

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
}
```

---

## Relation to Skeleton

This is where the student *arrives at* H2 movements. Tree / actors / markers stay
elsewhere for grammar. Transition detection in `h2-movements.ts` feeds **support
after the fact**, not prompts to Accept/Ignore.
