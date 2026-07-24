# H3 flow — environment for continuous development

H3 = independent clause (objective).  
H2 = continuous development of consecutive H3s.  
H1 = major development of consecutive H2s.

Development does **not** come from grammar. This view gives a clean strip of H3s
so the student can see which ones keep going together and where the flow breaks.
Never “theme.”

---

## Interaction (locked)

1. **H3 strip** — book order, reference + Spanish independent-clause text.
2. **Bands** — accepted continuous developments (partitions of the strip).
3. **Suggested breaks** — dashed rules from observation transitions (actor / mood /
   recipient), with **Why suggested**.
4. **Accept** — turns a suggestion into a hard split (new development starts).
5. **Ignore** — hides that suggestion until signals change (or Clear ignored).
6. **Name** (optional, later) — human label for a band → `## …` later.
7. Manual split / join / range — next pass after Accept / Ignore.

Signal toggles (actor · mood · recipient under rows) — optional overlay; default off
in the first ship of this view (signals still feed suggestions).

---

## Storage

```text
the-reader:spanish-clause-builder:{slug}:h3-flow:v1
```

```ts
{
  breaksAfter: string[];          // root finiteVerbId — split after this H3
  ignoredSuggestions: string[]; // afterH3Id — suggestion suppressed
  labels: Record<string, string>; // first h3Id of a development → name (optional)
}
```

---

## Relation to Skeleton

Replaces the bare Outline + auto-only “D. H2 developments” list as the place to
*arrive at* developments. Tree / actors / markers stay elsewhere for grammar.
Suggestions reuse `h2-movements.ts` (`transitionBetween`).
