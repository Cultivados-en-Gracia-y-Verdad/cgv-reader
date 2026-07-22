# LBF as reverse-interlinear Spanish surface

## Freeze / publish (read first)

Ownership, Tito baseline, staging rules, and the 1 Pedro → cgv-data promote
checklist live in sibling repo:

`herramientas/Biblia-LBF/docs/ADR-0001-lbf-freeze-and-publish.md`

(absolute under this machine’s layout:
`/Users/johnwry/Nextcloud/Documents/GitHub/herramientas/Biblia-LBF/docs/ADR-0001-lbf-freeze-and-publish.md`)

**Summary:** Biblia-LBF is the working canon; `data/lbf` is a staging mirror only;
cgv-data receives Tito + 1 Pedro together when both meet the bar. Do not author
LBF text or alignment in Reader.

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

`data/lbf/nt/1pedro.alignment.json` is **compiled** from translator reverse
links (`1peter-reverse-links.json`) via TR spine `morphIndex`:

```bash
python3 scripts/compile-lbf-alignment-1pedro.py
```

Do not hand-patch that JSON for verses already linked in the translator.
Fix the reverse link, then recompile.

## Display rule (Structure passage)

- Under each Greek token: **aligned LBF surface** (from this file), not the BLE gloss.
- BLE gloss stays in the token popover for cross-check.
- The full verse line under the interlinear is LBF in **Spanish reading order** — it will not
  line up column-for-column with Greek; that is expected, not a bug.

## Maintaining the map

**Tito (baseline):** frozen for Reader-side rebuilds. Do not run
`scripts/rebuild-lbf-alignment.py` as ongoing maintenance. Further Tito work goes
through cgv-translator → Biblia-LBF; sync staging copies intentionally.

**1 Pedro:** source of truth is translator reverse-links. Recompile with
`scripts/compile-lbf-alignment-1pedro.py`. Do not hand-patch the JSON for verses
already linked; do not use the deprecated bootstrap script for maintenance.

Unaligned tokens show the BLE gloss in italics as a fallback cue.

## Open follow-ups

1. Finish 1 Pedro to Tito’s bar (see ADR-0001 checklist).
2. Promote Tito + 1 Pedro together into `cgv-data`; cut Reader over from staging.
3. Plan TR1894 Greek spine switch when multi-book LBF work demands it.
