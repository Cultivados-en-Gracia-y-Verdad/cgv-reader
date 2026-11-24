# MACULA clause calibration — Tito

Date: 2026-11-23  
Status: **CALIBRATION COMPLETE; ADVISORY USE ONLY; NOT A RELEASE VERDICT**

## Decision

MACULA is suitable as a second witness for Observer clause hints and post-answer
verification. It is not suitable as an automatic answer key, and it must not write or
replace Q1–Q3, clause spans, parent choices, or user progress.

The strongest result is token identity: MACULA SBLGNT and CGV's current Tito token spine
match on all 659 tokens. Clause-kind evidence is also strong after an explicit CGV
crosswalk. Constituency boundaries are useful as comparison evidence, but they are often
broader than CGV's finite-clause exercise because MACULA includes complements,
participial material, quotations, and coordinated siblings in larger syntactic groups.

This report is one computational witness compared with multiple human progress witnesses.
It is not self-verifying and does not turn agreement into a verdict.

## Authority and provenance

- Source repository: `Clear-Bible/macula-greek`.
- Source edition: `SBLGNT/lowfat/17-titus.xml`.
- Pinned source commit: `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.
- Source license: MACULA Greek Linguistic Datasets, CC BY 4.0.
- CGV token source: `cgv-data/interlinears/NT/tito.tokens.jsonl` at cgv-data commit
  `2831e93bf851153ec5bef202d2f13c14801bdc08`.
- Reader calibration commit before this report:
  `38bee8d18df9e133579f8663bf4f4759adeee4e8`.
- Human witnesses: 20 distinct exports containing exactly 61 clause assignments and 61
  clause observations. No export was selected as authoritative by date, filename, size,
  or apparent completeness.

The existing LPF publication already supplies the token join. NT exports preserve the
canonical Scrivener IDs and map them to the Reader's MACULA/SBLGNT token spine; OT exports
use the shared OSHB/WLC token IDs directly. The clause layer must reuse that alignment and
must not perform or publish a second word alignment.

What is not present in the current two-file book export is the MACULA clause tree itself.
If approved after this calibration, the normalized clause-structure projection belongs in
`Cultivados-en-Gracia-y-Verdad/cgv-data` as versioned advisory evidence with its own
manifest, schema version, semantic version, checksums, provenance, and license notice.
No file was copied or written to `cgv-data` during this phase.

Migration phase: **Phase 0 — read-only calibration**. Validation procedure:

1. Compare every MACULA word reference with CGV's stable `chapter:verse:token` ID.
2. Compare normalized source surfaces for every shared token.
3. Match all finite indicative, subjunctive, imperative, and optative anchors.
4. Compare MACULA-derived evidence independently against every 61-clause human export.
5. Report agreement ranges and stable human readings; do not choose one export as truth.

## Crosswalk tested

Evidence priority matters. The calibration used this order:

1. A relative form inside the clause is a Q1 `describes` candidate.
2. An overt subordinator or adverbial clause role is a Q3 `frame` candidate. The
   postpositive `γάρ` is associated only when no intervening finite verb begins a new
   clause.
3. An object, subject, or predicate clause role is a Q2 `content` candidate.
4. With no dependency evidence, the finite is an independent candidate. Mere nesting
   inside a coordination group does not make it dependent.

This is a CGV pedagogical crosswalk over MACULA evidence, not a claim that MACULA itself
uses CGV's Q1–Q3 categories.

## Coverage

| Check | Result |
|---|---:|
| MACULA words | 659 |
| CGV tokens | 659 |
| Stable ID intersection | 659 / 659 |
| Normalized surface matches | 659 / 659 |
| MACULA finite anchors | 61 |
| Human exports with 61 assignments + 61 observations | 20 |
| Human categories stable across all exports | 52 / 61 |
| Human Greek boundaries stable across all exports | 47 / 61 |

Finding: token compatibility is exact. For example, `Tito 1:5:7–10`,
“ἵνα τὰ λείποντα ἐπιδιορθώσῃ,” has the same four stable token positions in both
witnesses. This makes a direct ID join possible; no surface-text guessing or positional
realignment is needed for Tito.

## Clause-kind results

Across all 20 human exports:

- Broad independent/dependent agreement: **55–60 of 61**.
- Exact CGV kind agreement (`root`, `describes`, `content`, `frame`): **53–58 of 61**.
- Frame subtype agreement where both witnesses supplied a subtype:
  **19/21, 21/23, or 23/25**, depending on the human export.

On the 52 clauses whose human category is stable across every export:

| Stable human reading | MACULA crosswalk | Count |
|---|---|---:|
| describes | describes | 6 |
| describes | content | 2 |
| frame | frame | 21 |
| root | root | 22 |
| root | content | 1 |

Thus broad independence/dependence agrees on **51/52** stable human readings, and the
exact CGV kind agrees on **49/52**.

Examples of useful agreement:

- `Tito 1:2:6`, “ἣν ἐπηγγείλατο ὁ ἀψευδὴς θεός”: the relative form supplies strong
  Q1 evidence.
- `Tito 1:5:10`, “ἵνα τὰ λείποντα ἐπιδιορθώσῃ”: the explicit `ἵνα` supplies strong
  purpose evidence.
- `Tito 3:3:1`, “ἦμεν γάρ ποτε καὶ ἡμεῖς ἀνόητοι”: postpositive `γάρ` supplies reason
  evidence without pretending that the finite itself begins with the marker.

## Remaining classification disagreements

These are findings to review, not automatic corrections.

1. `Tito 1:3:1`, “ἐφανέρωσεν δὲ καιροῖς ἰδίοις τὸν λόγον αὐτοῦ ἐν κηρύγματι”:
   the stable human reading is independent; the MACULA structure places it in a larger
   `ClCl` relationship that the tested crosswalk reads as content. This is the only stable
   broad independent/dependent disagreement.

2. `Tito 3:11:3` and `Tito 3:11:7`, “εἰδὼς ὅτι ἐξέστραπται ὁ τοιοῦτος καὶ
   ἁμαρτάνει”: stable human readings classify both finites as describing, while MACULA
   represents the `ὅτι` material as an object/content clause. The Greek must be read by a
   separate verifier before either witness is corrected.

Nine clause categories vary among the human exports and therefore cannot serve as a stable
calibration verdict: `1:2:6`, `1:3:11`, `1:5:12`, `1:13:9`, `2:1:3`, `2:11:1`,
`3:5:8`, `3:12:2`, and `3:12:16`.

## Boundary results

Across all 20 human exports:

- Exact MACULA evidence-span agreement: **32–37 of 61**.
- Opening-edge agreement: **47–49 of 61**.
- Closing-edge agreement: **40–43 of 61**.

Among the 47 boundaries stable across every human export, 31 exactly match the tested
MACULA evidence span.

This lower exact-span agreement is expected and important. MACULA answers “what belongs
to this syntactic constituent?” CGV often asks the narrower question “what belongs to this
finite clause row?” For example:

- `Tito 1:5:12`, “καὶ καταστήσῃς κατὰ πόλιν πρεσβυτέρους”: the stable human span is
  `1:5:11–15`; MACULA groups it under the earlier shared `ἵνα` beginning at `1:5:7`.
  That is valuable coordinate-inheritance evidence, but not a reason to widen the user's
  row automatically.
- `Tito 3:3:1`, “ἦμεν γάρ ποτε καὶ ἡμεῖς ἀνόητοι … μισοῦντες ἀλλήλους”:
  MACULA includes the participial and predicative continuation through token 21, while the
  stable human finite span ends at token 6. The larger constituent is a useful hint, not the
  saved answer.
- `Tito 1:12:1`, “εἶπέν τις ἐξ αὐτῶν … Κρῆτες ἀεὶ ψεῦσται …”:
  MACULA includes the quotation through token 14; the stable human span ends at token 7.
  Quote boundaries and finite-clause boundaries must remain separate concepts.

Fourteen boundaries vary among the human exports: `1:3:1`, `1:3:11`, `1:5:10`,
`1:6:3`, `1:9:10`, `1:11:11`, `2:14:7`, `2:14:13`, `3:5:8`, `3:5:15`,
`3:11:7`, `3:12:16`, `3:15:1`, and `3:15:7`.

## Product gate

The evidence supports proceeding with a versioned advisory layer under these constraints:

- MACULA evidence stays hidden until the user requests a hint or submits an answer.
- The application shows `agrees`, `partly agrees`, `conflicts`, or `cannot compare`.
- A suggested span distinguishes the narrow finite core from the broader syntactic
  constituent.
- Tree role and overt marker are displayed as evidence; the mapped CGV category is labeled
  as a proposal.
- No one-click action writes Q1–Q3, a parent, or a clause span from MACULA.
- Disagreement never changes Compiler output or release status.
- Missing, mismatched, or unsupported data fails closed: no hint is shown.

Before UI integration, `cgv-data` still needs a reviewed, immutable release of the
normalized MACULA clause structure, with manifest validation and attribution. This is not
a new alignment: it joins to each translated book through the already-published LPF source
token IDs. The Reader must consume it through the same version-aware loader used by Reader,
Observer, and Compiler.
