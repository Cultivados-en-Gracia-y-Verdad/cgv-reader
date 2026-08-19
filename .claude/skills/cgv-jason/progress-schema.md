# Observer progress JSON — keys Jason may write

Bundle shape (`packages/core/src/progress-io.ts`):

```ts
{
  schema: 1,
  book: string,          // workshop slug: daniel, 1juan, tito, …
  exportedAt: string,    // ISO
  data: Record<string, unknown>,
  source?: "cgv-reader" | "cgv-suite"
}
```

`{s}` = `workshopStorageSlug(bookId)`. Keys from `workshopProgressKeys`.

Do not invent keys. Do not merge another book’s keys into this file.

---

## Per-clause (default Jason unit)

### Mark bricks — arrays of source token ids

| Key | What |
|---|---|
| `o-prototype:{s}:finite-verb-marks` | Finite verbs (Brick 1) |
| `roots:{s}:brick1b:nominalClauseHeads` | Verbless clause heads (Brick 1B). Same id shape as a finite; **not** listed in `finite-verb-marks`. No morph ✓ — judgment list. |
| `roots:{s}:brick2:mood:imperativeCandidates` | Imperatives |
| `roots:{s}:brick2c:mood:statementCandidates` | Statements |
| `roots:{s}:brick3:mood:subjunctiveCandidates` | Subjunctives |
| `roots:{s}:brick3c:mood:optativeCandidates` | Optatives |
| `roots:{s}:brick4:participleCandidates` | Participles |
| `roots:{s}:brick2b:commandRecipients` | Imperative addressee (not SVO object) |
| `roots:{s}:brick3:dependentThoughtIntroducers` | ἵνα / ὅτι / εἰ / … |

Mood marks are mutually exclusive for a finite. Once one mood is set, do not also mark the others.

### Clause spans — `the-reader:spanish-clause-builder:{s}:v3`

Keyed by `finiteVerbId`:

```ts
{
  finiteVerbId: string,
  selectedSpan: string[],          // Spanish word ids
  greekStartTokenId?: string,      // source start (Greek or OSHB)
  greekEndTokenId?: string,        // source end
  greekConfirmedAt?: string        // ISO; only after a real walk
}
```

### Q1–Q3 — `…:{s}:statement-command-review:v1`

```ts
{
  describesNoun?: "yes" | "no" | "unsure",
  describedNounSpan?: string[],
  isWhatWasExpressed?: "yes" | "no" | "unsure",
  expressedParentClauseId?: string,
  tellsWhenOrIf?: "yes" | "no" | "unsure",
  whenIfParentClauseId?: string,
  frameType?: "time" | "reason" | "condition" | "purpose" | "result";
  outlineStanding?: "h4" | "dependent"
}
```

All-no → root. First yes wins (`clause-tree.ts` `resolveClause`).
`outlineStanding` is optional. Omit = Auto (command or quoted main clause → H4; complement / Q3 frame stays nested). Never change Q2 to force an H4.

### Actors — `…:{s}:clause-actors:v1`

```ts
{ subjectSpan: string[], verbSpan: string[], objectSpan: string[] }
```

### Participle hosts — `…:{s}:participle-subjects:v1`

`Record<string, string[]>` — Spanish host word ids.

**`participleId` is the authority.** Compiler and Observer read it first. One participle → one noun. Never union two nouns onto a clause or verse key.

| Key | When | What the value is |
|---|---|---|
| `participleId` (`ch:vs:w`) | always, for each Brick-4 participle | noun they ride with |
| clause id / verse key | fallback only (older files) | one noun, never a smash of two |

Hebrew: every participle needs this pick. A compile that still says *sin anfitrión* means that participle’s own key is empty.

### Participle sort — `…:{s}:participles:v1`

```ts
{
  agreesWithNoun?: "yes" | "no" | "unsure",
  describedNounSpan?: string[],
  standsAlone?: "yes" | "no" | "unsure",
  ridesFiniteVerb?: "yes" | "no" | "unsure",
  ridingClauseId?: string,
  semanticRelation?: "time" | "reason" | "means" | "condition" | "concession" | "purpose-result" | "accompanying" | "unsure"
}
```

---

## Book-level (only when named)

### H3 flow — `…:{s}:h3-flow:v1`

```ts
{
  breaksAfter: string[],           // H3 id; next H3 starts a new H2
  ignoredSuggestions: string[],    // legacy; leave empty
  labels: Record<string, string>,  // first H3 of an H2 → name
  pressureAfter: string[]          // tension before the next H3; not an H2
}
```

Never pre-place breaks to match a desired outline. Operator observes the seam.

### Contrasts — `…:{s}:contrasts:v1`

```ts
{ items: Array<{ id: string, verseKey: string, poleA: string, poleB: string, note?: string }> }
```

Student poles only. Never app-supplied *luz/tinieblas* lists.

### Book definitions — `…:{s}:book-definitions:v1`

Per term: seed, confirmed related surfaces, hits, `workingDefinition`.
Software proposes; operator confirms. Never auto-compose a sense.

### Book thread — `…:{s}:book-thread:v1`

```ts
{
  steps: Array<{
    id: string,
    label: string,
    verseKey: string,
    source: "writing-purpose" | "opens" | "definition" | "manual",
    evidence?: string,
    seed?: string
  }>
}
```

Labels are operator names, not H1/H2 titles.

### Reader notes — `the-reader:{s}:notes`

Leave unless the user asks. Not structure.

---

## Existing Daniel file

`data/lbf/ot/daniel-progress-filled.json` was machine-filled. `fillNotes` says so.
Row counts are not a green light. Walk a clause before trusting its span, Q1–Q3, or SVO.
