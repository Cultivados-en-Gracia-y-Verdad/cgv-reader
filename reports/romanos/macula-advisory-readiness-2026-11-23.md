# MACULA advisory readiness — Romanos

Date: 2026-11-23  
Status: **BLOCKED FOR PUBLICATION; SOURCE REVIEW REQUIRED; NOT RELEASED**

## Scope

- Source repository: `LaPalabraFiel` at `224a73f3e69016962d1d418b937587742f39f4dd`.
- Source artifacts: `nt-syntax/candidates/RO.{1..16}.macula.json`.
- MACULA source revision: `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.
- Destination requested: `cgv-data/advisories/macula/romanos.macula-advisory.json`.
- Destination token spine: `interlinears/NT/romanos.tokens.jsonl` at cgv-data
  `4bfb1451bf71e260df2984ba51d8e24af72c5c13`.
- Token-spine SHA-256:
  `ef3177df4ac66a5de60c1228d26fd9f25a11153bce9b716444367b8167002340`.

This report is a readiness witness, not a syntax verdict and not release approval.

## Mechanical inventory

| Check | Result |
|---|---:|
| Romanos chapter candidates | 16 / 16 |
| Candidate status | `review-only-not-canonical` in all 16 |
| Exact projected groups | 4,479 |
| Deterministically TR-adapted groups | 416 |
| Unresolved `HOLD` groups | 318 |
| Human-adjudicated groups | 0 |
| Mapped words | 6,848 |
| Unmatched MACULA words | 98 |
| TR-only tokens | 221 |

Finding: the comparative structure is complete enough to inspect, but it is not a reviewed
publication source. Publishing it as settled clause advice would turn a review candidate into a
verdict, contrary to its declared status and the two-witness rule.

## Romanos 11:13 finding

LPF reads:

> “Pues a ustedes, los gentiles, les hablo. En la medida en que yo soy apóstol de gentiles,
> ciertamente honro mi ministerio.” — Romanos 11:13

The projected source tree places `ἐφ’ ὅσον … εἰμι ἐγὼ ἐθνῶν ἀπόστολος` inside a `PrepNp`
group with function `adv`; its inner clause is `ADV-VC-S-P`. This is evidence that the `ὅσον`
construction is adverbial here, not an ordinary relative clause describing the Spanish word
“soy.” It directly explains the false relative suggestion reported in Observer.

However, the surrounding candidate sentence `ROM.11.ms0303` is marked
`tr-authority-adapted`, and the chapter artifact remains `review-only-not-canonical`. This
reading therefore belongs in the review queue; it cannot be self-approved by the agent that
extracts it.

## Required release gate

Before any Romanos advisory is written to `cgv-data`:

1. A human reviewer must adjudicate or explicitly accept the projected structure used by every
   published clause entry, beginning with Romanos 11:13.
2. Unresolved paths must be omitted or published only as `unknown`; they must never receive a
   guessed CGV category, boundary, or parent.
3. A separate verifier must compare the normalized output against the reviewed source paths and
   the Reader token bridge.
4. The release must pass schema validation, complete finite-verb accounting, token-spine SHA-256
   parity, manifest/checksum validation, provenance and license checks, Reader unit tests, and a
   live 11:13 behavior check.

No canonical file was written to `LaPalabraFiel` or `cgv-data` during this audit.
