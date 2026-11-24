# Romanos 3 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 3 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After preserving deterministic provenance, the original 14 HOLD groups reduce
to nine nested groups arising from two locations: ROM.3.22 and ROM.3.28. Three
TR-native decisions resolve both locations without forcing structure onto an
incompatible reading.

With the three proposed decisions applied in memory, the chapter validates
with:

- 292 exact groups
- 8 human-adjudicated groups
- 23 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 7 human-adjudicated TR words
- 6 deterministic TR-authority-adapted words
- 2 TR-only fallback words in two verses, each explicitly carrying no syntax claim

## Decisions requiring named-human confirmation

### ROM.3.22 — coordinated prepositional phrases

- TR1894: `εἰς πάντας καὶ ἐπὶ πάντας τοὺς πιστεύοντας`
- MACULA: `εἰς πάντας τοὺς πιστεύοντας`
- Proposed target: `ROM.3.mc00223`
- Proposed decision: `ROM.3.22.coordinated-prepositional-phrases`

Replace MACULA terminal `n45003022009` and rebuild the adverbial phrase in
authoritative TR order with native tokens `ROM.3.22.w009`–`w012`. Retain exact
anchor `ROM.3.22.w008` (`εἰς`) and exact subtree `ROM.3.mc00221`
(`τοὺς πιστεύοντας`). Classify the result as a coordinated prepositional group
with adverbial function.

### ROM.3.28 — particle and infinitival-clause order

- TR1894: `λογιζόμεθα οὖν πίστει δικαιοῦσθαι ἄνθρωπον`
- MACULA: `λογιζόμεθα γὰρ δικαιοῦσθαι πίστει ἄνθρωπον`
- Proposed decisions: `ROM.3.28.oun-terminal`,
  `ROM.3.28.pistei-dikaiousthai-order`

Replace MACULA `n45003028002` (`γὰρ`) with native TR token
`ROM.3.28.w002` (`οὖν`), preserving its clause-level particle attachment.

Rebuild object-clause target `ROM.3.mc00298` in authoritative order as
`πίστει δικαιοῦσθαι ἄνθρωπον χωρὶς ἔργων νόμου`. Use native TR tokens
`ROM.3.28.w003` and `w004`, while retaining exact subject token
`ROM.3.28.w005` and exact adverbial subtree `ROM.3.mc00297`.

## Deterministic cases — no human syntax decision needed

The differences at ROM.3.4, ROM.3.7, ROM.3.12, ROM.3.26, ROM.3.30, and
ROM.3.31 are already covered by deterministic TR-authority adaptations. The
provenance fix correctly carries those adaptations through their ancestor
groups, removing five false HOLD groups.

## Existing no-syntax fallbacks

These authoritative TR-only additions remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.3.25: article `τῆς` (`ROM.3.25.w007`)
- ROM.3.29: particle `δὲ` (`ROM.3.29.w007`)

## Required verification

The three proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to `source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After
confirmation, rebuild `nt-syntax/candidates/RO.3.macula.json`, run the MACULA
tests, and have a separate verifier compare the rebuilt tree with this report
before release.
