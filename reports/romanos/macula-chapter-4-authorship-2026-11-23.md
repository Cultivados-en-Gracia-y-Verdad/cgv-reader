# Romanos 4 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 4 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the original 17 HOLD groups
reduce to seven nested groups arising from ROM.4.1 and ROM.4.8. Three minimal
TR-native decisions resolve both locations.

With the proposed decisions applied in memory, the chapter validates with:

- 280 exact groups
- 7 human-adjudicated groups
- 14 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 3 human-adjudicated TR words
- 4 deterministic TR-authority-adapted words
- 8 TR-only fallback words in seven verses, each explicitly carrying no syntax claim

## Decisions requiring named-human confirmation

### ROM.4.1 — Abraham and `εὑρηκέναι` in TR order

- TR1894: `Τί οὖν ἐροῦμεν Ἀβραὰμ τὸν πατέρα ἡμῶν εὑρηκέναι κατὰ σάρκα`
- MACULA: `Τί οὖν ἐροῦμεν εὑρηκέναι Ἀβραὰμ τὸν προπάτορα ἡμῶν κατὰ σάρκα`
- Proposed target: `ROM.4.mc00005`
- Proposed decision: `ROM.4.1.abraham-eurekenai-order`

Replace MACULA terminal `n45004001004` with native TR token
`ROM.4.1.w008` (`εὑρηκέναι`) and rebuild the object clause in authoritative
order as object–subject–verb–adverbial. Retain exact `Τί`, exact `κατὰ σάρκα`,
and the already adapted Abraham noun phrase. The `πατέρα`/`προπάτορα`
difference is already handled by the deterministic isolated one-to-one rule.

### ROM.4.8 — authoritative relative and negation terminals

- TR1894: `μακάριος ἀνὴρ ᾧ οὐ μὴ λογίσηται Κύριος ἁμαρτίαν`
- MACULA: `μακάριος ἀνὴρ οὗ οὐ μὴ λογίσηται Κύριος ἁμαρτίαν`
- Proposed decisions: `ROM.4.8.ho-relative-terminal`,
  `ROM.4.8.ou-terminal`

Bind MACULA `n45004008003` to native TR `ROM.4.8.w003` (`ᾧ`) and MACULA
`n45004008004` to native TR `ROM.4.8.w004` (`οὐ`). Preserve the existing
relative-clause and double-negation attachments; only the authoritative token
identities change.

## Deterministic cases — no human syntax decision needed

The differences at ROM.4.6, ROM.4.15, and ROM.4.20 are isolated one-to-one
TR-authority adaptations. Preserving their provenance through ancestor groups
removes ten false HOLD groups from the persisted candidate.

## Existing no-syntax fallbacks

These authoritative TR-only additions remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.4.2: article `τὸν`
- ROM.4.4: article `τὸ`
- ROM.4.9: conjunction `ὅτι`
- ROM.4.11: conjunction `καὶ`
- ROM.4.12: article `τῇ`
- ROM.4.13: article `τοῦ`
- ROM.4.19: negator `οὐ` and adverb `ἤδη`

## Required verification

The three proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to `source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After
confirmation, rebuild `nt-syntax/candidates/RO.4.macula.json`, run the MACULA
tests, and have a separate verifier compare the rebuilt tree with this report
before release.
