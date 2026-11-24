# Romanos 14 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 14 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the persisted 16 HOLD groups
reduce to 11 nested groups at ROM.14.5, 14.6, 14.9, and 14.22. Four minimal
decisions resolve those locations.

With the proposed decisions applied in memory, the chapter validates with:

- 232 exact groups
- 11 human-adjudicated groups
- 23 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 5 human-adjudicated TR words
- 7 deterministic TR-authority-adapted words
- 15 TR-only fallback words in five verses, each explicitly carrying no
  syntax claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.14.5 — omit MACULA `γάρ`

- TR1894: `ὃς μὲν κρίνει ἡμέραν παρ’ ἡμέραν`
- MACULA: `ὃς μὲν γὰρ κρίνει ἡμέραν παρ’ ἡμέραν`
- Proposed target: `ROM.14.mc00052`
- Proposed decision: `ROM.14.5.omitted-gar`

Remove unmatched MACULA terminal `n45014005003` and promote the otherwise
exact coordinated clause. TR1894 has no corresponding `γάρ`.

### ROM.14.6 — article before `ἐσθίων`

- TR1894 inserts `ὁ μὴ φρονῶν τὴν ἡμέραν Κυρίῳ οὐ φρονεῖ` before
  `ὁ ἐσθίων Κυρίῳ ἐσθίει`.
- MACULA omits that first clause and continues directly with `ὁ ἐσθίων`.
- Proposed decision: `ROM.14.6.ho-terminal`

Bind MACULA article terminal `n45014006008` to native TR
`ROM.14.6.w016`, the article that actually introduces exact `ἐσθίων` at
`w017`. TR `w008`–`w015`, the omitted clause, remains fallback-only rather
than being assigned fabricated syntax.

### ROM.14.9 — TR resurrection verb phrase

- TR1894: `Χριστὸς καὶ ἀπέθανεν καὶ ἀνέστη καὶ ἀνέζησεν`
- MACULA: `Χριστὸς ἀπέθανεν καὶ ἔζησεν`
- Proposed target: `ROM.14.mc00100`
- Proposed decision: `ROM.14.9.resurrection-vp`

Replace MACULA terminals `n45014009006`–`007` with native TR
`ROM.14.9.w007`–`w010` (`καὶ ἀνέστη καὶ ἀνέζησεν`) and retain their position
as the coordinated second verbal phrase. TR `w005`, the additional `καί`
before `ἀπέθανεν`, remains an explicit fallback.

### ROM.14.22 — omit relative `ἣν`

- TR1894: `σὺ πίστιν ἔχεις κατὰ σαυτόν`
- MACULA: `σὺ πίστιν ἣν ἔχεις κατὰ σεαυτόν`
- Proposed target: `ROM.14.mc00246`
- Proposed decision: `ROM.14.22.omitted-hen`

Rebuild the local clause from exact `ἔχεις` and the deterministically adapted
`κατὰ σαυτόν` phrase, removing unmatched MACULA terminal
`n45014022003`. The local rule becomes V–ADV rather than O–V–ADV.

## Deterministic cases — no human syntax decision needed

Seven isolated one-to-one spelling, form, and reading differences are covered
by deterministic TR-authority adaptations. Preserving their provenance removes
five false nested HOLD groups from the persisted candidate before human
decisions are considered.

## Existing no-syntax fallbacks

Fifteen authoritative TR-only tokens remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.14.3: `ROM.14.3.w008`
- ROM.14.4: `ROM.14.4.w018`
- ROM.14.6: `ROM.14.6.w008`–`w015`
- ROM.14.9: `ROM.14.9.w005`
- ROM.14.21: `ROM.14.21.w016`–`w019`

## Required verification

The four proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.14.macula.json`, run the MACULA tests, and
have a separate verifier compare the rebuilt tree with this report before
release.
