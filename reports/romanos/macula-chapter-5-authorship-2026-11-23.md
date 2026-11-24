# Romanos 5 — MACULA/TR1894 authorship report

Status: **AUTHORED, NOT VERIFIED, NOT RELEASED**

This report covers Romanos chapter 5 only. It compares the authoritative
Scrivener TR1894/Robinson token stream with the MACULA Nestle1904 lowfat
structure at revision `8423afe47b9e8f24b7772e808af45c7159a6fe7e`.

## Result

The chapter contains one genuine structural difference. All four HOLD groups
are ancestors of the same MACULA-only terminal in ROM.5.6. One minimal
TR-native decision resolves the branch.

With the proposed decision applied in memory, the chapter validates with:

- 302 exact groups
- 4 human-adjudicated groups
- 6 deterministic TR-authority-adapted groups
- 0 HOLD groups
- 0 unmatched MACULA terminals
- 0 human-adjudicated TR words
- 3 deterministic TR-authority-adapted words
- 0 TR-only fallback words

## Decision requiring named-human confirmation

### ROM.5.6 — omit MACULA’s second `ἔτι`

- TR1894: `ἔτι γὰρ Χριστὸς ὄντων ἡμῶν ἀσθενῶν κατὰ καιρὸν ὑπὲρ ἀσεβῶν ἀπέθανεν`
- MACULA: `ἔτι γὰρ Χριστὸς ὄντων ἡμῶν ἀσθενῶν ἔτι κατὰ καιρὸν ὑπὲρ ἀσεβῶν ἀπέθανεν`
- Proposed target: `ROM.5.mc00064`
- Proposed decision: `ROM.5.6.omitted-second-eti`

Remove MACULA terminal `n45005006007`, the second `ἔτι`. Rebuild the retained
exact anchors `ROM.5.6.w004`–`w006` as the adverbial genitive-absolute clause
`ὄντων ἡμῶν ἀσθενῶν`, classified `VC-S-P`. No native TR terminal needs to be
created, because the difference is solely a MACULA-only word.

## Deterministic cases — no human syntax decision needed

ROM.5.1 (`ἔχομεν`/`ἔχωμεν`) and both terminal differences in ROM.5.14 are
already handled by isolated one-to-one TR-authority adaptations. Their MACULA
attachments remain usable with native TR token identities.

## Required verification

The proposed ROM.5.6 decision was authored in this pass and cannot be verified
by the same agent. It requires named-human confirmation before being added to
`source/greek/TR1894/MACULA_STRUCTURE_ADJUDICATIONS.json`. After confirmation,
rebuild `nt-syntax/candidates/RO.5.macula.json`, run the MACULA tests, and have
a separate verifier compare the rebuilt tree with this report before release.
