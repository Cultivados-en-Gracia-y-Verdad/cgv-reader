# Romanos 15 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 15 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the persisted 44 HOLD groups
reduce to 42 nested groups at eight verses: ROM.15.7, 15.8, 15.11, 15.14,
15.17, 15.18, 15.27, and 15.31. Eleven minimal decisions resolve those
locations.

With the proposed decisions applied in memory, the chapter validates with:

- 292 exact groups
- 42 human-adjudicated groups
- 59 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 8 human-adjudicated TR words
- 14 deterministic TR-authority-adapted words
- 13 TR-only fallback words in nine verses, each explicitly carrying no
  syntax claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.15.7, 15.14, and 15.17 — omit three MACULA-only articles

- ROM.15.7 TR: `εἰς δόξαν Θεοῦ`; MACULA: `εἰς δόξαν τοῦ Θεοῦ`
- ROM.15.14 TR: `πάσης γνώσεως`; MACULA: `πάσης τῆς γνώσεως`
- ROM.15.17 TR: `τὰ πρὸς Θεόν`; MACULA: `τὰ πρὸς τὸν Θεόν`
- Proposed decisions: `ROM.15.7.omitted-article`,
  `ROM.15.14.omitted-article`, and `ROM.15.17.omitted-article`

Rebuild the affected one-word noun groups from their exact TR anchors,
removing MACULA terminals `n45015007012`, `n45015014018`, and
`n45015017010`. No replacement TR token exists for any of the articles.

### ROM.15.8 — `δέ`, not `γάρ`

- TR1894: `λέγω δὲ Ἰησοῦν Χριστόν`
- MACULA: `λέγω γὰρ Χριστόν`
- Proposed decision: `ROM.15.8.de-terminal`

Bind MACULA connector terminal `n45015008002` to native TR
`ROM.15.8.w002` (`δέ`) while retaining its Conj–CL attachment. Added TR
`Ἰησοῦν` (`w003`) remains fallback-only because MACULA has no corresponding
terminal.

### ROM.15.11 — authoritative object order

- TR1894: `Αἰνεῖτε τὸν Κύριον πάντα τὰ ἔθνη`
- MACULA: `Αἰνεῖτε πάντα τὰ ἔθνη τὸν Κύριον`
- Proposed decisions: `ROM.15.11.ton-terminal` and
  `ROM.15.11.kurion-terminal`

Bind MACULA terminals `n45015011007`–`008` to native TR
`ROM.15.11.w004`–`w005`. Their existing direct-object noun-phrase attachment
is retained while the TR identities establish the authoritative position.

### ROM.15.18 — `λαλεῖν τι`

- TR1894: `οὐ γὰρ τολμήσω λαλεῖν τι`
- MACULA: `οὐ γὰρ τολμήσω τι λαλεῖν`
- Proposed decisions: `ROM.15.18.lalein-terminal` and
  `ROM.15.18.ti-terminal`

Bind MACULA `λαλεῖν` terminal `n45015018005` to TR `w004` and `τι`
terminal `n45015018004` to TR `w005`. The existing V–O analysis remains
applicable.

### ROM.15.27 — `ὀφειλέται αὐτῶν εἰσιν`

- TR1894: `καὶ ὀφειλέται αὐτῶν εἰσιν`
- MACULA: `καὶ ὀφειλέται εἰσὶν αὐτῶν`
- Proposed decisions: `ROM.15.27.eisin-terminal` and
  `ROM.15.27.auton-terminal`

Bind MACULA `εἰσίν` terminal `n45015027005` to TR `w006` and `αὐτῶν`
terminal `n45015027006` to TR `w005`. Their predicate–copula–adverbial roles
are retained with authoritative TR identities.

### ROM.15.31 — position of `γένηται`

- TR1894: `ἡ ... διακονία μου ... εὐπρόσδεκτος γένηται τοῖς ἁγίοις`
- MACULA: `ἡ ... διακονία μου ... εὐπρόσδεκτος τοῖς ἁγίοις γένηται`
- Proposed decision: `ROM.15.31.genetai-terminal`

Bind MACULA terminal `n45015031019` to native TR `ROM.15.31.w018`
(`γένηται`). Its copular function remains intact despite the surface-order
difference.

## Deterministic cases — no human syntax decision needed

Fourteen isolated one-to-one spelling, form, and order differences are covered
by deterministic TR-authority adaptations. Preserving their provenance removes
two false nested HOLD groups from the persisted candidate before human
decisions are considered.

## Existing no-syntax fallbacks

Thirteen authoritative TR-only tokens remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.15.2: `ROM.15.2.w002`
- ROM.15.8: `ROM.15.8.w003`
- ROM.15.15: `ROM.15.15.w005`
- ROM.15.21: `ROM.15.21.w009`
- ROM.15.24: `ROM.15.24.w007`–`w009`
- ROM.15.28: `ROM.15.28.w014`
- ROM.15.29: `ROM.15.29.w010`–`w012`
- ROM.15.31: `ROM.15.31.w010`
- ROM.15.32: `ROM.15.32.w010`

## Required verification

The eleven proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.15.macula.json`, run the MACULA tests, and
have a separate verifier compare the rebuilt tree with this report before
release.
