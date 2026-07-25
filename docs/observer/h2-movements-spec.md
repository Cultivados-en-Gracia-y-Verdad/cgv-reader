# H1 / H2 / H3 — development from observations

Locked definitions. Notice we never use the word “theme.”

| Level | Meaning |
|---|---|
| **H3** | An independent clause. Objective. (Outline root + its dependents in the unit.) |
| **H2** | A **continuous development** consisting of consecutive H3s. |
| **H1** | A **major development** consisting of consecutive H2s. |

H3s are fixed by clause observation. H2 is not invented from ideas — it is a
stretch of consecutive H3s that holds together until observations change. H1 is
built the same way from H2s, not from clauses.

---

## How H2 breaks are suggested

Suggestions come only from measurable **transitions** between consecutive H3
units — never from naming a topic.

| Signal | Transition when… |
|---|---|
| Dominant actor | Majority Quién actúa in unit A ≠ unit B |
| Sentence type | Root mood shifts statement ↔ imperative |
| Recipient | Brick 2B addressee changes (imperative runs) |

Deferred (same idea, later pass):

- **Pressure** — hope → holiness → submission → suffering (vocab + actors + mood together)
- **Repeated vocabulary** — clusters of observed verb/object spans shifting

---

## Output shape (Skeleton)

Primary UI: **H3 flow** (`h3-flow-spec.md`) — clean independent-clause strip.
The student places H2 starts (“Begin new movement”). Transition detection here
feeds **supporting observations after** a user decision — never Accept/Ignore prompts.

```
H2                          ← always; book start (1:1)
H3   1:1   …
H3   1:2   Gracia y paz…
     [Begin new movement]   ← quiet; hover/focus
────────
Observations supporting this decision
  · New dominant actor (…)
H2
H3   1:3   En esto se alegran…
```

The app **does not name** the H2 and **does not ask** the student to accept a
computer boundary. Later the student may name the H2.

---

## Non-goals

- No auto-written H1 or H2 title
- No Accept / Ignore suggestion workflow
- No theological summary
- Does not change the outline / skeleton tree
- Does not invent labels from unmarked clauses
