# Romanos 2 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 2 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

The 17 reported HOLD groups reduce to three textual locations: ROM.2.8,
ROM.2.16, and ROM.2.17. Six minimal decisions resolve those locations. At
ROM.2.17 the MACULA conditional is not retained; the branch is rebuilt as a
TR-native independent attention/statement sequence.

With the six proposed decisions applied in memory, the chapter validates
with:

- 312 exact groups
- 18 human-adjudicated groups
- 12 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 7 human-adjudicated TR words
- 6 deterministic TR-authority-adapted words
- 3 TR-only fallback words in two verses, each explicitly carrying no syntax claim
- 0 unplaced mapped TR tokens

## Decisions requiring named-human confirmation

### ROM.2.8 — authoritative verb and coordinated subject order

- TR1894: `ἀπειθοῦσι μὲν τῇ ἀληθείᾳ ... θυμὸς καὶ ὀργή`
- MACULA: `ἀπειθοῦσι τῇ ἀληθείᾳ ... ὀργὴ καὶ θυμός`
- Proposed decisions: `ROM.2.8.apeithousin-terminal`,
  `ROM.2.8.thymos-kai-orge-order`

Bind MACULA `n45002008006` (`ἀπειθοῦσι`) to authoritative TR token
`ROM.2.8.w006`, preserving its verbal attachment. TR-only `μέν`
(`ROM.2.8.w007`) remains an explicit no-syntax fallback.

Rebuild `ROM.2.mc00106` in authoritative TR order as `θυμὸς καὶ ὀργή`, using
native TR tokens `ROM.2.8.w014`–`w016`. Preserve the MACULA coordinated-NP
classification and subject function.

### ROM.2.16 — `ἐν ἡμέρᾳ ὅτε`

- TR1894: `ἐν ἡμέρᾳ ὅτε κρίνει ὁ Θεὸς ... διὰ Ἰησοῦ Χριστοῦ`
- MACULA: `ἐν ᾗ ἡμέρᾳ κρίνει ὁ Θεὸς ... διὰ Χριστοῦ Ἰησοῦ`
- Proposed target: `ROM.2.mc00203`
- Proposed decision: `ROM.2.16.en-hemera-hote-structure`

Replace MACULA relative terminal `n45002016002` (`ᾗ`) with native TR
`ROM.2.16.w003` (`ὅτε`) and rebuild the temporal clause in TR order. Retain all
exact subject, object, and adverbial subtrees. The final `Ἰησοῦ Χριστοῦ` order
is already handled by the deterministic flat-permutation rule.

### ROM.2.17 — replace the conditional with the TR-native opening

- TR1894: `ἴδε σὺ Ἰουδαῖος ἐπονομάζῃ ... ἐπαναπαύῃ τῷ νόμῳ`
- MACULA: `Εἰ δὲ σὺ Ἰουδαῖος ἐπονομάζῃ ... ἐπαναπαύῃ νόμῳ`
- Proposed targets: `ROM.2.mc00240`, `ROM.2.mc00245`, and
  `ROM.2.mc00206`
- Proposed decisions: `ROM.2.17.ide-independent-opening`,
  `ROM.2.17.omitted-de`, and `ROM.2.17.to-nomo`

This is not a spelling or token-order difference. MACULA supplies a conditional
subordinate clause headed by `Εἰ δὲ`; TR1894 instead supplies imperative `ἴδε`
and later includes article `τῷ`. Replace MACULA `Εἰ` with native TR `ἴδε` and
rebuild `ROM.2.mc00240` as an independent V–CL attention/statement sequence,
retaining the exact six-clause continuation. Remove MACULA `δέ` by promoting
the rebuilt sequence through `ROM.2.mc00245`. Finally, insert native TR `τῷ`
between exact `ἐπαναπαύῃ` and `νόμῳ` in `ROM.2.mc00206`. This resolves the
reading without asserting MACULA's conditional `sub-CL` analysis for TR1894.

## Deterministic cases — no human syntax decision needed

The differences at ROM.2.11, ROM.2.14, ROM.2.15, and ROM.2.26 are isolated
one-to-one TR-authority adaptations. ROM.2.13 adds two TR articles; they remain
explicit no-syntax fallback tokens and do not invalidate the surrounding exact
MACULA structure.

## Required verification

The six proposed decisions above were authored in these passes and cannot
be verified by the same agent. They require named-human confirmation before
being added to `source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`.
After confirmation, rebuild `nt-syntax/candidates/RO.2.macula.json`, run the
MACULA tests, and have a separate verifier compare the rebuilt tree with this
report before release.
