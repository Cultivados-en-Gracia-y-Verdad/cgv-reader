# Clause workshop improvement proposal

## Decision

Replace the apparent three-question clause test with one progressive decision:

1. **Does this clause stand on its own, or does it lean on something else?**
2. If it leans, **what kind of relationship makes it dependent?**
3. **What does it attach to?**

The learner still makes every decision. Greek signals and approved MACULA attachments provide optional evidence and post-answer verification; they never select, save, stretch, or re-parent a clause.

This work belongs to Observer inside the Reader application. Reader remains a read-only consumer of published `cgv-data` advisories.

## Problem in the current experience

The saved data still expresses three observations:

- Does it describe a noun?
- Is it what was expressed?
- Does it tell when, why, if, purpose, or result?

The interface now presents four clause-type cards, which is an improvement, but the downstream interactions still expose the old three-question model. A learner must infer that three negative answers mean “independent,” then understand a different attachment workflow for every positive answer.

The current MACULA panel adds another conceptual layer. It uses technical labels, raw token ranges, and a verdict-like card before the attachment task is clear. This can feel as if the application knows a hidden answer while the learner is guessing.

Clause boundaries, clause kind, dependency, parent selection, and subject–verb–object work also appear in one long panel. When a clause is boxed or highlighted, the visual does not clearly distinguish:

- the clause being edited;
- the learner's saved finite-clause span;
- a governing host clause;
- a broader MACULA constituent; or
- a proposed dependency.

## Proposed interaction

### Stage 1 — Read the clause

Show the LPF clause prominently, with the source-language line directly beneath it. Make the active finite verb unmistakable.

The learner may optionally reveal a neutral **What should I notice?** panel. It can point out observable evidence such as:

- a relative form;
- a subordinating marker;
- a saying, knowing, or perceiving verb nearby;
- a coordinator that may continue the preceding dependency; or
- the absence of a visible subordinating signal.

This panel names evidence. It does not name the answer.

### Stage 2 — Make the first decision

Ask one question in plain language:

> **Does this clause stand on its own, or does it lean on another word or clause?**

Present two large choices:

- **Stands on its own**  
  Technical label: Independent clause

- **Leans on something else**  
  Technical label: Dependent clause

No choice is preselected. A heuristic or MACULA attachment may not visually mark either choice as “suggested” before the learner answers.

### Stage 3 — Identify the dependent relationship

Show this stage only after the learner chooses **Leans on something else**.

Present four plain-language relationships:

1. **Describes a person or thing**  
   Technical label: Relative clause

2. **Tells what was said, thought, known, or perceived**  
   Technical label: Content clause

3. **Adds when, why, under what condition, for what purpose, or with what result**  
   Technical label: Adverbial clause

4. **Continues the same dependency as the previous clause**  
   Technical label: Coordinated dependent clause

The fourth choice makes coordinate inheritance visible instead of silently forcing the learner through Q1–Q3 again.

### Stage 4 — Attach it

Ask for only the attachment required by the chosen relationship:

- Relative: select the noun or noun phrase being described.
- Content: select the governing saying/thinking/knowing/perceiving clause.
- Adverbial: select the governing clause, then select time, reason, condition, purpose, or result.
- Coordinated dependent: show the inherited relationship and parent, then ask the learner to confirm or reject it.
- Independent: no parent-selection step.

The application must never stretch a host span automatically. If the selected noun lies outside a saved host span, explain the mismatch in one sentence and offer a separate **Edit host boundary** action. Do not mix that repair with classification.

### Stage 5 — Verify after the answer

Once the learner has made and attached the decision, show a compact second-witness result:

- **Agrees** — the approved advisory supports the learner's relationship and attachment.
- **Partly agrees** — the relationship agrees but an edge, parent, or subtype differs.
- **Second witness differs** — show the exact point of disagreement without changing the learner's work.
- **No comparable evidence** — MACULA cannot safely answer this case.

The result must distinguish:

- exact MACULA attachment;
- adapted MACULA attachment to TR1894;
- human-reviewed TR-native structure; and
- no MACULA syntax.

An adapted attachment must disclose the textual difference in ordinary language. “No MACULA syntax” must remain genuinely empty; the Reader must not replace it with a heuristic guess presented as MACULA.

The learner may choose **Reconsider my answer** or **Keep my answer**. Neither action alters published advisory data.

## Hint ladder

Help should be progressive so the learner still performs the analysis.

### Hint 1 — Observe

Highlight the relevant visible marker or finite verb and explain its morphology or ordinary function. Do not reveal a clause category.

### Hint 2 — Compare relationships

Explain why two plausible relationships differ in this context. For example: “A relative clause describes a noun; this construction instead modifies the circumstances of the verb.”

### Hint 3 — Reveal the second witness

Only after an attempt, or after an explicit request for the final hint, disclose the approved MACULA/TR1894 proposal and its evidence status.

No hint writes Q1–Q3 fields, a span, a parent, a frame subtype, or user progress.

## Grammatical-role proposals

Subject, object, indirect-object/recipient, and predicate-attribute proposals are a separate,
learner-controlled aid after the clause decision. They are not inferred in the Reader from raw
MACULA token ranges. A schema-v2 advisory must publish the reviewed TR1894 word ids together with
its attachment status and, for exact or adapted MACULA evidence, the source role and source token
ids. It must be checksum-bound both to the source token spine and to the exact published LBF text;
either mismatch makes the entire advisory unavailable.

The learner opens the proposal, inspects the quoted TR1894 words, and explicitly chooses **Use in
this field** or **Choose different words**. Opening the proposal never writes progress. The explicit
**Use** action may write only that learner-owned subject, object/recipient, or attribute observation;
it never changes a clause span, classification, dependency, or published advisory.

The interface must state that a grammatical subject is not necessarily the semantic actor. In a
passive clause the grammatical subject may receive the action. Therefore the proposal is evidence
beside the existing “who acts” field, not an unreviewed automatic actor assignment.

## Visual language

Each visual treatment must mean exactly one thing:

- **Solid blue outline:** clause currently being edited.
- **Soft filled span:** learner's saved finite-clause boundary.
- **Indented connector line:** learner's saved dependency and parent.
- **Dashed teal outline:** second-witness constituent, visible only while help is open.
- **Gold edge marker:** a boundary disagreement requiring comparison.

Never use the same box for an active clause, a saved span, and a MACULA suggestion.

The interface should label a box directly when ambiguity is possible: **Your clause**, **Host clause**, or **Second-witness constituent**.

## Text and layout

The clause task is reading work, so its text must be larger than the current compact card typography:

- active LPF clause: at least `1.35rem`;
- source-language line: at least `1.25rem`;
- primary decision labels: at least `1.1rem`;
- evidence and explanations: at least `1rem`;
- no essential evidence at the current `0.8rem` size.

Use one column for the decision flow. Two-column card grids make the choices look like a quiz and separate related explanations from the text being examined.

Raw token IDs belong only in collapsed provenance. The normal view should quote and highlight the actual words.

## Data and authority requirements

Reader may show MACULA help only when all of these are true:

1. The selected `cgv-data` release contains a versioned advisory for the selected book.
2. The advisory is bound to the same published TR1894 token spine used by the Reader.
3. The attachment status is explicitly published as exact, adapted, TR-native reviewed, or no syntax.
4. Required human approval and independent verification are present upstream.
5. Dataset version, checksums, provenance, and license validation pass.

Unsupported, missing, stale, or mismatched data fails closed: show **Second-witness help is unavailable for this clause**, not a guessed answer.

The Reader must not perform a new TR1894–MACULA alignment. It consumes the published TR1894-first attachment produced by the translation process.

## Saved-progress compatibility

The new interaction may continue storing the existing Q1–Q3 fields during migration:

| New choice | Existing stored representation |
|---|---|
| Independent | all three `no` |
| Relative | `describesNoun: yes` |
| Content | `isWhatWasExpressed: yes` |
| Adverbial | `tellsWhenOrIf: yes` |
| Coordinated dependent | inherited resolved relation plus explicit inheritance metadata |

This mapping is an implementation bridge, not language shown to learners. Existing progress must load without reinterpretation, and parity tests must prove that old and new interfaces produce the same resolved clause tree.

## Acceptance criteria

The improvement is ready when:

- a new learner can classify a clause without knowing what Q1, Q2, and Q3 mean;
- independent versus dependent is always explicit;
- dependent relationship and parent selection are separate steps;
- coordinate inheritance is a visible choice;
- every box or highlight has one labeled meaning;
- MACULA is hidden until requested or until after an answer;
- no hint or verification action mutates progress;
- grammatical-role proposals quote reviewed TR1894 words and require an explicit learner confirmation;
- a raw MACULA grammatical subject is never silently equated with the semantic actor;
- exact, adapted, TR-native, and no-syntax states render differently;
- raw token IDs are absent from the ordinary learning view;
- existing progress resolves to the same clause tree;
- unavailable advisory data fails closed; and
- Reader, Observer, and Compiler continue consuming one pinned `cgv-data` release.

## Recommended implementation order

1. Refactor the current clause-choice panel into the two-stage independent/dependent flow while preserving existing storage.
2. Separate classification, attachment, and span repair into distinct UI states.
3. Label and simplify clause highlighting; increase the reading and evidence text sizes.
4. Replace the raw MACULA panel with the three-level hint ladder and post-answer comparison.
5. Extend the advisory schema to carry TR1894-first attachment status and plain-language textual differences.
6. Add migration parity, no-mutation, stale-data, accessibility, and live Romans 11:13/20/22/23/31 tests.
7. Enable MACULA help only after the corresponding approved advisory is canonically published in `cgv-data`.
