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
- Full-book hand pass (Jul 2026): fixed index theft (articles/prepositions
  grabbing the wrong LBF word), relatives, and clear content gaps
- Coverage ~95% of MorphGNT tokens; remaining misses are mostly absorbed
  pronouns/articles or LBF expansions with no 1:1 Greek counterpart

## Display rule (Structure passage)

- Under each Greek token: **aligned LBF surface** (from this file), not the BLE gloss.
- BLE gloss stays in the token popover for cross-check.
- The full verse line under the interlinear is LBF in **Spanish reading order** — it will not
  line up column-for-column with Greek; that is expected, not a bug.

## Maintaining the map

`scripts/rebuild-lbf-alignment.py` starts from the committed bootstrap, reapplies
hand-verified overrides, then high-confidence BLE→LBF content remaps. Prefer
adding overrides to that script over one-off JSON edits.

Unaligned tokens (~11%) show the BLE gloss in italics as a fallback cue.

## Open follow-ups

1. Continue hand overrides where BLE gloss and LBF wording diverge (esp. paraphrases).
2. Publish LBF + alignment into `cgv-data` once stable.
3. Plan TR1894 Greek spine switch when multi-book LBF work demands it.
