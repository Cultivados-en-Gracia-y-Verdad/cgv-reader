# Romanos 6 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 6 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the original four HOLD groups
reduce to two nested groups at ROM.6.11. Two coordinated TR-native decisions
resolve the displaced copula while retaining the predicate coordination.

With the proposed decisions applied in memory, the chapter validates with:

- 236 exact groups
- 4 human-adjudicated groups
- 18 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 1 human-adjudicated TR word
- 6 deterministic TR-authority-adapted words
- 5 TR-only fallback words in two verses, each explicitly carrying no syntax claim

## Decisions requiring named-human confirmation

### ROM.6.11 — `νεκροὺς μὲν εἶναι` in authoritative order

- TR1894: `ἑαυτοὺς νεκροὺς μὲν εἶναι τῇ ἁμαρτίᾳ ζῶντας δὲ τῷ Θεῷ`
- MACULA: `ἑαυτοὺς εἶναι νεκροὺς μὲν τῇ ἁμαρτίᾳ ζῶντας δὲ τῷ Θεῷ`
- Proposed decisions: `ROM.6.11.nekrous-men-einai-order`,
  `ROM.6.11.remove-displaced-einai`

Rebuild `ROM.6.mc00097` in TR order with existing anchors
`ROM.6.11.w006` (`νεκρούς`) and `w007` (`μέν`), native TR copula `w008`
(`εἶναι`), and exact adverbial subtree `ROM.6.mc00095`. Retain this as a
grouped first predicate within the existing coordinated predicate.

Then rebuild object-clause target `ROM.6.mc00104` from exact subject
`ROM.6.11.w005` and predicate subtree `ROM.6.mc00103`, removing displaced
MACULA terminal `n45006011006`. The resulting object clause is classified
subject–predicate; the copula now resides in its authoritative position inside
the first predicate branch.

## Pipeline provenance correction

This chapter requires one adjudicated parent to retain an already adjudicated
child. The structure overlay previously retained only the parent’s local
decision ID. It now merges descendant decision IDs into the parent provenance,
matching the validation contract. All 16 tests in
`tools.pipeline.test_nt_macula` pass after the correction.

## Deterministic cases — no human syntax decision needed

The differences at ROM.6.1, ROM.6.8, ROM.6.13, ROM.6.14, and ROM.6.15 are
isolated one-to-one TR-authority adaptations. Preserving adaptation provenance
removes the two false ancestor HOLDs in the persisted candidate.

## Existing no-syntax fallbacks

These authoritative TR-only additions remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.6.11: `τῷ Κυρίῳ ἡμῶν`
- ROM.6.12: `αὐτῇ ἐν`

## Required verification

The two proposed ROM.6.11 decisions were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to `source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After
confirmation, rebuild `nt-syntax/candidates/RO.6.macula.json`, run the MACULA
tests, and have a separate verifier compare the rebuilt tree with this report
before release.
