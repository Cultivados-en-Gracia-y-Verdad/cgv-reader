# Romanos 7 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 7 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

After deterministic provenance is preserved, the original 14 HOLD groups
reduce to ten nested groups at two locations: the ROM.7.9–10 verse-boundary
shift and the expanded TR ending at ROM.7.18. Two TR-native decisions resolve
both locations.

With the proposed decisions applied in memory, the chapter validates with:

- 293 exact groups
- 9 human-adjudicated groups
- 28 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 5 human-adjudicated TR words
- 9 deterministic TR-authority-adapted words
- 0 TR-only fallback words

## Decisions requiring named-human confirmation

### ROM.7.9–10 — authoritative verse boundary

- TR1894 ROM.7.9 ends: `ἡ ἁμαρτία ἀνέζησεν, ἐγὼ δὲ ἀπέθανον`
- MACULA places `ἐγὼ δὲ ἀπέθανον` at the beginning of ROM.7.10
- Proposed target: `ROM.7.mc00140`
- Proposed decision: `ROM.7.9.ego-de-apethanon-boundary`

Replace MACULA terminals `n45007010002`, `n45007010001`, and
`n45007010003` with native TR tokens `ROM.7.9.w014`–`w016`, rebuilding the
clause in authoritative subject–particle–verb order. The clause remains in its
existing structural relationship with `ἡ ἁμαρτία ἀνέζησεν`, but its token
identities and verse reference follow Scrivener TR1894.

### ROM.7.18 — restore `οὐχ εὑρίσκω`

- TR1894: `τὸ δὲ κατεργάζεσθαι τὸ καλὸν οὐχ εὑρίσκω`
- MACULA: `τὸ δὲ κατεργάζεσθαι τὸ καλὸν οὔ`
- Proposed target: `ROM.7.mc00240`
- Proposed decision: `ROM.7.18.ouch-heurisko-ending`

Replace MACULA terminal `n45007018025` with native TR tokens
`ROM.7.18.w025` (`οὐχ`) and `w026` (`εὑρίσκω`). Retain exact subject subtree
`ROM.7.mc00239` and rebuild the clause as subject–adverb–verb rather than an
elided clause.

## Deterministic cases — no human syntax decision needed

The differences at ROM.7.6, ROM.7.13, ROM.7.14, ROM.7.16, ROM.7.17,
ROM.7.19, ROM.7.20, ROM.7.23, and ROM.7.25 are isolated one-to-one or
MACULA-only deterministic adaptations. Preserving their provenance removes
four false ancestor HOLD groups.

## Required verification

The two proposed decisions above were authored in this pass and cannot be
verified by the same agent. They require named-human confirmation before being
added to `source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After
confirmation, rebuild `nt-syntax/candidates/RO.7.macula.json`, run the MACULA
tests, and have a separate verifier compare the rebuilt tree with this report
before release.
