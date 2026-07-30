# Book threads — student-named movement thread

A **thread** is one book-level vertical story: short student labels in order
(`Goal` → `Fellowship` → `Threat?` → …). It is not a topic list and not an H2.

Software **proposes waypoints** (verse + evidence caption). The student **adds**
steps and **names** each label. Never auto themes.

---

## Philosophy

| Ask | Do not ask |
|---|---|
| Where does the letter turn, and what do I call that turn? | What are the “themes of 1 John”? |
| Which writing-purpose / open / definition hit marks a waypoint? | What should the H2 title be? |

Thread sits beside Movement and Definitions as a workshop lens. It does not
replace H2 naming or Arquitecto navigation.

---

## Interaction

1. **Propose** — ordered waypoints from writing purposes, convergence `opens`,
   and confirmed book-definition hits.
2. **Add / dismiss** — student builds one thread; software never fills labels.
3. **Name** — short student prose per step (`Goal`, `Confession`, `Advocate`…).
4. **Display** — vertical chain: `label ↓ label ↓ …` (empty label shows `…`).
5. **Evidence** — writing-purpose trajectory / definition snippet stays under the
   step as caption, never as the step name.

---

## Proposal sources

| Source | Evidence caption |
|---|---|
| `writing-purpose` | Trajectory (e.g. `anunciamos → comunión`) |
| `opens` | Pressure phase open on that verse |
| `definition` | Confirmed hit: seed + snippet |
| `manual` | Student-added verse (no auto caption) |

Sort by verse order. Cap ≈40. Skip duplicates already on the thread
(same `verseKey` + `source`).

---

## Storage

```text
the-reader:spanish-clause-builder:{slug}:book-thread:v1
```

One thread per book:

```ts
{
  steps: Array<{
    id: string;
    label: string;       // student short name — may be ""
    verseKey: string;
    source: "writing-purpose" | "opens" | "definition" | "manual";
    evidence?: string;   // trajectory / snippet — not a title
    seed?: string;       // if from definition
  }>
}
```

---

## Non-goals

- Auto-drafted step names or theme titles
- Multiple parallel threads (v1 = one book thread)
- Treating Thread labels as H1/H2 titles (Compiler may emit them only as
  `Hilo de taller (hipótesis de movimiento — no es título H1/H2): …`)
- Replacing H2 naming or Movement convergence
