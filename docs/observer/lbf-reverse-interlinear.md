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
| Observer Greek spine | MorphGNT token ids | Grammar workstation + progress ids |
| Observer Spanish surface | **LBF** | Settled reading + reverse interlinear |
| Per-token Spanish aid | **LBF** alignment | Under-token + Compiler notes (no BLE gloss) |

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

- Under each Greek token: **aligned LBF surface** (from this file) only.
- Unaligned tokens show `·` (no BLE gloss under the token).
- Token popover: lemma / Strong’s / morph + LBF line only.
- Beginning-token strip: label **LBF**, not BLE.
- The full verse line under the interlinear is LBF in **Spanish reading order** — it will not
  line up column-for-column with Greek; that is expected, not a bug.

## Maintaining the map

**Tito (baseline):** frozen for Reader-side rebuilds. Do not run
`scripts/rebuild-lbf-alignment.py` as ongoing maintenance. Further Tito work goes
through cgv-translator → Biblia-LBF; sync staging copies intentionally.

**1 Pedro:** source of truth is translator reverse-links. Recompile with
`scripts/compile-lbf-alignment-1pedro.py`. Do not hand-patch the JSON for verses
already linked; do not use the deprecated bootstrap script for maintenance.

Unaligned tokens show `·` under the Greek (no BLE fallback).


## Judas

Same pipeline as 1 Pedro:

1. Translator reverse links: `cgv-translator/translations/tr-spine/jude/jude-reverse-links.json`
   (full-book manual realign via `scripts/rebuild_jude_manual_reverse_links.py` after the
   auto-zip slide; do not re-seed with `seed_jude_reverse_links.py` unless starting over).
2. Compile Reader alignment:

```bash
python3 scripts/compile-lbf-alignment-judas.py
```

`data/lbf/nt/judas.alignment.json` is the Structure map. Re-run after link edits.
Compile also patches MorphGNT-only gaps (no TR `sourceTokenId`) where LBF Spanish is clear.

## 1 Juan

Same pipeline as Judas / 1 Pedro:

1. TR spine: `cgv-translator/scripts/build_tr_spine_1john.py`
   → `translations/tr-spine/1john/`
2. Reverse links: `scripts/seed_1john_reverse_links.py` (auto scaffold; hand-refine in UI)
3. Compile Reader alignment:

```bash
python3 scripts/compile-lbf-alignment-1juan.py
```

`data/lbf/nt/1juan.alignment.json` is the Structure map. Re-run after link edits.

## Daniel (OT — hand alignment production)

Canon: `herramientas/Biblia-LBF/translation/ot/daniel.md`.  
Staging: `data/lbf/ot/daniel.md`.

| Layer | Status |
|-------|--------|
| Reader LBF | Full-book Spanish (chs 1–12), OSHB faithfulness pass, Latin American *ustedes* |
| OSHB spine | `cgv-data/interlinears/OT/daniel.tokens.jsonl` (MT→Prot remap in Reader/workbench) |
| Hand align | `data/lbf/ot/daniel.align.<n>.json` (n=1–12) — editable source of truth |
| Book merge | `data/lbf/ot/daniel.align.json` — regenerate with hand compile `--also-merge` |
| Production map | `data/lbf/ot/daniel.alignment.json` — Reader Structure consumer |
| Observer Mark / Structure | Enabled — OSHB morph + LBF reverse-interlinear |

Verse numbering: OSHB spine uses **MT**; LBF/alignment/Observer display use **Protestant**. Remap: MT 3:31–33→4:1–3; MT 4:n→4:(n+3); MT 6:1→5:31; MT 6:n(n≥2)→6:(n−1).

### Daniel maintenance (hand path — do not gloss-seed)

Edit Spanish in staging (or Biblia-LBF, then sync). Edit chapter hand files. Then:

```bash
python3 scripts/lbf-align-workbench.py check <ch>          # after chapter edits
python3 scripts/compile-lbf-alignment-daniel-hand.py --also-merge
python3 scripts/verify-lbf-text.py
python3 scripts/fill-daniel-mark-progress.py --repair      # refresh Observer workshop fill
```

**Do not** run `seed-daniel-reverse-links.py` or `compile-lbf-alignment-daniel.py` for production — the gloss-seed compile refuses unless `--force-gloss-seed` is passed.

Author in Biblia-LBF; keep staging in sync intentionally.

## Open follow-ups

1. Finish 1 Pedro / Judas / 1 Juan reverse links to Tito’s hand-quality bar (see ADR-0001 checklist).
2. Promote LBF Structure books together into `cgv-data`; cut Reader over from staging.
3. Plan TR1894 Greek spine switch when multi-book LBF work demands it.
4. Daniel Hebrew participles: host picks in Observer (`hebrewParticiplesNeedHostPick` in fill notes).
