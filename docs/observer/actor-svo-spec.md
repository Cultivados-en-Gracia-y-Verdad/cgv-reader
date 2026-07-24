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

**Locked teaching form** (same string everywhere once subject + verb exist):

```text
Cristo → llevó → nuestros pecados
paciencia → esperaba
```

Omit the object slot when empty. Never drop the actor from the line in flow
views.

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

Actions under actors (document order within each group) — **full triples**:

```
DIOS
  Dios → prometió → vida eterna
  Dios → manifestó → su palabra

PABLO
  Pablo → recibió → predicación
```

Also shown under each clause in the Skeleton tree and Outline.

Empty state until Quién actúa / Qué hace are observed.

---

## 4. Scope

Every finite clause with a saved span (roots and dependents).

## 5. Compiler Generate

When a clause has Quién actúa (+ verb), Generate emits the triple as a `*`
slide immediately under that clause’s `####` / `-` line:

```markdown
#### *y a su propio tiempo manifestó…*

* *Dios* → *manifestó* → *su palabra*
```

Appendix after the outline (gathering view):

```markdown
## Actores

### Concentración
- *Dios* — 3 acciones

### Flujo
#### DIOS
- *Dios* → *prometió* → *vida eterna*
```

Omitted (with a Generate warning) when no actors are observed yet.

## 6. H1/H2 evidence

Actor observations feed the naming of `# contexto` / `## unidad` (still
human-assigned):

- Book-level block before the first H3: dominant actors (top 5, with counts)
  and the mood mix (declaraciones · mandatos).
- Per-unit line right after each H3: `* Actúan en esta unidad: *X* (2) · *Y* (1)`
  from observed subjects on the unit's root + dependent clauses.

Counts and Scripture words only — the Compiler never names the unit itself.

In Observer Skeleton, the same actor (plus mood / recipient) signals drive
**D. H2 developments (suggested)** — see `h2-movements-spec.md`.

Locked hierarchy (never “theme”): H3 = independent clause; H2 = continuous
development of consecutive H3s; H1 = major development of consecutive H2s.
