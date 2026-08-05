#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Workbench for aligning LBF Spanish to OSHB Hebrew tokens, verse by verse.

Two modes:

``show``   print a verse's Hebrew tokens (surface / morphology / gloss) beside its
           LBF Spanish words with 0-based indices, plus whatever the current
           alignment claims. This is the view you align against.

``check``  validate a proposed alignment for a chapter held in
           ``data/lbf/ot/<book>.align.<ch>.json`` and report both directions:
             * every Hebrew token mapped to >=1 Spanish span
             * every Spanish word covered by >=1 record  <- the invariant the
               gloss-seed violated for 30% of Daniel
Usage:
    python3 scripts/lbf-align-workbench.py show 1 1 5
    python3 scripts/lbf-align-workbench.py check 1
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CGV_DATA = ROOT.parent / "cgv-data"
TOKENS = CGV_DATA / "interlinears" / "OT" / "daniel.tokens.jsonl"
LBF = ROOT / "data" / "lbf" / "ot" / "daniel.md"
ALIGN = ROOT / "data" / "lbf" / "ot" / "daniel.alignment.json"

TOKEN_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’-]*")

MORPH_HINT = {
    "R": "prep", "Ncfsc": "sust.f.sg.constr", "Ncmsc": "sust.m.sg.constr",
    "Vqw3ms": "verbo qal wayyiqtol 3ms", "Vqp3ms": "verbo qal perfecto 3ms",
    "Np": "nombre propio", "Ac": "numeral", "Td": "artículo", "C": "conj",
    "Sp3ms": "sufijo pron. 3ms", "Sp3fs": "sufijo pron. 3fs",
}


def mt_to_protestant(ch: int, vs: int) -> tuple[int, int]:
    """OSHB/MT chapter:verse → LBF Protestant display refs (Daniel only).

    MT 3:31–33 → 4:1–3; MT 4:n → 4:(n+3);
    MT 6:1 → 5:31; MT 6:n (n≥2) → 6:(n−1).
    """
    if ch == 3 and vs >= 31:
        return 4, vs - 30
    if ch == 4:
        return 4, vs + 3
    if ch == 6 and vs == 1:
        return 5, 31
    if ch == 6 and vs >= 2:
        return 6, vs - 1
    return ch, vs


def load_verses() -> dict[tuple[int, int], str]:
    text = LBF.read_text()
    out: dict[tuple[int, int], str] = {}
    for m in re.finditer(r"^### (\d+):(\d+)\n\n(.*)$", text, re.M):
        out[(int(m.group(1)), int(m.group(2)))] = m.group(3)
    return out


def load_tokens() -> dict[tuple[int, int], list[dict]]:
    """Tokens keyed by Protestant (LBF) chapter:verse."""
    out: dict[tuple[int, int], list[dict]] = {}
    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        key = mt_to_protestant(int(r["ch"]), int(r["vs"]))
        out.setdefault(key, []).append(r)
    for v in out.values():
        v.sort(key=lambda r: int(r["w"]))
    return out


def current_alignment() -> dict[tuple[int, int], list[dict]]:
    """Production ``*.alignment.json`` records (legacy overlay for ``show``)."""
    data = json.loads(ALIGN.read_text())
    out: dict[tuple[int, int], list[dict]] = {}
    for r in data.get("records", []):
        out.setdefault((r["chapter"], r["verse"]), []).append(r)
    return out


def hand_alignment(ch: int) -> dict[int, list[dict]] | None:
    path = ROOT / "data" / "lbf" / "ot" / f"daniel.align.{ch}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    return {int(v): rows for v, rows in data.get("verses", {}).items()}


def show(ch: int, first: int, last: int) -> None:
    verses, tokens, cur = load_verses(), load_tokens(), current_alignment()
    hand = hand_alignment(ch)
    for v in range(first, last + 1):
        key = (ch, v)
        if key not in verses:
            continue
        words = TOKEN_RE.findall(verses[key])
        print("=" * 78)
        print(f"{ch}:{v}   {len(tokens.get(key, []))} tokens hebreos · {len(words)} palabras españolas")
        print("=" * 78)
        print("LBF:", verses[key])
        print("\n  español (índice 0-based):")
        line = "   "
        for i, w in enumerate(words):
            piece = f"{i}={w} "
            if len(line) + len(piece) > 76:
                print(line)
                line = "   "
            line += piece
        print(line)
        print("\n  hebreo:")
        for t in tokens.get(key, []):
            morph = t.get("morph", "")
            hint = MORPH_HINT.get(morph.lstrip("HA"), "")
            print(f"    w{int(t['w']):>3} {t['surface']:<24} {morph:<14} {t.get('es',''):<22} {hint}")
        covered: set[int] = set()
        if hand is not None and v in hand:
            rows = hand[v]
            for row in rows:
                covered.update(row.get("es", []))
            label = f"mano ({len(rows)} filas)"
        else:
            recs = cur.get(key, [])
            for r in recs:
                idxs = r.get("lbfWordIndexes")
                if idxs:
                    covered.update(idxs)
                    continue
                n = len(TOKEN_RE.findall(r.get("lbfSurface") or ""))
                idx = r.get("lbfWordIndex")
                if idx is None:
                    continue
                for k in range(n):
                    covered.add(idx - k)
            label = f"production ({len(recs)} registros)"
        missing = [i for i in range(len(words)) if i not in covered]
        print(f"\n  alineación {label}: "
              f"{len(words) - len(missing)}/{len(words)} palabras cubiertas")
        if missing:
            print(f"  SIN ALINEAR: {[(i, words[i]) for i in missing]}")
        print()


def check(ch: int) -> int:
    verses, tokens = load_verses(), load_tokens()
    path = ROOT / "data" / "lbf" / "ot" / f"daniel.align.{ch}.json"
    if not path.exists():
        print(f"no existe {path.name}")
        return 1
    proposed = json.loads(path.read_text())
    problems: list[str] = []
    total_w = total_c = 0
    for v_str, rows in sorted(proposed["verses"].items(), key=lambda kv: int(kv[0])):
        v = int(v_str)
        key = (ch, v)
        words = TOKEN_RE.findall(verses[key])
        toks = tokens.get(key, [])
        total_w += len(words)
        covered: set[int] = set()
        mapped: set[int] = set()
        for row in rows:
            for i in row["es"]:
                if not 0 <= i < len(words):
                    problems.append(f"{ch}:{v} índice español {i} fuera de rango (0..{len(words)-1})")
                covered.add(i)
            for w in row["he"]:
                if not 1 <= w <= len(toks):
                    problems.append(f"{ch}:{v} token hebreo {w} fuera de rango (1..{len(toks)})")
                mapped.add(w)
        total_c += len({i for i in covered if 0 <= i < len(words)})
        miss_es = [(i, words[i]) for i in range(len(words)) if i not in covered]
        miss_he = [w for w in range(1, len(toks) + 1) if w not in mapped]
        if miss_es:
            problems.append(f"{ch}:{v} español sin alinear: {miss_es}")
        if miss_he:
            problems.append(f"{ch}:{v} tokens hebreos sin mapear: {miss_he}")
    print(f"capítulo {ch}: {total_c}/{total_w} palabras españolas cubiertas "
          f"({100*total_c/total_w:.1f}%)")
    if problems:
        print(f"\n{len(problems)} problemas:")
        for p in problems[:60]:
            print("  " + p)
        return 1
    print("PASS — cobertura completa en ambas direcciones")
    return 0


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    mode = sys.argv[1]
    if mode == "show":
        ch = int(sys.argv[2])
        first = int(sys.argv[3]) if len(sys.argv) > 3 else 1
        last = int(sys.argv[4]) if len(sys.argv) > 4 else first
        show(ch, first, last)
        return 0
    if mode == "check":
        return check(int(sys.argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
