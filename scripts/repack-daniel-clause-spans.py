#!/usr/bin/env python3
"""Repack Daniel clause spans so the student-facing H4 surface is emit-ready.

The Mark fill created one clause row per OSHB finite form. Where Hebrew has a
finite verb that Spanish realizes inside a periphrasis — or does not realize at
all — the rows collapse onto the same LBF token. Three defects reach the manual:

  * degenerate rows: several clauses claim one token, so the manual prints
    `#### *dijo*` three times (5:10) or `- *tornará*` twice (9:25);
  * seam bleed: the next span starts on the previous span's last token, so
    adjacent claims repeat text (2:38, 4:34, 12:4);
  * split periphrasis: the boundary falls between auxiliary and participle, so
    a claim ends on `has` / `fue` / `será` and cannot be read aloud alone
    (5:27 «TEKEL: Pesado has», 5:28 «PERES: Tu reino fue»).

`recut-daniel-clause-spans.py` fixed the connector case and deliberately left
the periphrasis case alone ("a passive split ... is a real clause end"). For
Spanish that call is wrong: *Tu reino fue* is not a clause. This pass finishes
the job.

Per verse it: drops degenerate duplicate rows, makes the surviving spans cover
the verse exactly once with no overlap, then moves each boundary off a dangling
tail — LEFT when the tail is a connector (it opens the next clause), RIGHT past
the participle when the tail is an auxiliary (it belongs to this one).

Dropping a row removes a Hebrew finite verb from the Spanish clause store. Every
drop is listed in the report and the original file is backed up, so the pass is
reviewable and reversible.

  python3 scripts/repack-daniel-clause-spans.py --dry-run
  python3 scripts/repack-daniel-clause-spans.py --apply
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRESS = ROOT / "data/lbf/ot/daniel-progress-filled.json"
LBF = ROOT / "data/lbf/ot/daniel.md"

CLAUSES_KEY = "the-reader:spanish-clause-builder:daniel:v3"
# Stores keyed by the same clause id; a dropped row must leave no orphan behind.
PARALLEL_KEYS = [
    "the-reader:spanish-clause-builder:daniel:statement-command-review:v1",
    "the-reader:spanish-clause-builder:daniel:clause-actors:v1",
    "the-reader:spanish-clause-builder:daniel:participle-subjects:v1",
    "o-prototype:daniel:finite-verb-marks",
    "roots:daniel:brick2:mood:imperativeCandidates",
    "roots:daniel:brick2c:mood:statementCandidates",
    "roots:daniel:brick4:participleCandidates",
]

# Tails that lean into the NEXT clause: move them right, so they open it.
CONNECTOR_TAIL = {
    "y", "e", "o", "u", "ni", "mas", "pero", "empero", "sino",
    "que", "quien", "quienes", "cual", "cuales", "cuyo", "cuya",
    "si", "aunque", "porque", "pues", "cuando", "mientras", "como",
    "de", "del", "a", "al", "en", "con", "por", "para", "sin",
    "sobre", "entre", "desde", "hasta", "hacia", "segun", "tras",
    "el", "la", "los", "las", "lo", "un", "una", "unos", "unas",
    "le", "les", "se", "me", "te", "nos", "os",
    "mi", "mis", "tu", "tus", "su", "sus", "no",
    "tanto", "cuanto", "ahora", "entonces", "asimismo", "aun",
}

# Tails that govern something in the NEXT clause: pull that complement back in.
AUXILIARY_TAIL = {
    "he", "has", "ha", "hemos", "han", "habia", "habias", "habian",
    "hube", "hubo", "hubieron", "habre", "habra", "habran",
    "soy", "eres", "es", "somos", "son", "era", "eras", "eran",
    "fue", "fui", "fuiste", "fueron", "sea", "seas", "sean",
    "sere", "sera", "seran", "seria", "serian",
    "estoy", "esta", "estan", "estaba", "estaban", "estuvo",
    "puede", "pueden", "podia", "podian", "debe", "deben",
}

# A boundary is never moved further than this; anything needing more is a real
# clause-structure question for Observer, not a packaging nudge.
MAX_SHIFT = 8

# Verses where the heuristic cannot reach the right cut because the spans nest
# rather than merely bleed — one row swallows its neighbours, so there is no
# boundary to nudge. The Spanish says plainly where the clauses divide, so the
# division is written out here per verse: {clause id: (first, last)}, plus rows
# to drop because they duplicate a sibling with no text of their own.
#
# Read each line against the verse before changing it. These are editorial cuts,
# not arithmetic — they are listed so a reviewer can disagree with a specific one
# instead of re-deriving all of them.
CURATED: dict[str, dict[str, tuple[int, int]]] = {
    # «…sea descuartizado, | y su casa sea puesta por muladar; | por cuanto no hay dios…»
    "3:29": {"3:29:2": (0, 24), "3:29:10": (25, 31), "3:29:33": (32, 41)},
    # «…pues creció tu grandeza, | y ha llegado hasta el cielo…»
    "4:22": {"4:22:6": (0, 14), "4:22:10": (15, 29)},
    # «…y con las bestias del campo | será tu morada…»
    "4:32": {"4:32:12": (0, 12), "4:32:29": (13, 49)},
    # Four clauses, one per finite: alcé | me fue vuelto | bendije/alabé/glorifiqué | su señorío es
    "4:34": {
        "4:34:7": (0, 11),
        "4:34:10": (12, 17),
        "4:34:13": (18, 30),
        "4:34:17": (31, 42),
    },
    # «…y en parte de hierro, | el reino será dividido; | mas habrá…»
    "2:41": {"2:41:2": (0, 21), "2:41:15": (22, 25), "2:41:20": (26, 39), "2:41:25": (40, 45)},
    # «…se halló luz, | y entendimiento y mayor sabiduría.»
    "5:14": {"5:14:1": (0, 20), "5:14:12": (21, 25)},
    # «…tus mujeres y tus concubinas, | bebieron vino en ellos: | por cuanto…»
    "5:23": {"5:23:4": (0, 29), "5:23:8": (30, 33), "5:23:34": (34, 71), "5:23:43": (72, 77)},
    # «…le pesó en gran manera, | y sobre Daniel puso cuidado para librarlo; | y hasta puestas…»
    "6:14": {"6:14:5": (0, 10), "6:14:11": (11, 17), "6:14:17": (18, 25)},
    # «…de todos los otros reinos, | y a toda la tierra devorará, | y la hollará, | y la despedazará.»
    "7:23": {
        "7:23:2": (0, 4),
        "7:23:8": (5, 11),
        "7:23:11": (12, 20),
        "7:23:13": (21, 26),
        "7:23:15": (27, 29),
        "7:23:18": (30, 32),
    },
    # «…será diferente de los primeros, | y a tres reyes derribará.»
    "7:24": {"7:24:7": (0, 16), "7:24:9": (17, 23), "7:24:12": (24, 28)},
    # «Y hablará palabras contra el Altísimo, | y a los santos del Altísimo quebrantará, | y pensará…»
    "7:25": {"7:25:5": (0, 5), "7:25:8": (6, 12), "7:25:13": (13, 37)},
    # «Y yo oí, mas no entendí. Y dije: Señor mío, | ¿qué será el fin de estas cosas?»
    "12:8": {"12:8:2": (0, 9), "12:8:5": (10, 16)},
    # «…irán de aquí para allá muchos, | y se multiplicará la ciencia.» — the
    # subject belongs with its verb, not stranded as «la ciencia.»
    "12:4": {"12:4:3": (0, 20), "12:4:12": (21, 25)},
    # 5:27 is a dependent line, not an H4, but the Step 0 read flagged it: the
    # claim was cut at «Pesado has», stranding its own participle.
    "5:27": {"5:27:2": (0, 5), "5:27:4": (6, 9)},
    # «Sepas pues y entiendas, que … y sesenta y dos semanas; | se tornará a
    # edificar la plaza y el foso en tiempos angustiosos.»
    "9:25": {"9:25:1": (0, 28), "9:25:18": (29, 40)},
}

# 9:25 is not a span defect — the span was always right. The clause was marked a
# statement whose content belongs to 9:24, so the Compiler emitted it as a
# dependent line and only its first four words survived: 26 words of the seventy-
# weeks verse never reached the student, and Gabriel's own command was buried.
#
# «Sepas pues y entiendas» is not the content of 9:24; it is the command that
# opens the revelation, and the content clause is what follows it. Marking it
# imperative and cutting the expressed-parent link makes it an independent root,
# which restores both the imperative and the missing text.
ROOT_PROMOTIONS = {
    "9:25:1": {
        "mood": "imperative",
        "clear_expressed_parent": True,
        "why": "תֵדַ֨ע — Gabriel's command opening the seventy weeks, not 9:24 content",
    },
}

# Rows that duplicate a sibling and carry no text of their own once the curated
# cuts above are in place.
CURATED_DROPS = [
    "9:25:2", "9:25:17",
    "12:8:4",
    "3:29:24", "4:34:16", "7:23:19", "7:24:17", "7:25:9",
    "4:32:15", "4:32:20", "4:32:28", "4:22:7", "4:22:9",
]


def fold(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c)
    )


def bare(tok: str) -> str:
    return fold(re.sub(r"[^\w]+", "", tok))


def load_lbf(path: Path) -> dict[tuple[int, int], list[str]]:
    verses: dict[tuple[int, int], list[str]] = {}
    cur = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal cur, buf
        if cur is not None:
            verses[cur] = " ".join(buf).strip().split()
        buf = []

    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^###\s+(\d+):(\d+)\s*$", line)
        if m:
            flush()
            cur = (int(m.group(1)), int(m.group(2)))
            continue
        if cur and line.strip() and not line.startswith("#") and not line.startswith(">"):
            buf.append(line.strip())
    flush()
    return verses


def token_indices(span: list[str]) -> tuple[tuple[int, int], list[int]] | None:
    if not span:
        return None
    parts = [tuple(int(x) for x in t.split(":")) for t in span]
    ch, vs = parts[0][0], parts[0][1]
    idx = sorted({p[2] for p in parts if (p[0], p[1]) == (ch, vs)})
    return (ch, vs), idx


def repack(
    prog: dict,
    verses: dict[tuple[int, int], list[str]],
    scope: set[str] | None = None,
) -> tuple[dict, list[str]]:
    """Repack spans. With `scope`, only verses holding one of those clause ids
    are touched, and only a scoped row may be dropped — that keeps the pass to
    the defects a student actually reads while the wider fill debt stays visible.
    """
    clauses = prog["data"][CLAUSES_KEY]
    report: list[str] = []

    by_verse: dict[tuple[int, int], list[tuple[int, int, str]]] = {}
    for cid, entry in clauses.items():
        parsed = token_indices(entry.get("selectedSpan") or [])
        if parsed is None:
            continue
        key, idx = parsed
        by_verse.setdefault(key, []).append((idx[0], idx[-1], cid))

    drops: list[str] = []
    changes: dict[str, tuple[int, int]] = {}

    for key in sorted(by_verse):
        ch, vs = key
        toks = verses.get(key)
        if not toks:
            continue
        rows = sorted(by_verse[key])
        if scope is not None and not any(cid in scope for (_lo, _hi, cid) in rows):
            continue

        # 1. Drop degenerate duplicates: a one-token row whose token another row
        #    already covers. It has no Spanish text of its own to show.
        kept: list[tuple[int, int, str]] = []
        for (lo, hi, cid) in rows:
            if scope is not None and cid not in scope:
                kept.append((lo, hi, cid))
                continue
            if hi == lo and any(
                o_lo <= lo <= o_hi and o_cid != cid and (o_hi > o_lo)
                for (o_lo, o_hi, o_cid) in rows
            ):
                drops.append(f"{ch}:{vs}  {cid}  [{lo}] *{toks[lo]}*  (cubierto por vecino)")
                continue
            kept.append((lo, hi, cid))

        # Identical one-token rows with no wider neighbour: keep the first only.
        seen_single: dict[int, str] = {}
        pruned: list[tuple[int, int, str]] = []
        for (lo, hi, cid) in kept:
            if hi == lo and (scope is None or cid in scope):
                if lo in seen_single:
                    drops.append(
                        f"{ch}:{vs}  {cid}  [{lo}] *{toks[lo]}*  (duplica {seen_single[lo]})"
                    )
                    continue
                seen_single[lo] = cid
            pruned.append((lo, hi, cid))
        if not pruned:
            continue

        # 2. Repair only the defective boundaries between two scoped rows.
        #    Re-tiling the whole verse would re-slice rows that are out of scope
        #    and turn clean `-` lines into fresh one-word garbage, so every row
        #    the pass does not have a reason to touch keeps the span it has.
        pruned.sort()
        cur = {cid: [lo, hi] for (lo, hi, cid) in pruned}
        order = [cid for (_lo, _hi, cid) in pruned]

        # Seam bleed is resolved between consecutive *scoped* rows: the rows in
        # between are `-` lines whose spans nest inside them, and pairing against
        # those would break the chain before it reaches the next claim.
        scoped = [cid for cid in order if scope is None or cid in scope]
        for a_id, b_id in zip(scoped, scoped[1:]):
            a, b = cur[a_id], cur[b_id]
            if b[0] <= a[1] < b[1]:
                b[0] = a[1] + 1

        # A dangling tail is repaired for any scoped row, even when the row that
        # holds the complement is a dependent line: the claim is what a student
        # reads, and `Y el ejército le fue` is not a claim.
        for a_id in scoped:
            a = cur[a_id]
            nxt = [cid for cid in order if cid != a_id and cur[cid][0] == a[1] + 1]
            if not nxt:
                continue
            b = cur[max(nxt, key=lambda c: cur[c][1])]
            if b[1] <= a[1] + 1:
                continue

            # Split periphrasis: this claim ends on an auxiliary whose complement
            # opens the next one. Pull the complement back where it belongs.
            shifted = 0
            while shifted < MAX_SHIFT and bare(toks[a[1]]) in AUXILIARY_TAIL and b[0] < b[1]:
                a[1] += 1
                b[0] += 1
                shifted += 1
                if bare(toks[a[1]]) in CONNECTOR_TAIL:
                    a[1] -= 1
                    b[0] -= 1
                    break

            # Dangling connector: it opens the next clause, so hand it over.
            shifted = 0
            while shifted < MAX_SHIFT and a[0] < a[1] and bare(toks[a[1]]) in CONNECTOR_TAIL:
                a[1] -= 1
                b[0] -= 1
                shifted += 1

        for cid, (lo, hi) in cur.items():
            if lo > hi or lo >= len(toks) or hi >= len(toks):
                continue
            changes[cid] = (lo, hi)

    # Curated verses override the heuristic entirely — they are the cases it is
    # documented as unable to reach.
    n_curated = 0
    for verse, table in CURATED.items():
        ch, vs = (int(x) for x in verse.split(":"))
        toks = verses.get((ch, vs))
        if not toks:
            continue
        for cid, (lo, hi) in table.items():
            if cid not in clauses:
                continue
            if hi >= len(toks):
                report.append(f"  AVISO {cid}: [{lo}-{hi}] excede el versículo ({len(toks)} palabras)")
                continue
            changes[cid] = (lo, hi)
            n_curated += 1
    for cid in CURATED_DROPS:
        if cid in clauses:
            drops.append(f"curado  {cid}  (duplica un hermano tras el corte curado)")
            changes.pop(cid, None)

    # Write spans back.
    n_span = 0
    for cid, (lo, hi) in changes.items():
        entry = clauses.get(cid)
        if not entry:
            continue
        ch, vs, _ = cid.split(":")
        parsed = token_indices(entry.get("selectedSpan") or [])
        if parsed is None:
            continue
        (sch, svs), old = parsed
        new = [f"{sch}:{svs}:{i}" for i in range(lo, hi + 1)]
        if new != entry["selectedSpan"]:
            entry["selectedSpan"] = new
            n_span += 1

    # Root promotions: mood store + expressed-parent link.
    review = prog["data"].get(
        "the-reader:spanish-clause-builder:daniel:statement-command-review:v1", {}
    )
    imperatives = prog["data"].get("roots:daniel:brick2:mood:imperativeCandidates", [])
    statements = prog["data"].get("roots:daniel:brick2c:mood:statementCandidates", [])
    for cid, spec in ROOT_PROMOTIONS.items():
        if cid not in clauses:
            continue
        if spec.get("mood") == "imperative":
            if cid in statements:
                statements.remove(cid)
            if cid not in imperatives:
                imperatives.append(cid)
                imperatives.sort()
        if spec.get("clear_expressed_parent"):
            obs = review.get(cid)
            if obs:
                obs["isWhatWasExpressed"] = "no"
                obs["expressedParentClauseId"] = ""
        report.append(f"raíz promovida: {cid} — {spec['why']}")

    dropped_ids = {line.split()[1] for line in drops}
    for cid in dropped_ids:
        clauses.pop(cid, None)
        for key in PARALLEL_KEYS:
            store = prog["data"].get(key)
            if isinstance(store, dict):
                store.pop(cid, None)

    report.append(f"filas eliminadas (degeneradas): {len(dropped_ids)}")
    report.extend("  " + d for d in sorted(drops))
    report.append(f"spans reescritos: {n_span}")
    return prog, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--progress", type=Path, default=PROGRESS)
    ap.add_argument("--lbf", type=Path, default=LBF)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--scope",
        type=Path,
        help="file of clause ids (one per line) to limit the pass to — normally "
        "the ids that surface as H4 in the compiled manual",
    )
    args = ap.parse_args()

    if not args.apply and not args.dry_run:
        ap.error("pass --dry-run or --apply")

    scope = None
    if args.scope:
        scope = {l.strip() for l in args.scope.read_text(encoding="utf-8").splitlines() if l.strip()}

    prog = json.loads(args.progress.read_text(encoding="utf-8"))
    verses = load_lbf(args.lbf)
    prog, report = repack(prog, verses, scope)

    print("\n".join(report))

    if args.apply:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = args.progress.with_suffix(f".bak-{stamp}.json")
        shutil.copy2(args.progress, backup)
        notes = prog.setdefault("fillNotes", {})
        notes["repack"] = {
            "script": "scripts/repack-daniel-clause-spans.py",
            "at": datetime.now(timezone.utc).isoformat(),
            "note": "Degenerate rows dropped; spans tiled per verse; boundaries moved off connector/auxiliary tails.",
        }
        args.progress.write_text(
            json.dumps(prog, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\nescrito {args.progress}\nrespaldo {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
