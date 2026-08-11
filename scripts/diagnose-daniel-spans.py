#!/usr/bin/env python3
"""Span-level diagnostic for the Daniel clause store.

The H4 claim a student reads is just the LBF Spanish words named by a clause's
`selectedSpan`. So every packaging defect Arquitecto sees in the manual —
truncated claims, seam bleed, one-word H4s, missing Scripture — is visible here
*before* Generate runs, as overlapping / short / gappy spans inside one verse.

  python3 scripts/diagnose-daniel-spans.py
  python3 scripts/diagnose-daniel-spans.py --verse 4:34 --verse 9:25
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRESS = ROOT / "data/lbf/ot/daniel-progress-filled.json"
LBF = ROOT / "data/lbf/ot/daniel.md"
CLAUSES_KEY = "the-reader:spanish-clause-builder:daniel:v3"

# A claim that ends on one of these leans into the next clause. Superset of the
# recut pass: auxiliaries and copulas are included, because "Y el ejército le
# fue" does not read aloud alone even though `fue` is a finite form.
DANGLING_TAIL = {
    "y", "e", "o", "u", "ni", "mas", "pero", "empero", "sino",
    "que", "quien", "quienes", "cual", "cuales", "cuyo", "cuya",
    "si", "aunque", "porque", "pues", "cuando", "mientras", "como",
    "de", "del", "a", "al", "en", "con", "por", "para", "sin",
    "sobre", "entre", "desde", "hasta", "hacia", "segun", "tras",
    "el", "la", "los", "las", "lo", "un", "una", "unos", "unas",
    "le", "les", "se", "me", "te", "nos", "os",
    "mi", "mis", "tu", "tus", "su", "sus", "no",
    # auxiliaries / copulas the recut pass deliberately allowed
    "he", "ha", "han", "habia", "habian", "hemos",
    "fue", "fueron", "era", "eran", "es", "son", "sea", "sean",
    "sera", "seran", "estaba", "estan", "tanto", "cuanto",
    "ahora", "entonces", "asimismo", "aun",
}


def fold(s: str) -> str:
    import unicodedata

    return "".join(
        c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c)
    )


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


def span_range(span: list[str]) -> tuple[int, int, int, int] | None:
    """(ch, vs, first_idx, last_idx) — spans never cross a verse."""
    if not span:
        return None
    parts = [tuple(int(x) for x in t.split(":")) for t in span]
    ch, vs = parts[0][0], parts[0][1]
    idx = sorted(p[2] for p in parts if (p[0], p[1]) == (ch, vs))
    return ch, vs, idx[0], idx[-1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--progress", type=Path, default=PROGRESS)
    ap.add_argument("--lbf", type=Path, default=LBF)
    ap.add_argument("--verse", action="append", default=[])
    ap.add_argument("--show-tokens", action="store_true")
    args = ap.parse_args()

    prog = json.loads(args.progress.read_text(encoding="utf-8"))
    clauses = prog["data"][CLAUSES_KEY]
    verses = load_lbf(args.lbf)

    want = set()
    for v in args.verse:
        ch, vs = v.split(":")
        want.add((int(ch), int(vs)))

    by_verse: dict[tuple[int, int], list[tuple[int, int, str]]] = {}
    for cid, entry in clauses.items():
        r = span_range(entry.get("selectedSpan") or [])
        if r is None:
            by_verse.setdefault((0, 0), []).append((0, 0, cid))
            continue
        ch, vs, lo, hi = r
        by_verse.setdefault((ch, vs), []).append((lo, hi, cid))

    n_overlap = n_short = n_dangling = n_gap = 0
    for key in sorted(by_verse):
        if want and key not in want:
            continue
        ch, vs = key
        toks = verses.get(key, [])
        rows = sorted(by_verse[key])
        problems: list[str] = []

        for (lo, hi, cid) in rows:
            text = " ".join(toks[lo : hi + 1])
            width = hi - lo + 1
            if width == 1:
                problems.append(f"  CORTO   {cid}  [{lo}]           *{text}*")
                n_short += 1
            last = fold(re.sub(r"[^\w]+$", "", text.split()[-1] if text.split() else ""))
            if last in DANGLING_TAIL and width > 1:
                problems.append(f"  COLA    {cid}  [{lo}-{hi}]  …{' '.join(text.split()[-6:])}")
                n_dangling += 1

        for (a, b) in zip(rows, rows[1:]):
            if b[0] <= a[1]:
                shared = " ".join(toks[b[0] : min(a[1], b[1]) + 1])
                n_overlap += 1
                problems.append(
                    f"  SOLAPA  {a[2]} [{a[0]}-{a[1]}] ∩ {b[2]} [{b[0]}-{b[1]}]"
                    f"  → «{shared[:70]}»"
                )

        covered = set()
        for (lo, hi, _) in rows:
            covered |= set(range(lo, hi + 1))
        missing = sorted(set(range(len(toks))) - covered)
        if missing and toks:
            runs: list[list[int]] = []
            for i in missing:
                if runs and i == runs[-1][-1] + 1:
                    runs[-1].append(i)
                else:
                    runs.append([i])
            for run in runs:
                if len(run) >= 3:
                    n_gap += 1
                    problems.append(
                        f"  HUECO   [{run[0]}-{run[-1]}]  «{' '.join(toks[run[0]:run[-1]+1])[:70]}»"
                    )

        if problems or (want and key in want):
            print(f"\n{ch}:{vs}  ({len(toks)} palabras, {len(rows)} cláusulas)")
            if args.show_tokens or (want and key in want):
                print("  " + "  ".join(f"{i}:{t}" for i, t in enumerate(toks)))
            for p in problems:
                print(p)

    print(
        f"\nTotales — solapes: {n_overlap} · cortos: {n_short} · "
        f"colas: {n_dangling} · huecos(≥3): {n_gap}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
