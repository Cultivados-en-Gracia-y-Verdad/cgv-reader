# Romanos 1 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 1 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

The 28 reported HOLD groups reduce to three textual locations requiring five
named-human terminal decisions. Two other locations were false HOLDs caused by
deterministic adaptation provenance being dropped during the structure overlay.

With the five proposed decisions and the provenance fix applied in memory, the
chapter validates with:

- 332 exact groups
- 15 human-adjudicated groups
- 52 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 5 human-adjudicated TR words
- 9 deterministic TR-authority-adapted words
- 5 TR-only fallback words in four verses, each explicitly carrying no syntax claim

## Decisions requiring named-human confirmation

### ROM.1.10 — merged TR terminal

- TR1894: `εἴπως`
- MACULA: `εἴ πως`
- Proposed target: `ROM.1.mc00118`
- Proposed decision: `ROM.1.10.eipos-merged-terminal`

Replace MACULA terminals `n45001010007` and `n45001010008` with native TR
terminal `ROM.1.10.w007`. Preserve the subordinate-clause attachment and the
exact anchored children beginning with `ἤδη ποτέ εὐοδωθήσομαι`.

### ROM.1.19 — postpositive γάρ and subject θεός

- TR1894: `ὁ γὰρ θεὸς αὐτοῖς ἐφανέρωσεν`
- MACULA: `ὁ θεὸς γὰρ αὐτοῖς ἐφανέρωσεν`
- Proposed decisions: `ROM.1.19.theos-terminal`, `ROM.1.19.gar-terminal`

Bind MACULA `n45001019011` (`θεὸς`) to authoritative TR token
`ROM.1.19.w012`, preserving its subject-noun attachment. Bind MACULA
`n45001019012` (`γὰρ`) to authoritative TR token `ROM.1.19.w011`, preserving
its postpositive particle attachment.

### ROM.1.21 — authoritative TR forms

- TR1894: `εὐχαρίστησαν ἀλλ’ ἐματαιώθησαν`
- MACULA: `ηὐχαρίστησαν ἀλλὰ ἐματαιώθησαν`
- Proposed decisions: `ROM.1.21.eucharistesan-terminal`, `ROM.1.21.all-terminal`

Replace MACULA `n45001021010` with native TR `ROM.1.21.w010`, and MACULA
`n45001021011` with native TR `ROM.1.21.w011`. Preserve both existing MACULA
attachments; only the authoritative terminal identities change.

## Deterministic cases — no human syntax decision needed

### ROM.1.12

- TR1894/Robinson: `συμπαρακληθῆναι`
- MACULA: `συνπαρακληθῆναι`

The existing isolated one-to-one TR-authority adaptation already replaces the
terminal without borrowing MACULA identity. The clause remained on HOLD only
because the later structure overlay failed to carry the deterministic
adaptation provenance upward.

### ROM.1.27

- TR1894: `οἱ ἄρσενες`
- MACULA: `οἱ ἄρσενες`

The token already has a human-approved Scrivener/Robinson reconciliation and is
therefore reused through the deterministic approved-binding rule. Its ancestor
groups remained on HOLD for the same provenance-propagation defect.

The pipeline fix preserves deterministic adaptation IDs during the structure
overlay. `python3 -m unittest tools.pipeline.test_nt_macula` passes all 16
tests, including a new Romanos regression test for 1:12 and 1:27.

## Existing no-syntax fallbacks

These authoritative TR-only readings remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.1.16: `τοῦ Χριστοῦ`
- ROM.1.24: `καὶ`
- ROM.1.29: `πορνείᾳ`
- ROM.1.31: `ἀσπόνδους`

## Required verification

The five proposed decisions above were authored in this pass and therefore
cannot be verified by the same agent. They must be confirmed by the named human
reviewer before being added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.1.macula.json`, run the MACULA tests, and have a
separate verifier compare the rebuilt tree with this report before release.
