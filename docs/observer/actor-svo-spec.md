# Actor SVO — Quién actúa / Qué hace / Sobre quién

Student-observed **SUJETO → VERBO → OBJETO / RECEPTOR** for each finite clause
with a saved span. Aggregates in the Skeleton popup show who dominates the
passage and how actions gather under actors.

This is **not** a revival of Flow / Emphasis / Cast, and **not** Sequence’s
recipient tag (Brick 2B stays “who an imperative is addressed to”).

---

## 1. Per-clause observation (Structure clause card)

After a clause has a saved Spanish span, the review panel offers three taps:

1. **Quién actúa** — subject span (required for B/C to count the clause)
2. **Qué hace** — verb span (defaults to the finite verb’s Spanish word; retap to change)
3. **Sobre quién o qué recae la acción** — object / receptor (optional; Clear allowed)

Picker: chapter list with the clause’s verse highlighted; shift-click for a
multi-word span. Picks **never** change clause belonging.

Live summary on the card: `SUJETO → VERBO → OBJETO / RECEPTOR`.

**Non-goal:** no automatic nominative subject from morphology (same lesson as
nominative participle hosts).

---

## 2. Storage

Progress key (per book via `workshopProgressKeys`):

```text
the-reader:spanish-clause-builder:{slug}:clause-actors:v1
```

Shape — keyed by `finiteVerbId`:

```ts
{
  subjectSpan: string[]; // Spanish word ids
  verbSpan: string[];
  objectSpan: string[];
}
```

---

## 3. Skeleton aggregates

### B. Actor concentration

Who dominates:

```
Dios       3 acciones
Pablo      3 acciones
Tito       1 acción
```

Group by normalized subject-span text; count clauses; sort by count desc, then name.

### C. Actor flow

Actions under actors (document order within each group):

```
DIOS
  prometió → vida eterna
  manifestó → su palabra

PABLO
  recibió → predicación
```

Omit `→` when there is no object span. Empty state until Quién actúa / Qué hace
are observed.

---

## 4. Scope

Every finite clause with a saved span (roots and dependents).

## 5. Compiler Generate

When any clause has Quién actúa (+ verb, defaulting to the finite verb word),
Generate appends an appendix after the outline:

```markdown
## Actores

### Concentración
- *Dios* — 3 acciones

### Flujo
#### DIOS
- *prometió* → *vida eterna*
```

Omitted (with a Generate warning) when no actors are observed yet.
