# Romanos 13 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 13 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the persisted 15 HOLD groups
reduce to 11 nested groups at ROM.13.3 and 13.11. Six minimal terminal
decisions resolve those locations.

With the proposed decisions applied in memory, the chapter validates with:

- 160 exact groups
- 11 human-adjudicated groups
- 28 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 6 human-adjudicated TR words
- 6 deterministic TR-authority-adapted words
- 7 TR-only fallback words in four verses, each explicitly carrying no syntax
  claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.13.3 — genitive plural contrast

- TR1894: `οἱ γὰρ ἄρχοντες οὐκ εἰσὶν φόβος τῶν ἀγαθῶν ἔργων, ἀλλὰ τῶν κακῶν`
- MACULA: `οἱ γὰρ ἄρχοντες οὐκ εἰσὶν φόβος τῷ ἀγαθῷ ἔργῳ, ἀλλὰ τῷ κακῷ`
- Proposed decisions: `ROM.13.3.ton-good-terminal`,
  `ROM.13.3.agathon-terminal`, `ROM.13.3.ergon-terminal`,
  `ROM.13.3.ton-bad-terminal`, and `ROM.13.3.kakon-terminal`

Replace MACULA terminals `n45013003007`–`009` with native TR
`ROM.13.3.w007`–`w009`, and terminals `n45013003011`–`012` with native TR
`w011`–`w012`. The existing `notNPbutNP` contrast remains applicable, but its
two noun phrases use the authoritative TR genitive-plural identities rather
than MACULA’s singular datives.

### ROM.13.11 — `ἡμᾶς`, not `ὑμᾶς`

- TR1894: `ὥρα ἡμᾶς ἤδη ἐξ ὕπνου ἐγερθῆναι`
- MACULA: `ὥρα ἤδη ὑμᾶς ἐξ ὕπνου ἐγερθῆναι`
- Proposed decision: `ROM.13.11.hemas-terminal`

Bind MACULA terminal `n45013011009` to native TR `ROM.13.11.w008`
(`ἡμᾶς`). It retains its subject function in the infinitival clause; the
person difference is corrected without borrowing the MACULA token identity.

## Deterministic cases — no human syntax decision needed

Six isolated one-to-one spelling, form, and order differences are covered by
deterministic TR-authority adaptations. Preserving their provenance removes
four false nested HOLD groups from the persisted candidate before human
decisions are considered.

## Existing no-syntax fallbacks

Seven authoritative TR-only tokens remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.13.1: `ROM.13.1.w017` and `w019`
- ROM.13.7: `ROM.13.7.w002`
- ROM.13.9: `ROM.13.9.w009`, `w010`, and `w019`
- ROM.13.12: `ROM.13.12.w014`

## Required verification

The six proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.13.macula.json`, run the MACULA tests, and
have a separate verifier compare the rebuilt tree with this report before
release.
