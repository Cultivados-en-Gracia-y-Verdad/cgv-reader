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

Primary UI: **H3 flow** (`h3-flow-spec.md`) — clean independent-clause strip with
Accept / Ignore on suggested breaks. Transition detection is this module;
grouping into developments is the student’s.

```
Development 1
  1:3   …
  1:6   …
  ┄┄┄ actor Dios → ustedes ┄┄┄  [Accept break] [Ignore]
  Why suggested: …

Development 2   ← after Accept
  1:13  …
```

The app **does not name** the development. It marks where observations change;
the student Accepts the break (or Ignores it) and later may name the H2.

---

## Non-goals

- No auto-written H1 or H2 title
- No theological summary
- Does not change the outline / skeleton tree
- Does not invent labels from unmarked clauses
