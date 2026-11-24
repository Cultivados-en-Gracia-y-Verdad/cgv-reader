# Romanos 10 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 10 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the original 22 HOLD groups
reduce to 21 nested groups at four verses: ROM.10.1, 10.5, 10.15, and 10.19.
Five minimal terminal decisions resolve those locations. The remaining TR-only
additions stay explicit fallbacks rather than receiving unsupported syntax.

With the proposed decisions applied in memory, the chapter validates with:

- 208 exact groups
- 21 human-adjudicated groups
- 20 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 5 human-adjudicated TR words
- 10 deterministic TR-authority-adapted words
- 10 TR-only fallback words in four verses, each explicitly carrying no
  syntax claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.10.1 — `ὑπὲρ τοῦ Ἰσραήλ`

- TR1894: `ὑπὲρ τοῦ Ἰσραὴλ ἐστὶν εἰς σωτηρίαν`
- MACULA: `ὑπὲρ αὐτῶν εἰς σωτηρίαν`
- Proposed decision: `ROM.10.1.israel-terminal`

Replace MACULA pronoun terminal `n45010001015` with native TR
`ROM.10.1.w017` (`Ἰσραήλ`). It remains the complement of `ὑπέρ`. The added TR
article `w016` and copula `w018` remain no-syntax fallbacks; this proposal does
not invent attachments for them.

### ROM.10.5 — displaced `ὅτι`

- TR1894: `γράφει τὴν δικαιοσύνην τὴν ἐκ τοῦ νόμου ὅτι ...`
- MACULA: `γράφει ὅτι τὴν δικαιοσύνην τὴν ἐκ νόμου ...`
- Proposed decision: `ROM.10.5.hoti-terminal`

Bind MACULA `ὅτι` terminal `n45010005004` to native TR `ROM.10.5.w010`.
It retains its content-clause function despite the surface-order difference.
The TR-only article `τοῦ` and pronoun `αὐτά` remain explicit fallbacks.

### ROM.10.15 — second `τῶν εὐαγγελιζομένων` phrase

- TR1894: `τῶν εὐαγγελιζομένων εἰρήνην, τῶν εὐαγγελιζομένων τὰ ἀγαθά`
- MACULA: `τῶν εὐαγγελιζομένων ἀγαθά`
- Proposed decisions: `ROM.10.15.ton-second-terminal` and
  `ROM.10.15.euangelizomenon-second-terminal`

Bind MACULA terminals `n45010015013`–`014` to native TR
`ROM.10.15.w016`–`w017`. Their existing DetCL modifies the phrase ending in
TR `τὰ ἀγαθά`; therefore it corresponds to the second occurrence, not the
added first occurrence. TR `w013`–`w015` (`τῶν εὐαγγελιζομένων εἰρήνην`) and
article `w018` remain no-syntax fallbacks.

### ROM.10.19 — subject `Ἰσραήλ`

- TR1894: `μὴ οὐκ ἔγνω Ἰσραήλ`
- MACULA: `μὴ Ἰσραὴλ οὐκ ἔγνω`
- Proposed decision: `ROM.10.19.israel-terminal`

Bind MACULA `Ἰσραήλ` terminal `n45010019004` to native TR
`ROM.10.19.w006`. It remains the subject of `οὐκ ἔγνω`; only its surface
position differs.

## Deterministic cases — no human syntax decision needed

Ten isolated one-to-one form differences are covered by deterministic
TR-authority adaptations. Preserving their provenance removes one false HOLD
group before human decisions are considered, including differences such as
the verbal forms in ROM.10.14 and the divine-name reading in ROM.10.17.

## Existing no-syntax fallbacks

Ten authoritative TR-only tokens remain explicit fallbacks and make no MACULA
grammatical attachment claim:

- ROM.10.1: `ROM.10.1.w011`, `w016`, and `w018`
- ROM.10.3: `ROM.10.3.w010`
- ROM.10.5: `ROM.10.5.w008` and `w013`
- ROM.10.15: `ROM.10.15.w013`–`w015` and `w018`

## Required verification

The five proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.10.macula.json`, run the MACULA tests, and
have a separate verifier compare the rebuilt tree with this report before
release.
