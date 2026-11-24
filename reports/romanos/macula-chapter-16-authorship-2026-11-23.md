# Romanos 16 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 16 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the persisted 17 HOLD groups
reduce to 12 nested groups at ROM.16.14, 16.19, and 16.27. Seven minimal
decisions resolve those locations.

With the proposed decisions applied in memory, the chapter validates with:

- 274 exact groups
- 11 human-adjudicated groups
- 51 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 5 human-adjudicated TR words
- 13 deterministic TR-authority-adapted words
- 17 TR-only fallback words in five verses, each explicitly carrying no
  syntax claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.16.14 — three personal-name terminals

- TR1894: `Ἀσύγκριτον, Φλέγοντα, Ἑρμᾶν, Πατρόβαν, Ἑρμῆν`
- MACULA: `Ἀσύνκριτον, Φλέγοντα, Ἑρμῆν, Πατρόβαν, Ἑρμᾶν`
- Proposed decisions: `ROM.16.14.herman-terminal`,
  `ROM.16.14.patroban-terminal`, and `ROM.16.14.hermen-terminal`

Bind MACULA terminals `n45016014004`–`006` to native TR
`ROM.16.14.w004`–`w006`. This preserves the five-name coordination while
using the authoritative TR identities and order. The earlier `Ἀσύγκριτον`
form difference is handled deterministically.

### ROM.16.19 — `χαίρω οὖν τὸ ἐφ’ ὑμῖν`

- TR1894: `χαίρω οὖν τὸ ἐφ’ ὑμῖν`
- MACULA: `ἐφ’ ὑμῖν οὖν χαίρω`
- Proposed decisions: `ROM.16.19.oun-terminal` and
  `ROM.16.19.chairo-terminal`

Bind MACULA `οὖν` terminal `n45016019010` to TR `w009` and `χαίρω`
terminal `n45016019011` to TR `w008`. Their connector and verbal functions
remain applicable despite the surface-order difference. Added TR article
`w010` remains fallback-only.

### ROM.16.27 — remove two MACULA additions from the doxology

- TR1894: `μόνῳ σοφῷ Θεῷ διὰ Ἰησοῦ Χριστοῦ ἡ δόξα εἰς τοὺς αἰῶνας· ἀμήν`
- MACULA: `μόνῳ σοφῷ Θεῷ διὰ Ἰησοῦ Χριστοῦ ᾧ ἡ δόξα εἰς τοὺς αἰῶνας τῶν αἰώνων· ἀμήν`
- Proposed decisions: `ROM.16.27.omitted-of-the-ages` and
  `ROM.16.27.omitted-relative-ho`

First rebuild `ROM.16.mc00335` from exact TR `αἰῶνας`, removing MACULA
terminals `n45016027013`–`014` (`τῶν αἰώνων`). Then rebuild the surrounding
doxology `ROM.16.mc00338` without unmatched terminal `n45016027007` (`ᾧ`),
retaining the exact divine addressee, `διὰ Ἰησοῦ Χριστοῦ`, subject `ἡ δόξα`,
temporal prepositional phrase, and `ἀμήν`.

## Deterministic cases — no human syntax decision needed

Thirteen isolated one-to-one spelling, form, and reading differences are
covered by deterministic TR-authority adaptations. Preserving their provenance
removes five false nested HOLD groups from the persisted candidate before
human decisions are considered.

## Existing no-syntax fallbacks

Seventeen authoritative TR-only tokens remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.16.18: `ROM.16.18.w007`
- ROM.16.19: `ROM.16.19.w010` and `w017`
- ROM.16.20: `ROM.16.20.w021` and `w024`
- ROM.16.23: `ROM.16.23.w010`
- ROM.16.24: `ROM.16.24.w001`–`w011` (the entire verse is absent from
  MACULA)

## Required verification

The seven proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.16.macula.json`, run the MACULA tests, and
have a separate verifier compare the rebuilt tree with this report before
release.
