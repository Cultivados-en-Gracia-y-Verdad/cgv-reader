# Romanos 9 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 9 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the original 21 HOLD groups
reduce to 20 nested groups at five locations: ROM.9.3, the ROM.9.11–12 verse
boundary, 9.15, 9.19, and 9.20. Sixteen minimal terminal decisions resolve
those locations without inventing a new grammatical attachment.

With the proposed decisions applied in memory, the chapter validates with:

- 339 exact groups
- 20 human-adjudicated groups
- 31 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 16 human-adjudicated TR words
- 7 deterministic TR-authority-adapted words
- 10 TR-only fallback words in five verses, each explicitly carrying no
  syntax claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.9.3 — restore TR subject and predicate identities

- TR1894: `ηὐχόμην γὰρ αὐτὸς ἐγὼ ἀνάθεμα εἶναι`
- MACULA: `ηὐχόμην γὰρ ἀνάθεμα εἶναι αὐτὸς ἐγὼ`
- Proposed decisions: `ROM.9.3.autos-terminal`,
  `ROM.9.3.ego-terminal`, `ROM.9.3.anathema-terminal`, and
  `ROM.9.3.einai-terminal`

Bind MACULA subject terminals `n45009003005`–`006` to native TR `w003`–`004`
(`αὐτὸς ἐγώ`) and predicate terminals `n45009003003`–`004` to native TR
`w005`–`006` (`ἀνάθεμα εἶναι`). The existing V–S–O–ADV analysis already
expresses the TR grammatical order; only the terminal identities differ.

### ROM.9.11–12 — retain the clause across the different verse boundary

- TR1894 places `οὐκ ἐξ ἔργων ἀλλ’ ἐκ τοῦ καλοῦντος` at the end of 9:11.
- MACULA places the same seven-word structure at the beginning of 9:12.
- Proposed decisions: one native-TR terminal binding for each MACULA terminal
  `n45009012001`–`007`, using TR tokens `ROM.9.11.w018`–`w024`, plus
  `ROM.9.12.errethe-terminal` for `n45009012008` / `ROM.9.12.w001`.

Preserve MACULA’s `notPPbutPP` adverbial structure and bind its seven terminals
to the authoritative TR tokens in 9:11. Then bind MACULA `ἐρρέθη` to native TR
9:12 `w001`. This is a verse-number boundary difference, not a reason to drop
the clause or give the words a false fallback status.

### ROM.9.15 — Moses form and particle order

- TR1894: `τῷ γὰρ Μωσῇ λέγει`
- MACULA: `τῷ Μωϋσεῖ γὰρ λέγει`
- Proposed decision: `ROM.9.15.mose-terminal`

Bind MACULA `Μωϋσεῖ` terminal `n45009015002` to native TR `Μωσῇ`
(`ROM.9.15.w003`). It remains the indirect-object noun phrase; exact `γάρ`
already maps to TR `w002`.

### ROM.9.19 — `οὖν μοι`

- TR1894: `Ἐρεῖς οὖν μοι`
- MACULA: `Ἐρεῖς μοι οὖν`
- Proposed decisions: `ROM.9.19.moi-terminal` and
  `ROM.9.19.oun-terminal`

Bind MACULA `μοι` (`n45009019002`) to TR `w003` and MACULA `οὖν`
(`n45009019003`) to TR `w002`. Their existing grammatical functions remain;
the authoritative token identities supply the TR order.

### ROM.9.20 — `μενοῦνγε`

- TR1894: `μενοῦνγε, ὦ ἄνθρωπε`
- MACULA: `ὦ ἄνθρωπε, μενοῦνγε`
- Proposed decision: `ROM.9.20.menounge-terminal`

Bind MACULA `μενοῦνγε` terminal `n45009020003` to native TR
`ROM.9.20.w001`. Its discourse relation to the following address and clause is
retained without borrowing the MACULA terminal as the TR identity.

## Deterministic cases — no human syntax decision needed

The isolated one-to-one form differences elsewhere in the chapter are covered
by deterministic TR-authority adaptations. Preserving their provenance removes
one false HOLD group from the persisted candidate before human decisions are
considered.

## Existing no-syntax fallbacks

Ten authoritative TR-only tokens remain explicit fallbacks and make no MACULA
grammatical attachment claim:

- ROM.9.11: `ROM.9.11.w016`
- ROM.9.28: `ROM.9.28.w006`–`w010`
- ROM.9.31: `ROM.9.31.w008`
- ROM.9.32: `ROM.9.32.w011` and `w013`
- ROM.9.33: `ROM.9.33.w013`

## Required verification

The sixteen proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.9.macula.json`, run the MACULA tests, and have
a separate verifier compare the rebuilt tree with this report before release.
