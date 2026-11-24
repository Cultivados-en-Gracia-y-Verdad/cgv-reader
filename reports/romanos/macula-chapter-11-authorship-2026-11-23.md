# Romanos 11 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 11 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the persisted 33 HOLD groups
reduce to 16 nested groups at five locations: ROM.11.6, 11.20, 11.22, 11.23,
and 11.31. Five minimal decisions resolve those locations. The long TR-only
addition in 11:6 and other isolated additions remain explicit fallbacks rather
than receiving invented MACULA syntax.

With the proposed decisions applied in memory, the chapter validates with:

- 332 exact groups
- 16 human-adjudicated groups
- 65 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 4 human-adjudicated TR words
- 22 deterministic TR-authority-adapted words
- 21 TR-only fallback words in nine verses, each explicitly carrying no
  syntax claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.11.6 — final `χάρις`

- TR1894 first clause ends: `ἐπεὶ ἡ χάρις οὐκέτι γίνεται χάρις`
- MACULA has the same first clause, followed by no second clause.
- Proposed decision: `ROM.11.6.charis-terminal`

Bind MACULA terminal `n45011006012` to native TR `ROM.11.6.w012` (`χάρις`).
TR `w013`–`w025`, the entire added contrast beginning `εἰ δὲ ἐξ ἔργων`, stays
fallback-only because MACULA provides no corresponding structure.

### ROM.11.20 — compound imperative `ὑψηλοφρόνει`

- TR1894: `μὴ ὑψηλοφρόνει`
- MACULA: `μὴ ὑψηλὰ φρόνει`
- Proposed target: `ROM.11.mc00236`
- Proposed decision: `ROM.11.20.hypselophronei-native`

Replace MACULA terminals `n45011020011`–`012` with the single native TR word
`ROM.11.20.w011`. The rebuilt child is a verbal clause, not the MACULA
object–verb analysis of two separate words.

### ROM.11.22 — accusative `χρηστότητα`

- TR1894: `ἐπὶ δὲ σὲ χρηστότητα`
- MACULA: `ἐπὶ δὲ σὲ χρηστότης Θεοῦ`
- Proposed target: `ROM.11.mc00256`
- Proposed decision: `ROM.11.22.chrestoteta-native`

Replace MACULA terminals `n45011022015`–`016` with native TR
`ROM.11.22.w015` (`χρηστότητα`). The rebuilt noun phrase is the accusative
object governed by the earlier `ἴδε`; MACULA’s nominative `χρηστότης` and
additional `Θεοῦ` are not retained as TR identities.

### ROM.11.23 — contracted `κἀκεῖνοι`

- TR1894: `καὶ ἐκεῖνοι δέ`
- MACULA: `κἀκεῖνοι δέ`
- Proposed decision: `ROM.11.23.ekeinoi-terminal`

Bind MACULA subject terminal `n45011023001` to native TR
`ROM.11.23.w002` (`ἐκεῖνοι`). Added TR `καί` (`w001`) remains an explicit
no-syntax fallback.

### ROM.11.31 — omit MACULA’s second `νῦν`

- TR1894 ending: `ἵνα καὶ αὐτοὶ ἐλεηθῶσιν`
- MACULA ending: `ἵνα καὶ αὐτοὶ νῦν ἐλεηθῶσιν`
- Proposed target: `ROM.11.mc00364`
- Proposed decision: `ROM.11.31.omitted-nun`

Rebuild the clause from its exact subject and verb anchors, removing unmatched
MACULA terminal `n45011031012`. The resulting local rule is S–V rather than
MACULA’s S–ADV–V.

## Deterministic cases — no human syntax decision needed

Twenty-two isolated form, spelling, and one-to-one reading differences are
covered by deterministic TR-authority adaptations. Preserving their provenance
removes 17 false nested HOLD groups from the persisted candidate before human
decisions are considered.

## Existing no-syntax fallbacks

Twenty-one authoritative TR-only tokens remain explicit fallbacks and make no
MACULA grammatical attachment claim:

- ROM.11.2: `ROM.11.2.w026`
- ROM.11.3: `ROM.11.3.w006`
- ROM.11.6: `ROM.11.6.w013`–`w025`
- ROM.11.17: `ROM.11.17.w018`
- ROM.11.19: `ROM.11.19.w004`
- ROM.11.21: `ROM.11.21.w011`
- ROM.11.23: `ROM.11.23.w001`
- ROM.11.26: `ROM.11.26.w013`
- ROM.11.30: `ROM.11.30.w003`

## Required verification

The five proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.11.macula.json`, run the MACULA tests, and
have a separate verifier compare the rebuilt tree with this report before
release.
