# Romanos 8 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 8 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the original 45 HOLD groups
reduce to 39 nested groups at six locations: ROM.8.11, 8.14, 8.23, 8.26,
8.34, and 8.38. Eleven minimal decisions resolve those locations.

With the proposed decisions applied in memory, the chapter validates with:

- 389 exact groups
- 37 human-adjudicated groups
- 49 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 11 human-adjudicated TR words
- 14 deterministic TR-authority-adapted words
- 12 TR-only fallback words in four verses, each explicitly carrying no syntax claim

## Decisions requiring named-human confirmation

### ROM.8.11 — articles, object identity, and TR order

- TR1894: `τοῦ ἐγείραντος Ἰησοῦν ... ὁ ἐγείρας τὸν Χριστὸν ἐκ νεκρῶν`
- MACULA: `τοῦ ἐγείραντος τὸν Ἰησοῦν ... ὁ ἐγείρας ἐκ νεκρῶν Χριστὸν Ἰησοῦν`
- Proposed decisions: `ROM.8.11.omitted-article-before-jesus`,
  `ROM.8.11.ton-christon-object`,
  `ROM.8.11.verb-object-adverb-order`

Remove MACULA article `n45008011007` while retaining exact `Ἰησοῦν` as the
first participle’s object. Replace MACULA `Χριστὸν Ἰησοῦν` terminals
`n45008011018`–`019` with native TR `τὸν Χριστόν` (`w015`–`w016`). Finally,
reorder the second participial clause as verb–object–adverbial, retaining exact
`ἐκ νεκρῶν`.

### ROM.8.14 — `εἰσιν υἱοί`

- TR1894: `οὗτοι εἰσιν υἱοὶ Θεοῦ`
- MACULA: `οὗτοι υἱοί εἰσιν Θεοῦ`
- Proposed decisions: `ROM.8.14.eisin-terminal`,
  `ROM.8.14.huioi-terminal`

Bind MACULA copula terminal `n45008014008` to TR `w007` and MACULA predicate
terminal `n45008014007` to TR `w008`. This preserves their grammatical roles
while using authoritative TR identities.

### ROM.8.23 — `καὶ ἡμεῖς`

- TR1894: `καὶ ἡμεῖς αὐτοὶ ἐν ἑαυτοῖς στενάζομεν`
- MACULA: `ἡμεῖς καὶ αὐτοὶ ἐν ἑαυτοῖς στενάζομεν`
- Proposed decisions: `ROM.8.23.hemeis-terminal`,
  `ROM.8.23.kai-terminal`

Bind MACULA `ἡμεῖς` (`n45008023012`) to TR `w013` and MACULA `καί`
(`n45008023013`) to TR `w012`, retaining the existing subject structure.

### ROM.8.26 — plural `ταῖς ἀσθενείαις`

- TR1894: `συναντιλαμβάνεται ταῖς ἀσθενείαις ἡμῶν`
- MACULA: `συναντιλαμβάνεται τῇ ἀσθενείᾳ ἡμῶν`
- Proposed decisions: `ROM.8.26.astheneiais-terminal`,
  `ROM.8.26.astheneiais-noun-terminal`

Replace MACULA article and noun terminals `n45008026007`–`008` with native TR
`w007`–`w008`, preserving the dative adverbial noun-phrase attachment.

### ROM.8.34 — omit MACULA `Ἰησοῦς`

- TR1894: `Χριστὸς ὁ ἀποθανών`
- MACULA: `Χριστὸς Ἰησοῦς ὁ ἀποθανών`
- Proposed target: `ROM.8.mc00401`
- Proposed decision: `ROM.8.34.omitted-jesus`

Remove MACULA terminal `n45008034005` and retain exact TR `Χριστός` as the
head noun. The surrounding appositional participial structure remains intact.

### ROM.8.38 — place `δυνάμεις` in authoritative list order

- TR1894: `οὔτε ἀρχαὶ οὔτε δυνάμεις οὔτε ἐνεστῶτα οὔτε μέλλοντα`
- MACULA: `οὔτε ἀρχαὶ οὔτε ἐνεστῶτα οὔτε μέλλοντα οὔτε δυνάμεις`
- Proposed target: `ROM.8.mc00455`
- Proposed decision: `ROM.8.38.dynameis-list-order`

Replace MACULA terminals `n45008038012`, `016`, and `017` with native TR
`w012`–`w014`, rebuilding this portion of the coordinated noun list in TR
order while retaining exact `ἐνεστῶτα` and `οὔτε μέλλοντα`.

## Deterministic cases — no human syntax decision needed

The remaining one-to-one form differences are already covered by deterministic
TR-authority adaptations. Preserving their provenance removes six false HOLD
groups from the persisted candidate.

## Existing no-syntax fallbacks

These authoritative TR-only additions remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.8.1: `μὴ κατὰ σάρκα περιπατοῦσιν ἀλλὰ κατὰ πνεῦμα`
- ROM.8.24: added `καὶ`
- ROM.8.26: `ὑπὲρ ἡμῶν`
- ROM.8.34: two added `καὶ` particles

## Required verification

The eleven proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to `source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After
confirmation, rebuild `nt-syntax/candidates/RO.8.macula.json`, run the MACULA
tests, and have a separate verifier compare the rebuilt tree with this report
before release.
