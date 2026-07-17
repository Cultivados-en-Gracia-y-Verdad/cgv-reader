# LBF as reverse-interlinear Spanish surface

## Decision

Observer’s settled / reverse-interlinear Spanish surface is **La Biblia Fiel (LBF)**,
not RV1909.

| Layer | Source | Role |
|-------|--------|------|
| Reader | NBLA | Pure encounter |
| Observer Greek spine | MorphGNT / BLE tokens | Grammar workstation + progress ids |
| Observer Spanish surface | **LBF** | Settled reading + reverse interlinear |
| Per-token gloss (working) | BLE `es` | Greek-primary interlinear aid |

## Why not RV1909

RV1909 had a verified Mission Mutual alignment, but its Spanish is the wrong
register for this product, and the alignment needed ongoing gap patches.
LBF is built for structural faithfulness and matches Observer’s discipline.

## Why MorphGNT stays (for now)

Existing Titus progress (brick marks, clause `greek*` ids) is on MorphGNT token
ids. TR1894 (LBF’s translation base) has a different token count (~679 vs 659
for Titus). Switching the Greek spine to TR is a later, deliberate migration —
not required to read LBF Spanish over the current Greek spans.

## Alignment file

`data/lbf/nt/tito.alignment.json` maps `chapter/verse/token` → LBF word index.

- Bootstrap: Mission Mutual RV1909 targets + BLE glosses (build-time only)
- Finite-verb gaps: filled manually against the LBF Titus draft
- Coverage at generation: 100% of finite verbs; ~88% of all tokens
  (remaining misses are mostly function words that need no clause anchor)

## Open follow-ups

1. Hand-improve non-finite token coverage where reverse-interlinear display needs it.
2. Publish LBF + alignment into `cgv-data` once stable.
3. Plan TR1894 Greek spine switch when multi-book LBF work demands it.
