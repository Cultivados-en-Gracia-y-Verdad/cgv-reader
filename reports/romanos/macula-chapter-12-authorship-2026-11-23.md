# Romanos 12 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 12 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the persisted seven HOLD groups
reduce to one group at ROM.12.20. One minimal terminal decision resolves it.

With the proposed decision applied in memory, the chapter validates with:

- 198 exact groups
- 1 human-adjudicated group
- 17 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 1 human-adjudicated TR word
- 4 deterministic TR-authority-adapted words
- 4 TR-only fallback words in four verses, each explicitly carrying no syntax
  claim
- 0 unplaced mapped TR tokens

## Decision requiring named-human confirmation

### ROM.12.20 — TR connector `οὖν`

- TR1894: `ἐὰν οὖν πεινᾷ ὁ ἐχθρός σου`
- MACULA: `ἀλλὰ ἐὰν πεινᾷ ὁ ἐχθρός σου`
- Proposed decision: `ROM.12.20.oun-terminal`

Replace MACULA connector terminal `n45012020001` (`ἀλλά`) with native TR
`ROM.12.20.w002` (`οὖν`). The following conditional clause beginning with
exact TR `ἐάν` remains unchanged. The Conj–CL attachment is retained; its
structural position does not override the authoritative TR surface order of
the postpositive `οὖν`.

## Deterministic cases — no human syntax decision needed

Four isolated one-to-one form or reading differences are covered by
deterministic TR-authority adaptations. Preserving their provenance removes
six false nested HOLD groups from the persisted candidate before the human
decision is considered.

## Existing no-syntax fallbacks

Four authoritative TR-only tokens remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.12.1: `ROM.12.1.w017` (`εὐάρεστον` in TR order)
- ROM.12.2: `ROM.12.2.w013` (`ὑμῶν`)
- ROM.12.14: `ROM.12.14.w004` (`ὑμᾶς`)
- ROM.12.15: `ROM.12.15.w004` (`καί`)

## Required verification

The proposed decision above was authored in this pass and cannot be verified
by the same agent. It requires named-human confirmation before being added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.12.macula.json`, run the MACULA tests, and
have a separate verifier compare the rebuilt tree with this report before
release.
